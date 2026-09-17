-- Database test suite.
--
-- Runs against a throwaway database built from the migrations. Every check is
-- an assertion that raises on failure, so the script either prints its way to
-- the end or stops at the first thing that is wrong.
--
--   ./scripts/test-db.sh
--
-- What this covers is the part of the system a browser test cannot reach:
-- what happens when two customers want the same last cap, what a webhook does
-- when it arrives twice, and what an anonymous caller can actually read.

\set ON_ERROR_STOP on
\timing off

create or replace function assert(cond boolean, msg text) returns void
language plpgsql as $$
begin
  if cond is not true then
    raise exception 'ASSERTION FAILED: %', msg;
  end if;
end;
$$;

-- Runs a statement and returns the error it raised, or null if it succeeded.
create or replace function expect_error(stmt text) returns text
language plpgsql as $$
begin
  execute stmt;
  return null;
exception when others then
  return sqlerrm;
end;
$$;

\echo '== setup: open the store =============================================='

update tc_products set price_piastres = 75000, stock_quantity = 10, active = true
 where slug = 'taiwan';
update tc_products set price_piastres = 80000, stock_quantity = 3, active = true
 where slug = 'al-adou';

update tc_shipping_zones set fee_piastres = 6000, cod_available = true,  min_days = 2, max_days = 4
 where governorate = 'Cairo';
update tc_shipping_zones set fee_piastres = 11000, cod_available = false, min_days = 5, max_days = 7
 where governorate = 'Aswan';

\echo '== quoting ============================================================'

do $$
declare q jsonb;
begin
  q := tc_quote_order('[{"slug":"taiwan","quantity":2}]'::jsonb, 'Cairo');
  perform assert((q ->> 'subtotal')::int = 150000, 'subtotal is 2 x 750 EGP');
  perform assert((q ->> 'shippingFee')::int = 6000, 'Cairo shipping fee applied');
  perform assert((q ->> 'total')::int = 156000, 'total = subtotal + shipping');
  perform assert((q ->> 'codAvailable')::boolean, 'COD available in Cairo');
  perform assert((q ->> 'minDays')::int = 2, 'delivery estimate carried through');

  -- Repeated slugs fold into one line rather than producing two.
  q := tc_quote_order('[{"slug":"taiwan","quantity":1},{"slug":"taiwan","quantity":2}]'::jsonb, 'Cairo');
  perform assert(jsonb_array_length(q -> 'lines') = 1, 'duplicate slugs fold into one line');
  perform assert((q -> 'lines' -> 0 ->> 'quantity')::int = 3, 'folded quantity is the sum');

  -- A destination with no zone quotes no total rather than free shipping.
  update tc_shipping_zones set fee_piastres = 0 where governorate = 'Matrouh';
  delete from tc_shipping_zones where governorate = 'Matrouh';
  q := tc_quote_order('[{"slug":"taiwan","quantity":1}]'::jsonb, 'Matrouh');
  perform assert(q ->> 'shippingFee' is null, 'unknown destination has no fee');
  perform assert(q ->> 'total' is null, 'unknown destination has no total');
  perform assert((q ->> 'codAvailable')::boolean = false, 'no COD to an unknown destination');
  insert into tc_shipping_zones (governorate, fee_piastres, cod_available) values ('Matrouh', 0, true);

  perform assert(
    expect_error($q$ select tc_quote_order('[{"slug":"taiwan","quantity":1}]'::jsonb, 'Cairo') $q$) is null,
    'a valid quote does not raise');
end;
$$;

\echo '== the browser cannot set the price ==================================='

do $$
declare o jsonb;
begin
  -- A caller trying to smuggle a price in is simply ignored: tc_place_order
  -- reads slug and quantity and nothing else from each item.
  o := tc_place_order(
    '[{"slug":"taiwan","quantity":1,"unitPrice":1,"price":1,"lineTotal":1}]'::jsonb,
    '{"fullName":"Price Tamperer","mobile":"01012345678"}'::jsonb,
    '{"governorate":"Cairo","city":"Maadi","street":"9 St","building":"1","floor":"2","apartment":"3"}'::jsonb,
    'cod', gen_random_uuid());

  perform assert((o ->> 'subtotal')::int = 75000, 'server price used, not the submitted one');
  perform assert((o ->> 'total')::int = 81000, 'server total used, not the submitted one');
