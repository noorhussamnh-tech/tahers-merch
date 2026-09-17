-- Order tracking, and the small amount of administration this shop needs.

-- ------------------------------------------------------------------ tracking

-- Returns one order to somebody who knows both its number and the mobile
-- number it was placed with.
--
-- The privacy design is in what this function selects, not in what the caller
-- asks for. There is no row to over-fetch from: the result is built field by
-- field, and the fields that are not built cannot leak. Absent by intention:
-- the internal id, the email address, the street address, the internal notes,
-- and any mention of another order.
--
-- A wrong pair returns null rather than "no such order" versus "wrong
-- number", because distinguishing those two would confirm that an order
-- number exists to somebody guessing at them.
create or replace function tc_track_order(p_order_number text, p_mobile text)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  o    tc_orders%rowtype;
  zone tc_shipping_zones%rowtype;
begin
  select * into o
    from tc_orders
   where upper(order_number) = upper(btrim(p_order_number))
     and customer_mobile = btrim(p_mobile);

  if not found then
    return null;
  end if;

  select * into zone
    from tc_shipping_zones
   where governorate = o.address ->> 'governorate';

  return jsonb_build_object(
    'orderNumber',      o.order_number,
    'paymentStatus',    o.payment_status,
    'fulfilmentStatus', o.fulfilment_status,
    'placedAt',         o.created_at,
    'total',            o.total_piastres,
    -- Governorate only. Not the street, building, floor or apartment: the
    -- customer knows where they live, and a tracking page that prints a home
    -- address is a tracking page worth guessing order numbers at.
    'governorate',      o.address ->> 'governorate',
    'expectedMinDays',  zone.min_days,
    'expectedMaxDays',  zone.max_days,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object('name', i.name_ar, 'quantity', i.quantity)
                       order by i.slug)
        from tc_order_items i where i.order_id = o.id
    ), '[]'::jsonb),
    -- Status and timestamp only. The `note` column is internal and stays so.
    'timeline', coalesce((
      select jsonb_agg(jsonb_build_object('status', h.status, 'at', h.created_at)
                       order by h.created_at)
        from tc_order_status_history h where h.order_id = o.id
    ), '[]'::jsonb)
  );
end;
$$;

comment on function tc_track_order is
  'Public order tracking. Requires order number AND mobile number, and returns a deliberately narrow projection.';

-- Called through the server function, which rate-limits it first. Revoked
-- from PUBLIC as well as from the named roles: PUBLIC is where the default
-- EXECUTE grant lives, and anon inherits it.
revoke execute on function tc_track_order(text, text) from public, anon, authenticated;

-- --------------------------------------------------------------------- admin

-- Every function below re-checks tc_is_admin() itself. They are SECURITY
-- DEFINER, so the RLS policies that would otherwise protect these tables do
-- not apply inside them -- the check has to be explicit, and it is the first
-- statement in each one.

create or replace function tc_admin_update_product(
  p_slug   text,
  p_price  integer default null,
  p_stock  integer default null,
  p_active boolean default null
) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  p tc_products%rowtype;
begin
  if not tc_is_admin() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  select * into p from tc_products where slug = p_slug for update;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0001';
  end if;

  -- Stock cannot be set below what is already reserved for unpaid orders:
  -- those units are spoken for, and lowering the count under them would put
  -- the table's own invariant into violation.
  if p_stock is not null and p_stock < p.reserved_quantity then
    raise exception 'stock_below_reserved:%', p.reserved_quantity using errcode = 'P0001';
  end if;

  update tc_products
     set price_piastres = coalesce(p_price, price_piastres),
         stock_quantity = coalesce(p_stock, stock_quantity),
         active         = coalesce(p_active, active)
   where id = p.id;

  return jsonb_build_object('slug', p.slug, 'updated', true);
end;
$$;

create or replace function tc_admin_update_shipping_zone(
  p_governorate   text,
  p_fee           integer,
  p_cod_available boolean,
  p_min_days      integer default null,
  p_max_days      integer default null
) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
begin
  if not tc_is_admin() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  insert into tc_shipping_zones (governorate, fee_piastres, cod_available, min_days, max_days)
       values (p_governorate, p_fee, p_cod_available, p_min_days, p_max_days)
  on conflict (governorate) do update
     set fee_piastres  = excluded.fee_piastres,
         cod_available = excluded.cod_available,
         min_days      = excluded.min_days,
         max_days      = excluded.max_days;

  return jsonb_build_object('governorate', p_governorate, 'updated', true);
end;
$$;

