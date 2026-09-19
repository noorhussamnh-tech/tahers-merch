-- ---------------------------------------------------------------------------
-- Instapay: pay by bank transfer, confirmed by a human.
--
-- WHY IT WORKS THE WAY IT DOES
--
-- Instapay has no callback. Nobody tells the shop the money arrived -- someone
-- looks at a bank app and decides. That single fact drives every choice below.
--
--   1. STOCK IS COMMITTED, NOT RESERVED. An online card payment reserves units
--      and releases them on a timer, because a card either clears in seconds
--      or does not. A transfer plus a human confirmation can take hours, and
--      an expiring hold would cancel orders that were genuinely paid --
--      the worst failure this shop could have. So Instapay deducts stock at
--      checkout exactly as cash on delivery does.
--
--      The cost of that is real and is accepted deliberately: somebody can
--      place an Instapay order, never transfer, and hold a cap until an
--      administrator cancels. With a twenty-piece run that matters, which is
--      why unpaid Instapay orders are made loud in /admin rather than quiet.
--      The rate limit on checkout is what stops it being done at scale.
--
--   2. PAYMENT AND FULFILMENT STAY SEPARATE. Placing the order does not mark
--      it paid. It sits `pending` until tc_admin_confirm_transfer is called,
--      and the rule that protects the shop is operational, not technical:
--      NEVER SHIP AN INSTAPAY ORDER THAT IS NOT PAID. The admin screen and the
--      courier CSV both say so where somebody will actually read it.
--
--   3. NO COD AVAILABILITY CHECK. A governorate may refuse cash on delivery;
--      a bank transfer works anywhere the shop delivers.
-- ---------------------------------------------------------------------------

-- 'instapay' joins the allowed methods. Recreating the constraint rather than
-- adding a second one keeps a single source of truth for what is legal.
alter table tc_orders drop constraint if exists tc_orders_payment_method_check;
alter table tc_orders add constraint tc_orders_payment_method_check
  check (payment_method in ('paymob', 'cod', 'instapay'));

-- Where the transfer went and what reference the customer gave. Null until an
-- administrator confirms it, which is also what makes it evidence: it is
-- written by the person who looked at the bank app, not by the customer.
alter table tc_orders add column if not exists payment_reference text;

comment on column tc_orders.payment_reference is
  'Instapay transfer reference, recorded by the administrator who verified it. Never supplied by the customer directly.';

-- ---------------------------------------------------------------------------
-- The account customers transfer to.
--
-- A setting rather than an environment variable so it can be corrected without
-- a deployment -- a wrong account number is the one thing here that loses real
-- money, and it must be fixable in seconds.
--
-- Public, because the checkout has to show it. It is a payment handle, which
-- is meant to be given out.
--
-- Empty by default, and the checkout treats empty as "Instapay is switched
-- off" -- so nobody is ever offered a payment method with nowhere to pay.
-- ---------------------------------------------------------------------------
insert into tc_store_settings (key, value, is_public)
values ('instapay_account', '{"handle": "", "name": ""}'::jsonb, true)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Confirming a transfer arrived. Administrator only.
--
-- Idempotent: confirming twice is a no-op rather than an error, because the
-- realistic mistake is two people both checking the bank app on launch day.
-- ---------------------------------------------------------------------------
create or replace function tc_admin_confirm_transfer(
  p_order_number text,
  p_reference    text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  o tc_orders%rowtype;
begin
  if not tc_is_admin() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  select * into o from tc_orders where order_number = p_order_number for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;

  if o.payment_method <> 'instapay' then
    raise exception 'not_a_transfer_order' using errcode = 'P0001';
  end if;

  -- Already paid: record the reference if one was missing, and stop. Not an
  -- error -- see the note on idempotency above.
  if o.payment_status = 'paid' then
    update tc_orders
       set payment_reference = coalesce(nullif(btrim(p_reference), ''), payment_reference)
     where id = o.id;
    return jsonb_build_object('orderNumber', o.order_number, 'paymentStatus', 'paid',
                              'alreadyPaid', true);
  end if;

  -- A cancelled order must not be revived by confirming a payment against it;
  -- its stock has already gone back on the shelf and may have been sold.
  if o.fulfilment_status = 'cancelled' then
    raise exception 'order_cancelled' using errcode = 'P0001';
  end if;

  update tc_orders
     set payment_status    = 'paid',
         payment_reference = nullif(btrim(p_reference), '')
   where id = o.id;

  insert into tc_order_status_history (order_id, status, note)
       values (o.id, o.fulfilment_status,
               'Instapay transfer confirmed' ||
               coalesce(' — ref ' || nullif(btrim(p_reference), ''), ''));

  return jsonb_build_object('orderNumber', o.order_number, 'paymentStatus', 'paid',
                            'alreadyPaid', false);
end;
$$;

comment on function tc_admin_confirm_transfer is
  'Marks an Instapay order paid after a human has verified the transfer. Idempotent.';

revoke all on function tc_admin_confirm_transfer(text, text) from public, anon;
grant execute on function tc_admin_confirm_transfer(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- tc_place_order, with Instapay allowed.
--
-- Derived from the 0004 version by three changes and nothing else: the list of
-- legal methods, a `commits_stock` flag naming the rule once, and the three
-- places that previously tested `p_payment_method = 'cod'` now testing that
-- flag. The signature, the locking order, the server-side pricing and the
-- idempotency handling are byte-for-byte what they were.
--
-- The signature matters: p_idempotency_key is UUID. Declaring it text here
-- would define a SECOND function rather than replacing this one, leaving the
-- old body live and Instapay orders rejected by a function nobody edited.
-- ---------------------------------------------------------------------------
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
  commits_stock boolean;
begin
  -- 1. Idempotency. A repeat of a request we already honoured returns the
  --    order we already made, without touching stock a second time.
  select id into existing_id from tc_orders where idempotency_key = p_idempotency_key;
  if found then
    return tc_order_summary(existing_id);
  end if;

  if p_payment_method not in ('paymob', 'cod', 'instapay') then
    raise exception 'invalid_payment_method' using errcode = 'P0001';
  end if;

  -- Neither cash on delivery nor a bank transfer has a payment step that can
  -- fail, so both take their stock now. Only a card reserves. Named once here
  -- because three separate places below depend on it agreeing with itself.
  commits_stock := p_payment_method in ('cod', 'instapay');

  -- 2. Destination. No zone, no order: we will not accept money for a
  --    delivery we have no fee or courier for.
  select * into zone from tc_shipping_zones
   where governorate = p_address ->> 'governorate';
  if not found then
    raise exception 'no_shipping_zone' using errcode = 'P0001';
  end if;

  -- Cash only. A bank transfer works wherever the shop delivers.
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
  --    Cash on delivery and Instapay both deduct stock now and never reserve:
  --    neither has a payment step that can fail, so holding the unit in limbo
  --    would only make it unsellable. A card order reserves instead, and the
  --    units move out of stock only when a verified webhook says the money
  --    arrived. See the header of this migration for why a transfer commits
  --    rather than reserving on a timer.
  if commits_stock then
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
    commits_stock,
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

    if commits_stock then
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

-- Unchanged from 0004: callable by the server function only, never a browser.
revoke execute on function tc_place_order(jsonb, jsonb, jsonb, text, uuid, text)
  from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- The admin order list, carrying the transfer reference.
--
-- Derived from the 0006 version with one field added. Without it the person
-- confirming a transfer can see that an order is paid but not what they
-- matched it against, which is the only record of why they believed it.
-- ---------------------------------------------------------------------------
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
               'paymentReference', o.payment_reference,
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