end;
$$;

\echo '== cash on delivery ==================================================='

do $$
declare o jsonb; p tc_products%rowtype; before int;
begin
  select stock_quantity into before from tc_products where slug = 'taiwan';

  o := tc_place_order(
    '[{"slug":"taiwan","quantity":2}]'::jsonb,
    '{"fullName":"Cash Customer","mobile":"01112345678","email":""}'::jsonb,
    '{"governorate":"Cairo","city":"Nasr City","street":"1 St","building":"5","floor":"1","apartment":"2"}'::jsonb,
    'cod', gen_random_uuid());

  perform assert(o ->> 'paymentMethod' = 'cod', 'method recorded');
  perform assert(o ->> 'paymentStatus' = 'pending', 'cash is pending until collected');
  perform assert(o ->> 'orderNumber' like 'TC-%', 'public order number issued');

  select * into p from tc_products where slug = 'taiwan';
  -- Cash deducts immediately: there is no payment step that can fail, so
  -- holding the unit in reserve would only make it unsellable.
  perform assert(p.stock_quantity = before - 2, 'COD deducts stock at checkout');
  perform assert(p.reserved_quantity = 0, 'COD reserves nothing');

  perform assert(
    (select stock_committed from tc_orders where order_number = o ->> 'orderNumber'),
    'COD order is committed');

  -- An empty email string is stored as null, not as ''.
  perform assert(
    (select customer_email from tc_orders where order_number = o ->> 'orderNumber') is null,
    'blank email is stored as null');
end;
$$;

\echo '== COD is refused where the courier does not collect cash ============='

do $$
begin
  perform assert(
    expect_error($q$
      select tc_place_order(
        '[{"slug":"taiwan","quantity":1}]'::jsonb,
        '{"fullName":"X","mobile":"01012345678"}'::jsonb,
        '{"governorate":"Aswan","city":"A","street":"B","building":"1","floor":"1","apartment":"1"}'::jsonb,
        'cod', gen_random_uuid())
    $q$) like '%cod_unavailable%',
    'COD refused in a zone that does not offer it');
end;
$$;

\echo '== no order to a destination we do not ship to ========================'

do $$
begin
  perform assert(
    expect_error($q$
      select tc_place_order(
        '[{"slug":"taiwan","quantity":1}]'::jsonb,
        '{"fullName":"X","mobile":"01012345678"}'::jsonb,
        '{"governorate":"Atlantis","city":"A","street":"B","building":"1","floor":"1","apartment":"1"}'::jsonb,
        'cod', gen_random_uuid())
    $q$) like '%no_shipping_zone%',
    'unknown destination is refused');
end;
$$;

\echo '== online payment reserves rather than deducts ========================'

do $$
declare o jsonb; p tc_products%rowtype; before int;
begin
  select stock_quantity into before from tc_products where slug = 'al-adou';

  o := tc_place_order(
    '[{"slug":"al-adou","quantity":1}]'::jsonb,
    '{"fullName":"Online Customer","mobile":"01212345678"}'::jsonb,
    '{"governorate":"Cairo","city":"Zamalek","street":"2 St","building":"7","floor":"3","apartment":"4"}'::jsonb,
    'paymob', gen_random_uuid());

  select * into p from tc_products where slug = 'al-adou';
  perform assert(p.stock_quantity = before, 'stock is not deducted before payment');
  perform assert(p.reserved_quantity = 1, 'the unit is held in reserve');

  perform assert(
    (select reservation_expires_at from tc_orders where order_number = o ->> 'orderNumber') is not null,
    'the hold has an expiry');
end;
$$;

\echo '== stock cannot be oversold =========================================='