-- Moves an order along fulfilment and records who-knows-what in the history.
create or replace function tc_admin_update_fulfilment(
  p_order_number text,
  p_status       text,
  p_note         text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  o tc_orders%rowtype;
  item record;
begin
  if not tc_is_admin() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  select * into o from tc_orders where order_number = p_order_number for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;

  -- Cancelling returns the units to stock, whichever way they left it. A cash
  -- order had them deducted at checkout; an unpaid online order still has
  -- them on hold. Both are put back, and only once.
  if p_status = 'cancelled' and o.fulfilment_status <> 'cancelled' then
    for item in select * from tc_order_items where order_id = o.id order by slug loop
      if o.stock_committed then
        update tc_products set stock_quantity = stock_quantity + item.quantity
         where id = item.product_id;
      else
        update tc_products set reserved_quantity = greatest(reserved_quantity - item.quantity, 0)
         where id = item.product_id;
      end if;
    end loop;

    update tc_orders
       set stock_committed = false,
           reservation_expires_at = null,
           payment_status = case when payment_status = 'pending' then 'cancelled'
                                 else payment_status end
     where id = o.id;
  end if;

  update tc_orders set fulfilment_status = p_status where id = o.id;

  insert into tc_order_status_history (order_id, status, note)
       values (o.id, p_status, p_note);

  return jsonb_build_object('orderNumber', o.order_number, 'status', p_status);
end;
$$;

-- The admin order list. Searches by order number or mobile number; returns
-- the full record, because an administrator is entitled to it.
create or replace function tc_admin_orders(
  p_search text default null,
  p_limit  integer default 50,
  p_offset integer default 0
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  needle text := nullif(btrim(coalesce(p_search, '')), '');
  rows   jsonb;
begin
  if not tc_is_admin() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(row_json order by created_at desc), '[]'::jsonb)
    into rows
    from (
      select o.created_at,
             jsonb_build_object(
               'orderNumber',      o.order_number,
               'customerName',     o.customer_name,
               'customerMobile',   o.customer_mobile,
               'customerEmail',    o.customer_email,
               'address',          o.address,
               'paymentMethod',    o.payment_method,
               'paymentStatus',    o.payment_status,
               'fulfilmentStatus', o.fulfilment_status,
               'subtotal',         o.subtotal_piastres,
               'shippingFee',      o.shipping_piastres,
               'discount',         o.discount_piastres,
               'total',            o.total_piastres,
               'paymobOrderId',    o.paymob_order_id,
               'paymobTransactionId', o.paymob_transaction_id,
               'placedAt',         o.created_at,
               'lines', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'name', i.name_ar, 'quantity', i.quantity,
                          'unitPrice', i.unit_price_piastres, 'lineTotal', i.line_total_piastres
                        ) order by i.slug)
                   from tc_order_items i where i.order_id = o.id
               ), '[]'::jsonb)
             ) as row_json
        from tc_orders o
       where needle is null
          or upper(o.order_number) like '%' || upper(needle) || '%'
          or o.customer_mobile like '%' || needle || '%'
       order by o.created_at desc
       limit greatest(least(p_limit, 200), 1)
      offset greatest(p_offset, 0)
    ) as page;

  return rows;
end;
$$;

-- The admin product view, which unlike the public one shows inactive products
-- and the reservation count behind the available figure.
create or replace function tc_admin_products() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if not tc_is_admin() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'slug',      slug,
             'name',      name_ar,
             'price',     price_piastres,
             'stock',     stock_quantity,
             'reserved',  reserved_quantity,
             'available', stock_quantity - reserved_quantity,
             'active',    active
           ) order by display_order)
      from tc_products
  ), '[]'::jsonb);
end;
$$;

-- Postgres grants EXECUTE on a new function to PUBLIC by default, and PUBLIC
-- includes anon. Revoking from `anon` alone would leave that inherited grant
-- in place, so every function is taken away from PUBLIC first and then handed
-- back to exactly one role. Each one re-checks tc_is_admin() internally too;
-- this is the outer fence, not the only one.
revoke execute on function tc_admin_update_product(text, integer, integer, boolean) from public, anon;
revoke execute on function tc_admin_update_shipping_zone(text, integer, boolean, integer, integer) from public, anon;
revoke execute on function tc_admin_update_fulfilment(text, text, text) from public, anon;
revoke execute on function tc_admin_orders(text, integer, integer) from public, anon;
revoke execute on function tc_admin_products() from public, anon;

grant execute on function tc_admin_update_product(text, integer, integer, boolean) to authenticated;
grant execute on function tc_admin_update_shipping_zone(text, integer, boolean, integer, integer) to authenticated;
grant execute on function tc_admin_update_fulfilment(text, text, text) to authenticated;
grant execute on function tc_admin_orders(text, integer, integer) to authenticated;
grant execute on function tc_admin_products() to authenticated;
grant execute on function tc_is_admin() to authenticated;
