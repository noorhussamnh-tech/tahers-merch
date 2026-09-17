-- Checkout.
--
-- Everything that decides what an order costs lives in this file, and the
-- browser supplies none of it. A checkout request says which slugs, how many,
-- and where to deliver. The database looks up the price, looks up the
-- shipping fee, resolves any discount code against settings the browser
-- cannot read, does the arithmetic, and reserves the stock -- all inside one
-- transaction, so a cap cannot be sold twice and an order cannot exist
-- without the inventory behind it.

-- --------------------------------------------------------------- rate limit

create or replace function tc_check_rate_limit(
  p_bucket         text,
  p_identifier     text,
  p_max            integer,
  p_window_seconds integer
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  -- Prefixed, because an unprefixed `window_start` would be ambiguous against
  -- the column of the same name in the ON CONFLICT clause below and Postgres
  -- refuses the statement rather than guessing which one is meant.
  v_window timestamptz;
  v_hits   integer;
begin
  -- Fixed window: the counter's key is the window it falls in, so an expired
  -- window is simply a row nothing writes to any more.
  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into tc_rate_limits as r (bucket, identifier, window_start, count)
       values (p_bucket, p_identifier, v_window, 1)
  on conflict (bucket, identifier, window_start)
    do update set count = r.count + 1
    returning r.count into v_hits;

  return v_hits <= p_max;
end;
$$;

comment on function tc_check_rate_limit is
  'Fixed-window counter shared by every serverless instance. False means the caller is over the limit.';

-- Housekeeping, safe to call from a scheduled job.
create or replace function tc_sweep_rate_limits(p_older_than interval default interval '1 day')
returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  removed integer;
begin
  delete from tc_rate_limits where window_start < now() - p_older_than;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

-- ----------------------------------------------------------------- discounts

-- Resolves a code to a piastre amount. Unknown, inactive or malformed codes
-- resolve to zero rather than raising: a customer mistyping a code should see
-- "that code did not apply", not an error page.
create or replace function tc_resolve_discount(p_code text, p_subtotal integer)
returns integer
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  codes    jsonb;
  entry    jsonb;
  discount integer;
begin
  if p_code is null or btrim(p_code) = '' then
    return 0;
  end if;

  select value into codes from tc_store_settings where key = 'discount_codes';
  if codes is null then
    return 0;
  end if;

  entry := codes -> upper(btrim(p_code));
  if entry is null or coalesce((entry ->> 'active')::boolean, false) = false then
    return 0;
  end if;

  discount := case entry ->> 'type'
    when 'fixed'   then (entry ->> 'value')::integer
    -- Integer division truncates, which rounds a percentage discount down.
    -- In the customer's favour would be rounding up; in the shop's favour is
    -- the safer default for a figure that must match the gateway exactly.
    when 'percent' then (p_subtotal * least((entry ->> 'value')::integer, 100)) / 100
    else 0
  end;

  -- Never more than the goods are worth; shipping is charged regardless.
  return least(greatest(coalesce(discount, 0), 0), p_subtotal);
end;
$$;

-- ------------------------------------------------------------- item folding

-- Normalises the incoming items array: drops anything malformed, folds
-- repeated slugs into one line, and orders by slug.
--
-- The ordering is not cosmetic. Two concurrent checkouts that lock the same
-- two products in opposite orders deadlock; locking in slug order every time
-- means they queue instead.
create or replace function tc_fold_items(p_items jsonb)
returns table (slug text, quantity integer)
language sql immutable as $$
  select item ->> 'slug' as slug,
         sum((item ->> 'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) as item
   where item ->> 'slug' is not null
     and coalesce((item ->> 'quantity')::integer, 0) > 0
   group by item ->> 'slug'
   order by item ->> 'slug'
$$;

-- ---------------------------------------------------------------- the quote

-- Prices a cart without creating anything. This is what the checkout summary
-- reads while the customer is still typing, so the figure on screen comes
-- from the same source as the figure they are charged.
create or replace function tc_quote_order(
  p_items         jsonb,
  p_governorate   text,
  p_discount_code text default null
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  zone     tc_shipping_zones%rowtype;
  lines    jsonb := '[]'::jsonb;
  subtotal integer := 0;
  discount integer := 0;
  item     record;
  product  tc_products%rowtype;
begin
  select * into zone from tc_shipping_zones where governorate = p_governorate;

  for item in select * from tc_fold_items(p_items) loop
    select * into product from tc_products where tc_products.slug = item.slug and active;
    if not found then
      raise exception 'product_unavailable:%', item.slug using errcode = 'P0001';
    end if;

    subtotal := subtotal + product.price_piastres * item.quantity;
    lines := lines || jsonb_build_object(
      'slug',       product.slug,
      'name',       product.name_ar,
      'quantity',   item.quantity,
      'unitPrice',  product.price_piastres,
      'lineTotal',  product.price_piastres * item.quantity,
      -- So the checkout can say "only 2 left" without a second round trip.
      'available',  product.stock_quantity - product.reserved_quantity
    );
  end loop;

  discount := tc_resolve_discount(p_discount_code, subtotal);

  return jsonb_build_object(
    'lines',       lines,
    'subtotal',    subtotal,
    'discount',    discount,
    -- Null shipping means "we do not ship there yet", which the checkout
    -- shows as a blocked destination rather than as free delivery.
    'shippingFee', case when zone.governorate is null then null else zone.fee_piastres end,
    'total',       case when zone.governorate is null then null
                        else subtotal - discount + zone.fee_piastres end,
    'codAvailable', coalesce(zone.cod_available, false),
    'minDays',      zone.min_days,
    'maxDays',      zone.max_days,
    'discountApplied', discount > 0
  );
end;
$$;

-- ------------------------------------------------------------- order summary

-- Everything the confirmation page is allowed to show. Used by checkout and
-- by the payment callback, so both describe an order the same way.
create or replace function tc_order_summary(p_order_id uuid)
returns jsonb
language sql stable security definer set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'orderNumber',      o.order_number,
    'paymentMethod',    o.payment_method,
    'paymentStatus',    o.payment_status,
    'fulfilmentStatus', o.fulfilment_status,
    'subtotal',         o.subtotal_piastres,
    'shippingFee',      o.shipping_piastres,
    'discount',         o.discount_piastres,
    'total',            o.total_piastres,
    'customerName',     o.customer_name,
    'address',          o.address,
    'placedAt',         o.created_at,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug',      i.slug,
               'name',      i.name_ar,
               'quantity',  i.quantity,
               'unitPrice', i.unit_price_piastres,
               'lineTotal', i.line_total_piastres
             ) order by i.slug)
        from tc_order_items i where i.order_id = o.id
    ), '[]'::jsonb)
  )
  from tc_orders o
  where o.id = p_order_id
