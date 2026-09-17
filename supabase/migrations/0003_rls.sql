-- Row-level security.
--
-- The rule this file enforces: an anonymous visitor may read the shop, and
-- may do absolutely nothing else directly. Orders are not selectable, not
-- insertable and not updatable from the browser at any privilege level the
-- browser can hold. Everything a customer does to an order goes through a
-- security-definer function that decides for itself what the caller is
-- allowed to see -- which is how tracking can return one order without
-- granting read access to the table it lives in.
--
-- Grants and policies are both set explicitly. A policy without a grant does
-- nothing, and a grant without a policy is exactly the accident this file
-- exists to prevent, so neither is left to a default.

alter table tc_products            enable row level security;
alter table tc_product_images      enable row level security;
alter table tc_shipping_zones      enable row level security;
alter table tc_store_settings      enable row level security;
alter table tc_orders              enable row level security;
alter table tc_order_items         enable row level security;
alter table tc_order_status_history enable row level security;
alter table tc_payment_events      enable row level security;
alter table tc_rate_limits         enable row level security;
alter table tc_admins              enable row level security;

-- Start from nothing, then add back only what is needed.
revoke all on tc_products, tc_product_images, tc_shipping_zones, tc_store_settings,
              tc_orders, tc_order_items, tc_order_status_history,
              tc_payment_events, tc_rate_limits, tc_admins
  from anon, authenticated;

-- --------------------------------------------------------------- is-admin

create or replace function tc_is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (select 1 from tc_admins where auth_user_id = auth.uid())
$$;

comment on function tc_is_admin is
  'True when the caller is a listed administrator. Marked STABLE so a statement evaluates it once, not per row.';

-- ------------------------------------------------------- catalogue: readable

grant select on tc_products, tc_product_images, tc_shipping_zones, tc_store_settings
  to anon, authenticated;

-- An inactive product is invisible, which is what the admin's "deactivate"
-- switch means. Note it hides the row entirely rather than hiding a button.
create policy tc_products_public_read on tc_products
  for select to anon, authenticated
  using (active);

create policy tc_product_images_public_read on tc_product_images
  for select to anon, authenticated
  using (exists (select 1 from tc_products p where p.id = product_id and p.active));

-- Shipping fees are public: the checkout has to quote delivery before an
-- order exists, and a fee table reveals nothing about any customer.
create policy tc_shipping_zones_public_read on tc_shipping_zones
  for select to anon, authenticated
  using (true);

-- Only rows deliberately marked public. Discount codes and the reservation
-- policy are not among them.
create policy tc_store_settings_public_read on tc_store_settings
  for select to anon, authenticated
  using (is_public);

-- ------------------------------------------------------------ admin: writable

create policy tc_products_admin_all on tc_products
  for all to authenticated
  using (tc_is_admin()) with check (tc_is_admin());

create policy tc_product_images_admin_all on tc_product_images
  for all to authenticated
  using (tc_is_admin()) with check (tc_is_admin());

create policy tc_shipping_zones_admin_all on tc_shipping_zones
  for all to authenticated
  using (tc_is_admin()) with check (tc_is_admin());

create policy tc_store_settings_admin_all on tc_store_settings
  for all to authenticated
  using (tc_is_admin()) with check (tc_is_admin());

grant insert, update, delete on tc_products, tc_product_images, tc_shipping_zones, tc_store_settings
  to authenticated;

-- ------------------------------------------------------------------- orders
--
-- No policy grants anon anything here, and no grant is issued to anon at all.
-- Two independent reasons an anonymous select returns nothing: RLS has no
-- permissive policy for that role, and the role has no SELECT privilege.

grant select, update on tc_orders to authenticated;
grant select on tc_order_items, tc_order_status_history, tc_payment_events to authenticated;

create policy tc_orders_admin_read on tc_orders
  for select to authenticated using (tc_is_admin());
create policy tc_orders_admin_update on tc_orders
  for update to authenticated using (tc_is_admin()) with check (tc_is_admin());

create policy tc_order_items_admin_read on tc_order_items
  for select to authenticated using (tc_is_admin());

create policy tc_order_status_history_admin_read on tc_order_status_history
  for select to authenticated using (tc_is_admin());

create policy tc_payment_events_admin_read on tc_payment_events
  for select to authenticated using (tc_is_admin());

-- An administrator may see who else is an administrator, and nobody else may.
grant select on tc_admins to authenticated;
create policy tc_admins_self_read on tc_admins
  for select to authenticated using (tc_is_admin());

-- tc_rate_limits is touched only by security-definer functions. No role that
-- a browser can hold is granted anything on it, and it has no policies, so
-- even a leaked `authenticated` token cannot read or reset a counter.