do $$
declare available int;
begin
  select stock_quantity - reserved_quantity into available from tc_products where slug = 'al-adou';

  perform assert(
    expect_error(format($q$
      select tc_place_order(
        '[{"slug":"al-adou","quantity":%s}]'::jsonb,
        '{"fullName":"Greedy","mobile":"01512345678"}'::jsonb,
        '{"governorate":"Cairo","city":"A","street":"B","building":"1","floor":"1","apartment":"1"}'::jsonb,
        'cod', gen_random_uuid())
    $q$, available + 1)) like '%insufficient_stock:al-adou%',
    'ordering more than is available is refused');

  -- And the failed attempt left nothing behind.
  perform assert(
    (select stock_quantity - reserved_quantity from tc_products where slug = 'al-adou') = available,
    'a refused order changes no stock');
end;
$$;

\echo '== an inactive product cannot be ordered ============================='

do $$
begin
  update tc_products set active = false where slug = 'taiwan';
  perform assert(
    expect_error($q$
      select tc_place_order(
        '[{"slug":"taiwan","quantity":1}]'::jsonb,
        '{"fullName":"X","mobile":"01012345678"}'::jsonb,
        '{"governorate":"Cairo","city":"A","street":"B","building":"1","floor":"1","apartment":"1"}'::jsonb,
        'cod', gen_random_uuid())
    $q$) like '%product_unavailable:taiwan%',
    'a deactivated product is not orderable');
  update tc_products set active = true where slug = 'taiwan';
end;
$$;

\echo '== checkout is idempotent ============================================'

do $$
declare key uuid := gen_random_uuid(); first jsonb; second jsonb; before int; orders_before int;
begin
  select stock_quantity into before from tc_products where slug = 'taiwan';
  select count(*) into orders_before from tc_orders;

  first := tc_place_order(
    '[{"slug":"taiwan","quantity":1}]'::jsonb,
    '{"fullName":"Double Clicker","mobile":"01012345670"}'::jsonb,
    '{"governorate":"Cairo","city":"A","street":"B","building":"1","floor":"1","apartment":"1"}'::jsonb,
    'cod', key);

  -- The same request again: the retried submission, or the second click.
  second := tc_place_order(
    '[{"slug":"taiwan","quantity":1}]'::jsonb,
    '{"fullName":"Double Clicker","mobile":"01012345670"}'::jsonb,
    '{"governorate":"Cairo","city":"A","street":"B","building":"1","floor":"1","apartment":"1"}'::jsonb,
    'cod', key);

  perform assert(first ->> 'orderNumber' = second ->> 'orderNumber', 'one order number, not two');
  perform assert((select count(*) from tc_orders) = orders_before + 1, 'exactly one order created');
  perform assert(
    (select stock_quantity from tc_products where slug = 'taiwan') = before - 1,
    'stock moved once, not twice');
end;
$$;

\echo '== payment confirmation =============================================='

do $$
declare o jsonb; num text; result jsonb; p_before tc_products%rowtype; p_after tc_products%rowtype;
begin
  o := tc_place_order(
    '[{"slug":"taiwan","quantity":1}]'::jsonb,
    '{"fullName":"Payer","mobile":"01012345671"}'::jsonb,
    '{"governorate":"Cairo","city":"A","street":"B","building":"1","floor":"1","apartment":"1"}'::jsonb,
    'paymob', gen_random_uuid());
  num := o ->> 'orderNumber';

  select * into p_before from tc_products where slug = 'taiwan';

  result := tc_confirm_payment(num, 'txn-1001', (o ->> 'total')::int, 'evt-1001', '{"id":1001}'::jsonb);
  perform assert(result ->> 'result' = 'confirmed', 'payment confirmed');

  select * into p_after from tc_products where slug = 'taiwan';
  perform assert(p_after.stock_quantity = p_before.stock_quantity - 1, 'stock deducted on payment');
  perform assert(p_after.reserved_quantity = p_before.reserved_quantity - 1, 'the hold was released');

  perform assert((select payment_status from tc_orders where order_number = num) = 'paid', 'marked paid');
  perform assert((select fulfilment_status from tc_orders where order_number = num) = 'confirmed',
                 'paying advances fulfilment to confirmed');
  perform assert((select stock_committed from tc_orders where order_number = num), 'committed');
  perform assert((select paymob_transaction_id from tc_orders where order_number = num) = 'txn-1001',
                 'gateway reference stored for reconciliation');