$$;

-- --------------------------------------------------------------- place order

create or replace function tc_place_order(
  p_items           jsonb,
  p_customer        jsonb,
  p_address         jsonb,
  p_payment_method  text,
  p_idempotency_key uuid,
  p_discount_code   text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  existing_id   uuid;
  zone          tc_shipping_zones%rowtype;
  item          record;
  product       tc_products%rowtype;
  subtotal      integer := 0;
  discount      integer := 0;
  total         integer;
  new_order_id  uuid;
  hold_minutes  integer;
  expires_at    timestamptz;
  line_count    integer := 0;
begin
  -- 1. Idempotency. A repeat of a request we already honoured returns the
  --    order we already made, without touching stock a second time.
  select id into existing_id from tc_orders where idempotency_key = p_idempotency_key;
  if found then
    return tc_order_summary(existing_id);
  end if;

  if p_payment_method not in ('paymob', 'cod') then
    raise exception 'invalid_payment_method' using errcode = 'P0001';
  end if;

  -- 2. Destination. No zone, no order: we will not accept money for a
  --    delivery we have no fee or courier for.
  select * into zone from tc_shipping_zones
   where governorate = p_address ->> 'governorate';
  if not found then
    raise exception 'no_shipping_zone' using errcode = 'P0001';
  end if;

  if p_payment_method = 'cod' and not zone.cod_available then
    raise exception 'cod_unavailable' using errcode = 'P0001';
  end if;

  select coalesce((value #>> '{}')::integer, 30) into hold_minutes
    from tc_store_settings where key = 'reservation_minutes';
  hold_minutes := coalesce(hold_minutes, 30);

  -- 3. Price and reserve, one product at a time, locked in slug order.
  --
  --    FOR UPDATE is what makes this safe under concurrency: two customers
  --    racing for the last cap serialise here, and the second one reads the
  --    first one's reservation rather than the stale count it saw on the
  --    product page.
  for item in select * from tc_fold_items(p_items) loop
    select * into product
      from tc_products
     where tc_products.slug = item.slug and active
       for update;

    if not found then
      raise exception 'product_unavailable:%', item.slug using errcode = 'P0001';
    end if;

    if product.stock_quantity - product.reserved_quantity < item.quantity then
      raise exception 'insufficient_stock:%', item.slug using errcode = 'P0001';
    end if;

    subtotal := subtotal + product.price_piastres * item.quantity;
    line_count := line_count + 1;
  end loop;

  if line_count = 0 then
    raise exception 'empty_cart' using errcode = 'P0001';
  end if;

  discount := tc_resolve_discount(p_discount_code, subtotal);
  total := subtotal - discount + zone.fee_piastres;

  -- 4. The order itself.
  --
  --    Cash on delivery deducts stock now and never reserves: there is no
  --    payment step that can fail, so holding the unit in limbo would only
  --    make it unsellable. An online order reserves instead, and the units
  --    move out of stock only when a verified webhook says the money arrived.
  if p_payment_method = 'cod' then
    expires_at := null;
  else
    expires_at := now() + make_interval(mins => hold_minutes);
  end if;

  insert into tc_orders (
    order_number, customer_name, customer_mobile, customer_email, address,
    payment_method, payment_status, fulfilment_status,
    subtotal_piastres, shipping_piastres, discount_piastres, total_piastres,
    idempotency_key, stock_committed, reservation_expires_at
  ) values (
    tc_generate_order_number(),
    p_customer ->> 'fullName',
    p_customer ->> 'mobile',
    nullif(p_customer ->> 'email', ''),
    p_address,
    p_payment_method,
    'pending',
    'placed',
    subtotal, zone.fee_piastres, discount, total,
    p_idempotency_key,
    p_payment_method = 'cod',
    expires_at
  )
  returning id into new_order_id;

  -- 5. Lines and inventory movement, in the same slug order as the locks.
  for item in select * from tc_fold_items(p_items) loop
    select * into product from tc_products where tc_products.slug = item.slug;

    insert into tc_order_items (
      order_id, product_id, slug, name_ar, unit_price_piastres, quantity, line_total_piastres
    ) values (
      new_order_id, product.id, product.slug, product.name_ar,
      product.price_piastres, item.quantity, product.price_piastres * item.quantity
    );

    if p_payment_method = 'cod' then
      update tc_products
         set stock_quantity = stock_quantity - item.quantity
       where id = product.id;
    else
      update tc_products
         set reserved_quantity = reserved_quantity + item.quantity
       where id = product.id;
    end if;
  end loop;

  insert into tc_order_status_history (order_id, status, note)
       values (new_order_id, 'placed', 'Order created at checkout.');

  return tc_order_summary(new_order_id);
end;
$$;

comment on function tc_place_order is
  'The only way an order is created. Prices and totals are derived here, never accepted from the caller.';

-- Callable by the server function only; the browser never reaches these.
revoke execute on function tc_place_order(jsonb, jsonb, jsonb, text, uuid, text) from public, anon, authenticated;
revoke execute on function tc_check_rate_limit(text, text, integer, integer) from public, anon, authenticated;
revoke execute on function tc_sweep_rate_limits(interval) from public, anon, authenticated;
revoke execute on function tc_order_summary(uuid) from public, anon, authenticated;
revoke execute on function tc_resolve_discount(text, integer) from public, anon, authenticated;

-- The quote is safe to call from the browser: it reads public prices and
-- public shipping fees, creates nothing, and reveals no customer data.
grant execute on function tc_quote_order(jsonb, text, text) to anon, authenticated;
