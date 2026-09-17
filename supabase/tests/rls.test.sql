-- Row-level security, tested as the roles a browser actually holds.
--
-- The functions in schema.test.sql run as the owner, which bypasses RLS --
-- that file tests the business rules. This file tests the fence: it becomes
-- `anon` (an anonymous visitor) and then `authenticated` (somebody signed in
-- but not an administrator), and checks what each of them can reach.
--
-- A failure here is a data breach, not a bug.

\set ON_ERROR_STOP on

create or replace function assert(cond boolean, msg text) returns void
language plpgsql as $$
begin
  if cond is not true then raise exception 'ASSERTION FAILED: %', msg; end if;
end;
$$;

-- Returns the error a statement raised, or null if it succeeded. SECURITY
-- INVOKER (the default) so it runs with the caller's role, not the owner's.
create or replace function expect_error(stmt text) returns text
language plpgsql as $$
begin
  execute stmt;
  return null;
exception when others then
  return sqlerrm;
end;
$$;

\echo '== fixtures =========================================================='

update tc_products set price_piastres = 75000, stock_quantity = 5, active = true where slug = 'taiwan';
update tc_products set price_piastres = 80000, stock_quantity = 5, active = false where slug = 'al-adou';
update tc_shipping_zones set fee_piastres = 6000 where governorate = 'Cairo';

select tc_place_order(
  '[{"slug":"taiwan","quantity":1}]'::jsonb,
  '{"fullName":"Private Person","mobile":"01099887766","email":"private@example.com"}'::jsonb,
  '{"governorate":"Cairo","city":"Dokki","street":"5 Secret St","building":"3","floor":"1","apartment":"2"}'::jsonb,
  'cod', gen_random_uuid()) \gset hidden_

\echo '== as an anonymous visitor ==========================================='

set role anon;

do $$
begin
  -- The shop is readable.
  perform assert((select count(*) from tc_products) = 1, 'anon sees only the active product');
  perform assert((select count(*) from tc_products where slug = 'al-adou') = 0,
                 'an inactive product is invisible, not merely unbuyable');
  perform assert((select count(*) from tc_shipping_zones) = 27, 'anon can read shipping fees');
  perform assert((select count(*) from tc_product_images) = 5,
                 'anon sees photographs for the active product only');

  -- Settings: only the rows marked public.
  perform assert((select count(*) from tc_store_settings) = 2, 'anon sees only public settings');
  perform assert((select count(*) from tc_store_settings where key = 'discount_codes') = 0,
                 'discount codes are not readable');
  perform assert((select count(*) from tc_store_settings where key = 'reservation_minutes') = 0,
                 'the reservation policy is not readable');

  -- Orders are not reachable at all.
  perform assert(expect_error($q$ select count(*) from tc_orders $q$) like '%permission denied%',
                 'anon cannot select orders');
  perform assert(expect_error($q$ select count(*) from tc_order_items $q$) like '%permission denied%',
                 'anon cannot select order items');
  perform assert(expect_error($q$ select count(*) from tc_order_status_history $q$) like '%permission denied%',
                 'anon cannot select status history');
  perform assert(expect_error($q$ select count(*) from tc_payment_events $q$) like '%permission denied%',
                 'anon cannot read the payment ledger');
  perform assert(expect_error($q$ select count(*) from tc_admins $q$) like '%permission denied%',
                 'anon cannot read the admin list');
  perform assert(expect_error($q$ select count(*) from tc_rate_limits $q$) like '%permission denied%',
                 'anon cannot read rate-limit counters');

  -- Nor writable.
  perform assert(expect_error($q$
    insert into tc_orders (order_number, customer_name, customer_mobile, address, payment_method,
                           subtotal_piastres, shipping_piastres, total_piastres, idempotency_key)
    values ('TC-FORGED', 'Forger', '01000000000', '{}'::jsonb, 'cod', 0, 0, 0, gen_random_uuid())
  $q$) like '%permission denied%', 'anon cannot insert an order directly');

  perform assert(expect_error($q$ update tc_products set price_piastres = 1 $q$) like '%permission denied%',
                 'anon cannot change a price');
  perform assert(expect_error($q$ update tc_shipping_zones set fee_piastres = 0 $q$) like '%permission denied%',
                 'anon cannot change a shipping fee');
  perform assert(expect_error($q$ delete from tc_products $q$) like '%permission denied%',
                 'anon cannot delete a product');

  -- The privileged functions are out of reach.
  perform assert(expect_error($q$
    select tc_place_order('[]'::jsonb, '{}'::jsonb, '{}'::jsonb, 'cod', gen_random_uuid())
  $q$) like '%permission denied%', 'anon cannot call tc_place_order directly');

  perform assert(expect_error($q$ select tc_track_order('TC-AAAA', '01000000000') $q$) like '%permission denied%',
                 'anon cannot call tc_track_order directly');
  perform assert(expect_error($q$ select tc_confirm_payment('TC-A','t',1,'e','{}'::jsonb) $q$) like '%permission denied%',
                 'anon cannot confirm a payment');
  perform assert(expect_error($q$ select tc_check_rate_limit('b','i',1,1) $q$) like '%permission denied%',
                 'anon cannot touch the rate limiter');
  perform assert(expect_error($q$ select tc_resolve_discount('X', 100) $q$) like '%permission denied%',
                 'anon cannot probe discount codes');
  perform assert(expect_error($q$ select tc_admin_orders() $q$) like '%permission denied%',
                 'anon cannot call the admin order list');

  -- The quote is the one thing anon may call, and it creates nothing.
  perform assert(
    (tc_quote_order('[{"slug":"taiwan","quantity":1}]'::jsonb, 'Cairo') ->> 'total')::int = 81000,
    'anon can price a cart');