end;
$$;

\echo '== a duplicate webhook changes nothing ==============================='

do $$
declare o jsonb; num text; result jsonb; stock_before int; events_before int;
begin
  o := tc_place_order(
    '[{"slug":"taiwan","quantity":1}]'::jsonb,
    '{"fullName":"Duplicate","mobile":"01012345672"}'::jsonb,
    '{"governorate":"Cairo","city":"A","street":"B","building":"1","floor":"1","apartment":"1"}'::jsonb,
    'paymob', gen_random_uuid());
  num := o ->> 'orderNumber';

  perform tc_confirm_payment(num, 'txn-2002', (o ->> 'total')::int, 'evt-2002', '{"id":2002}'::jsonb);

  select stock_quantity into stock_before from tc_products where slug = 'taiwan';
  select count(*) into events_before from tc_payment_events;

  -- Paymob redelivers. Same event id, same everything.
  result := tc_confirm_payment(num, 'txn-2002', (o ->> 'total')::int, 'evt-2002', '{"id":2002}'::jsonb);

  perform assert(result ->> 'result' = 'duplicate_event', 'the redelivery is recognised');
  perform assert((select stock_quantity from tc_products where slug = 'taiwan') = stock_before,
                 'stock is not deducted a second time');
  perform assert((select count(*) from tc_payment_events) = events_before,
                 'the event ledger records it once');
end;
$$;

\echo '== a payment for the wrong amount is refused =========================='

do $$
declare o jsonb; num text; err text;
begin
  o := tc_place_order(
    '[{"slug":"taiwan","quantity":1}]'::jsonb,
    '{"fullName":"Underpayer","mobile":"01012345673"}'::jsonb,
    '{"governorate":"Cairo","city":"A","street":"B","building":"1","floor":"1","apartment":"1"}'::jsonb,
    'paymob', gen_random_uuid());
  num := o ->> 'orderNumber';

  err := expect_error(format(
    $q$ select tc_confirm_payment(%L, 'txn-3003', 1, 'evt-3003', '{}'::jsonb) $q$, num));

  perform assert(err like '%amount_mismatch%', 'a mismatched amount raises');
  perform assert((select payment_status from tc_orders where order_number = num) = 'pending',
                 'the order stays unpaid');
  perform assert(not (select stock_committed from tc_orders where order_number = num),
                 'no stock is committed for a mismatched payment');
end;
$$;

\echo '== a failed payment releases the hold ================================='

do $$
declare o jsonb; num text; reserved_before int;
begin
  o := tc_place_order(
    '[{"slug":"al-adou","quantity":1}]'::jsonb,
    '{"fullName":"Declined","mobile":"01012345674"}'::jsonb,
    '{"governorate":"Cairo","city":"A","street":"B","building":"1","floor":"1","apartment":"1"}'::jsonb,
    'paymob', gen_random_uuid());
  num := o ->> 'orderNumber';

  select reserved_quantity into reserved_before from tc_products where slug = 'al-adou';
  perform assert(reserved_before > 0, 'the hold exists before the failure');

  perform tc_fail_payment(num, 'failed', 'evt-4004', '{"success":false}'::jsonb);

  perform assert((select reserved_quantity from tc_products where slug = 'al-adou') = reserved_before - 1,
                 'the hold is released so the cap can sell again');
  perform assert((select payment_status from tc_orders where order_number = num) = 'failed', 'marked failed');
end;
$$;

\echo '== a late failure never un-pays a paid order =========================='

do $$
declare o jsonb; num text; result jsonb;
begin
  o := tc_place_order(
    '[{"slug":"taiwan","quantity":1}]'::jsonb,
    '{"fullName":"Raced","mobile":"01012345675"}'::jsonb,
    '{"governorate":"Cairo","city":"A","street":"B","building":"1","floor":"1","apartment":"1"}'::jsonb,
    'paymob', gen_random_uuid());
  num := o ->> 'orderNumber';

  perform tc_confirm_payment(num, 'txn-5005', (o ->> 'total')::int, 'evt-5005', '{}'::jsonb);
  result := tc_fail_payment(num, 'failed', 'evt-5006', '{}'::jsonb);

  perform assert(result ->> 'result' = 'already_paid', 'the failure is declined');
  perform assert((select payment_status from tc_orders where order_number = num) = 'paid', 'still paid');
end;
$$;

\echo '== expired reservations are swept ===================================='

do $$
declare o jsonb; num text; reserved_before int; released int;
begin
  o := tc_place_order(
    '[{"slug":"al-adou","quantity":1}]'::jsonb,
    '{"fullName":"Abandoner","mobile":"01012345676"}'::jsonb,
    '{"governorate":"Cairo","city":"A","street":"B","building":"1","floor":"1","apartment":"1"}'::jsonb,
    'paymob', gen_random_uuid());
  num := o ->> 'orderNumber';

  select reserved_quantity into reserved_before from tc_products where slug = 'al-adou';

  -- The customer closed the tab; Paymob sent nothing.
  update tc_orders set reservation_expires_at = now() - interval '1 minute' where order_number = num;

  released := tc_release_expired_reservations();
  perform assert(released >= 1, 'the sweep released the abandoned order');
  perform assert((select reserved_quantity from tc_products where slug = 'al-adou') = reserved_before - 1,
                 'the cap is sellable again');
  perform assert((select payment_status from tc_orders where order_number = num) = 'cancelled', 'cancelled');
end;
$$;

\echo '== cancelling an order returns its stock ============================='

do $$
declare o jsonb; num text; admin_id uuid; before int;
begin
  admin_id := gen_random_uuid();
  insert into auth.users (id, email) values (admin_id, 'admin@taher.test');
  insert into tc_admins (auth_user_id, email) values (admin_id, 'admin@taher.test');
  perform set_config('request.jwt.claim.sub', admin_id::text, true);

  select stock_quantity into before from tc_products where slug = 'taiwan';

  o := tc_place_order(
    '[{"slug":"taiwan","quantity":2}]'::jsonb,
    '{"fullName":"Cancelled","mobile":"01012345677"}'::jsonb,
    '{"governorate":"Cairo","city":"A","street":"B","building":"1","floor":"1","apartment":"1"}'::jsonb,
    'cod', gen_random_uuid());
  num := o ->> 'orderNumber';

  perform assert((select stock_quantity from tc_products where slug = 'taiwan') = before - 2,
                 'cash order took the stock');

  perform tc_admin_update_fulfilment(num, 'cancelled', 'Customer changed their mind.');

  perform assert((select stock_quantity from tc_products where slug = 'taiwan') = before,
                 'cancelling put the stock back');
  perform assert((select fulfilment_status from tc_orders where order_number = num) = 'cancelled',
                 'order is cancelled');
end;
$$;

\echo '== tracking: right pair, wrong pair, and what it reveals =============='