end;
$$;

reset role;

\echo '== as a signed-in visitor who is not an administrator ================='

do $$
declare stranger uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (stranger, 'stranger@example.com');
  perform set_config('request.jwt.claim.sub', stranger::text, false);
end;
$$;

set role authenticated;

do $$
begin
  -- `authenticated` holds a SELECT grant on tc_orders -- administrators need
  -- it. RLS is what stops this particular signed-in person using it, and with
  -- no matching policy the table simply reads as empty.
  perform assert((select count(*) from tc_orders) = 0,
                 'a signed-in non-admin sees no orders at all');
  perform assert((select count(*) from tc_order_items) = 0, 'and no order items');
  perform assert((select count(*) from tc_admins) = 0, 'and cannot enumerate administrators');

  -- Still only the active product, same as anonymous.
  perform assert((select count(*) from tc_products) = 1, 'a signed-in visitor sees one product');

  -- Writes are refused by the policy's WITH CHECK, not merely hidden.
  perform assert(expect_error($q$ update tc_products set price_piastres = 1 where slug = 'taiwan' $q$)
                 is null, 'the update statement runs');
  perform assert((select price_piastres from tc_products where slug = 'taiwan') = 75000,
                 'but it matched no row, so no price changed');

  perform assert(expect_error($q$
    insert into tc_products (slug, name_ar, description_ar, price_piastres)
    values ('forged', 'x', 'y', 1)
  $q$) like '%row-level security%', 'a non-admin cannot insert a product');

  perform assert(expect_error($q$ select tc_admin_orders() $q$) like '%not_authorized%',
                 'the admin function refuses a non-admin');
end;
$$;

reset role;

\echo '== as an administrator ==============================================='

do $$
declare admin_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (admin_id, 'admin@taher.test');
  insert into tc_admins (auth_user_id, email) values (admin_id, 'admin@taher.test');
  perform set_config('request.jwt.claim.sub', admin_id::text, false);
end;
$$;

set role authenticated;

do $$
begin
  perform assert(tc_is_admin(), 'the admin is recognised');
  perform assert((select count(*) from tc_orders) = 1, 'an admin can read orders');
  perform assert((select count(*) from tc_products) = 2, 'an admin sees inactive products too');

  perform assert(expect_error($q$ select tc_admin_orders() $q$) is null, 'an admin can list orders');
end;
$$;

reset role;

\echo '== every check passed ================================================'