do $$
declare o jsonb; num text; tracked jsonb;
begin
  perform set_config('request.jwt.claim.sub', '', true);

  o := tc_place_order(
    '[{"slug":"taiwan","quantity":1}]'::jsonb,
    '{"fullName":"Tracked Customer","mobile":"01098765432","email":"tracked@example.com"}'::jsonb,
    '{"governorate":"Cairo","city":"Heliopolis","street":"12 Baghdad St","building":"44","floor":"5","apartment":"9","notes":"Ring twice"}'::jsonb,
    'cod', gen_random_uuid());
  num := o ->> 'orderNumber';

  update tc_orders set internal_notes = 'Flagged: repeat address' where order_number = num;

  tracked := tc_track_order(num, '01098765432');
  perform assert(tracked is not null, 'the right pair finds the order');
  perform assert(tracked ->> 'orderNumber' = num, 'it is the right order');
  perform assert(jsonb_array_length(tracked -> 'timeline') >= 1, 'a timeline is returned');
  perform assert(tracked ->> 'governorate' = 'Cairo', 'the governorate is shown');

  -- What tracking must NOT expose.
  perform assert(not (tracked::text like '%Baghdad%'), 'the street address is not exposed');
  perform assert(not (tracked::text like '%tracked@example.com%'), 'the email is not exposed');
  perform assert(not (tracked::text like '%Ring twice%'), 'delivery notes are not exposed');
  perform assert(not (tracked::text like '%Flagged%'), 'internal notes are not exposed');
  perform assert(tracked ->> 'customerName' is null, 'the customer name is not echoed back');
  perform assert(tracked ->> 'id' is null, 'the internal id is not exposed');
  perform assert(not (tracked::text like '%Heliopolis%'), 'the city is not exposed');

  -- The order number alone is not enough.
  perform assert(tc_track_order(num, '01000000000') is null, 'a wrong mobile reveals nothing');
  perform assert(tc_track_order('TC-NOTREAL', '01098765432') is null, 'an unknown order reveals nothing');

  -- Case-insensitive, because customers retype what they were shown.
  perform assert(tc_track_order(lower(num), '01098765432') is not null, 'lower case works');
end;
$$;

\echo '== rate limiting ====================================================='

do $$
declare allowed boolean;
begin
  for i in 1..5 loop
    allowed := tc_check_rate_limit('test', 'ip-1', 5, 60);
    perform assert(allowed, format('request %s of 5 is allowed', i));
  end loop;

  perform assert(not tc_check_rate_limit('test', 'ip-1', 5, 60), 'the sixth request is refused');
  -- A different caller is unaffected.
  perform assert(tc_check_rate_limit('test', 'ip-2', 5, 60), 'another caller has its own counter');
end;
$$;

\echo '== discounts ========================================================='

do $$
declare o jsonb;
begin
  update tc_store_settings
     set value = '{"TAHER10": {"type":"percent","value":10,"active":true},
                   "OFF50":   {"type":"fixed","value":5000,"active":true},
                   "EXPIRED": {"type":"fixed","value":5000,"active":false}}'::jsonb
   where key = 'discount_codes';

  perform assert(tc_resolve_discount('TAHER10', 100000) = 10000, 'percent discount');
  perform assert(tc_resolve_discount('taher10', 100000) = 10000, 'codes are case-insensitive');
  perform assert(tc_resolve_discount('OFF50', 100000) = 5000, 'fixed discount');
  perform assert(tc_resolve_discount('EXPIRED', 100000) = 0, 'an inactive code does nothing');
  perform assert(tc_resolve_discount('NONSENSE', 100000) = 0, 'an unknown code does nothing');
  perform assert(tc_resolve_discount(null, 100000) = 0, 'no code means no discount');
  -- Never more than the goods are worth.
  perform assert(tc_resolve_discount('OFF50', 3000) = 3000, 'a discount is clamped to the subtotal');

  o := tc_place_order(
    '[{"slug":"taiwan","quantity":1}]'::jsonb,
    '{"fullName":"Discounted","mobile":"01012345678"}'::jsonb,
    '{"governorate":"Cairo","city":"A","street":"B","building":"1","floor":"1","apartment":"1"}'::jsonb,
    'cod', gen_random_uuid(), 'OFF50');

  perform assert((o ->> 'discount')::int = 5000, 'the discount is applied to the order');
  -- Shipping is charged regardless: the courier is paid either way.
  perform assert((o ->> 'total')::int = 75000 - 5000 + 6000, 'discount applies to goods, not shipping');
end;
$$;

\echo '== the arithmetic is re-checked by the database ======================='

do $$
declare oid uuid;
begin
  select id into oid from tc_orders limit 1;
  -- A total that does not add up cannot be stored, whatever wrote it.
  perform assert(
    expect_error(format($q$ update tc_orders set total_piastres = 1 where id = %L $q$, oid))
      like '%tc_orders_total_adds_up%',
    'a total that does not add up is rejected by the table itself');

  perform assert(
    expect_error($q$ update tc_products set reserved_quantity = stock_quantity + 1 where slug = 'taiwan' $q$)
      like '%tc_products_reserved_within_stock%',
    'a reservation larger than stock is rejected by the table itself');
end;
$$;

\echo '== admin authorisation ==============================================='

do $$
declare stranger uuid := gen_random_uuid();
begin
  -- Nobody at all.
  perform set_config('request.jwt.claim.sub', '', true);
  perform assert(tc_is_admin() = false, 'an anonymous caller is not an admin');
  perform assert(expect_error($q$ select tc_admin_products() $q$) like '%not_authorized%',
                 'anonymous cannot list products as admin');
  perform assert(expect_error($q$ select tc_admin_orders() $q$) like '%not_authorized%',
                 'anonymous cannot list orders');
  perform assert(expect_error($q$ select tc_admin_update_product('taiwan', 1, 1, true) $q$) like '%not_authorized%',
                 'anonymous cannot change a price');
  perform assert(expect_error($q$ select tc_admin_update_fulfilment('TC-XXXX', 'shipped') $q$) like '%not_authorized%',
                 'anonymous cannot move an order');
  perform assert(expect_error($q$ select tc_admin_update_shipping_zone('Cairo', 1, true) $q$) like '%not_authorized%',
                 'anonymous cannot change a shipping fee');

  -- A signed-in user who is not on the admin list.
  insert into auth.users (id, email) values (stranger, 'stranger@example.com');
  perform set_config('request.jwt.claim.sub', stranger::text, true);
  perform assert(tc_is_admin() = false, 'a signed-in stranger is not an admin');
  perform assert(expect_error($q$ select tc_admin_orders() $q$) like '%not_authorized%',
                 'a signed-in stranger cannot read orders');
end;
$$;

\echo '== admin edits ======================================================='

do $$
declare admin_id uuid;
begin
  select auth_user_id into admin_id from tc_admins limit 1;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);

  perform tc_admin_update_product('taiwan', 90000, 40, true);
  perform assert((select price_piastres from tc_products where slug = 'taiwan') = 90000, 'price updated');
  perform assert((select stock_quantity from tc_products where slug = 'taiwan') = 40, 'stock updated');

  perform tc_admin_update_product('taiwan', null, null, false);
  perform assert((select active from tc_products where slug = 'taiwan') = false, 'deactivated');
  perform assert((select price_piastres from tc_products where slug = 'taiwan') = 90000,
                 'omitted fields are left alone');
  perform tc_admin_update_product('taiwan', null, null, true);

  -- Stock cannot be cut below units already reserved for unpaid orders.
  update tc_products set reserved_quantity = 5 where slug = 'taiwan';
  perform assert(
    expect_error($q$ select tc_admin_update_product('taiwan', null, 2, null) $q$) like '%stock_below_reserved%',
    'stock cannot be set below what is reserved');
  update tc_products set reserved_quantity = 0 where slug = 'taiwan';

  perform tc_admin_update_shipping_zone('Luxor', 12000, true, 4, 6);
  perform assert((select fee_piastres from tc_shipping_zones where governorate = 'Luxor') = 12000,
                 'shipping fee updated');

  perform assert(jsonb_array_length(tc_admin_products()) = 2, 'admin sees both products');
  perform assert(jsonb_array_length(tc_admin_orders()) > 0, 'admin sees orders');
  perform assert(jsonb_array_length(tc_admin_orders('TC-')) > 0, 'admin can search by order number');
  perform assert(jsonb_array_length(tc_admin_orders('01098765432')) = 1, 'admin can search by mobile');
  perform assert(jsonb_array_length(tc_admin_orders('nothing-matches-this')) = 0, 'a search can find nothing');
end;
$$;

\echo '== every check passed ================================================'
