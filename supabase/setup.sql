-- ===========================================================================
-- Taher's Merch — complete database setup
--
-- ONE file. Paste the whole thing into the Supabase SQL Editor and press Run.
--
-- It is every migration (0001–0008) concatenated in order, so you do not have
-- to run eight files by hand. Running it on a FRESH project is safe.
--
-- What it creates:
--   · the two caps, at 950.00 EGP, 20 in stock each, BOTH INACTIVE
--   · all 27 governorates at a flat 100.00 EGP delivery
--   · orders, order items, status history, payment ledger, rate limits
--   · row-level security so the public can read the shop and nothing else
--   · the checkout, tracking, payment and admin functions
--
-- The shop cannot sell anything until you activate the caps in /admin.
-- That is deliberate.
--
-- Generated from supabase/migrations/. Regenerate with:
--   node scripts/build-setup-sql.mjs
-- ===========================================================================


-- ###########################################################################
-- 0001_catalog.sql
-- ###########################################################################

-- Catalogue: the two caps, their photography, where we ship, and the handful
-- of settings that must change without a deploy.
--
-- Money is stored as an integer number of piastres throughout. Never numeric,
-- never float: the app does its arithmetic in integers for the same reason,
-- and Paymob's API takes an integer `amount_cents`, so this is the one
-- representation nothing has to convert away from.

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------ products

create table tc_products (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name_ar         text not null,
  description_ar  text not null,
  price_piastres  integer not null check (price_piastres >= 0),
  stock_quantity  integer not null default 0 check (stock_quantity >= 0),
  -- Units spoken for by an order that is waiting on an online payment. A cap
  -- is not deducted from stock until the payment is verified, but it must not
  -- be sellable twice in the meantime either.
  reserved_quantity integer not null default 0 check (reserved_quantity >= 0),
  active          boolean not null default true,
  display_order   integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- The invariant the whole inventory model rests on. If this ever trips, a
  -- reservation was made without stock behind it, and the transaction that
  -- tried it is rolled back rather than allowed to oversell.
  constraint tc_products_reserved_within_stock check (reserved_quantity <= stock_quantity)
);

comment on table tc_products is
  'The two caps. A third row would not render: the storefront only knows two slugs.';
comment on column tc_products.reserved_quantity is
  'Held for unpaid online orders. available = stock_quantity - reserved_quantity.';

-- What a customer can actually buy right now.
create or replace function tc_available_stock(p tc_products) returns integer
language sql immutable as $$
  select p.stock_quantity - p.reserved_quantity
$$;

-- ------------------------------------------------------------ product images

create table tc_product_images (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references tc_products (id) on delete cascade,
  view          text not null check (view in ('main', 'front', 'side', 'back', 'detail')),
  -- Path without extension, relative to the site root. The optimiser writes
  -- the AVIF and WebP variants beside it; the gallery builds its srcset from
  -- this stem rather than from a list of URLs.
  base_path     text not null,
  alt_ar        text not null,
  width         integer not null check (width > 0),
  height        integer not null check (height > 0),
  display_order integer not null default 0,
  created_at    timestamptz not null default now(),

  -- One photograph per view per product; the gallery has exactly five slots.
  unique (product_id, view)
);

create index tc_product_images_product_idx on tc_product_images (product_id, display_order);

-- ------------------------------------------------------------ shipping zones

create table tc_shipping_zones (
  governorate   text primary key,
  fee_piastres  integer not null check (fee_piastres >= 0),
  cod_available boolean not null default true,
  -- Null until the courier confirms a service level. The storefront shows no
  -- estimate rather than an invented one.
  min_days      integer check (min_days >= 0),
  max_days      integer check (max_days >= 0),
  updated_at    timestamptz not null default now(),

  constraint tc_shipping_days_ordered check (
    min_days is null or max_days is null or min_days <= max_days
  )
);

comment on table tc_shipping_zones is
  'One row per Egyptian governorate. A destination with no row cannot be quoted or shipped to.';

-- ------------------------------------------------------------ store settings

create table tc_store_settings (
  key        text primary key,
  value      jsonb not null,
  -- Only rows marked public are readable by an anonymous visitor. Everything
  -- else (discount codes, reservation policy, support routing) stays server
  -- side, so marking a row public is a deliberate act rather than a default.
  is_public  boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into tc_store_settings (key, value, is_public) values
  -- Free-text store policy shown on the storefront. Placeholder until the
  -- business supplies the real return terms -- see docs/MISSING-INFORMATION.md.
  ('returns_policy_ar', '"يمكن طلب الاستبدال أو الاسترجاع وفقًا للشروط الموضحة في سياسة المتجر."'::jsonb, true),
  ('support_contact',   '{"whatsapp": null, "email": null}'::jsonb, true),
  -- How long an unpaid online order holds its stock before the reservation is
  -- released. Kept in settings so it can be tuned without a migration.
  ('reservation_minutes', '30'::jsonb, false),
  -- Discount codes, keyed by code. Empty by design: the business has not
  -- supplied any, and none are invented here.
  --   { "CODE": { "type": "fixed"|"percent", "value": 1000, "active": true } }
  -- `value` is piastres for fixed, whole percent for percent.
  ('discount_codes', '{}'::jsonb, false);

-- --------------------------------------------------------------- updated_at

create or replace function tc_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger tc_products_touch before update on tc_products
  for each row execute function tc_touch_updated_at();
create trigger tc_shipping_zones_touch before update on tc_shipping_zones
  for each row execute function tc_touch_updated_at();
create trigger tc_store_settings_touch before update on tc_store_settings
  for each row execute function tc_touch_updated_at();

-- ###########################################################################
-- 0002_orders.sql
-- ###########################################################################

-- Orders.
--
-- Two identifiers, on purpose. `id` is the private primary key and never
-- leaves the server. `order_number` is the public handle -- printed on the
-- confirmation, typed into the tracking form, quoted to support -- and it is
-- random rather than sequential, so knowing one order number tells you
-- nothing about any other and reveals nothing about how many orders exist.

-- ------------------------------------------------------------ order numbers

-- Crockford-style alphabet: no I, L, O or U, so a customer reading a number
-- off a screen to somebody on the phone cannot turn a 0 into an O.
create or replace function tc_generate_order_number() returns text
language plpgsql volatile as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  candidate text;
  i integer;
begin
  loop
    candidate := 'TC-';
    for i in 1..8 loop
      -- gen_random_bytes rather than random(): order numbers must not be
      -- predictable from one another, and random() is seeded per session.
      candidate := candidate || substr(
        alphabet,
        1 + (get_byte(gen_random_bytes(1), 0) % length(alphabet)),
        1
      );
    end loop;
    -- 32^8 is ~1.1e12, so a collision is vanishingly unlikely; the loop makes
    -- it impossible rather than merely improbable.
    exit when not exists (select 1 from tc_orders where order_number = candidate);
  end loop;
  return candidate;
end;
$$;

-- ------------------------------------------------------------------- orders

create table tc_orders (
  id                  uuid primary key default gen_random_uuid(),
  order_number        text not null unique,

  -- Customer, as given at checkout. Not linked to any account: this store has
  -- no customer accounts, by instruction.
  customer_name       text not null,
  customer_mobile     text not null,
  customer_email      text,

  -- A snapshot, not a reference. If a shipping zone is renamed or a fee
  -- changes next month, this order still records where it was actually sent.
  address             jsonb not null,

  payment_method      text not null check (payment_method in ('paymob', 'cod')),
  payment_status      text not null default 'pending'
                        check (payment_status in ('pending', 'paid', 'failed', 'cancelled', 'refunded')),
  fulfilment_status   text not null default 'placed'
                        check (fulfilment_status in ('placed', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled')),

  subtotal_piastres   integer not null check (subtotal_piastres >= 0),
  shipping_piastres   integer not null check (shipping_piastres >= 0),
  discount_piastres   integer not null default 0 check (discount_piastres >= 0),
  total_piastres      integer not null check (total_piastres >= 0),

  -- Paymob references, stored so a transaction can be reconciled against the
  -- gateway dashboard later. Null for a cash order.
  paymob_intention_id    text,
  paymob_order_id        text,
  paymob_transaction_id  text,

  -- Set by the checkout caller. Two submissions carrying the same key produce
  -- one order, which is what makes a double-click or a retried request safe.
  idempotency_key     uuid not null unique,

  -- Inventory state. `stock_committed` means the units have been deducted
  -- from stock_quantity; until then they are only held in reserved_quantity.
  stock_committed     boolean not null default false,
  reservation_expires_at timestamptz,

  -- Internal only. Never returned by tracking.
  internal_notes      text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint tc_orders_total_adds_up check (
    total_piastres = subtotal_piastres - discount_piastres + shipping_piastres
  ),
  constraint tc_orders_discount_within_subtotal check (discount_piastres <= subtotal_piastres)
);

comment on column tc_orders.order_number is
  'Public handle. Random, not sequential, so orders cannot be enumerated.';
comment on constraint tc_orders_total_adds_up on tc_orders is
  'The database re-checks the arithmetic it was given. A total that does not add up is never stored.';

-- Tracking looks an order up by both halves at once; the index matches that.
create index tc_orders_tracking_idx on tc_orders (order_number, customer_mobile);
-- Admin search by mobile, and the reservation sweeper.
create index tc_orders_mobile_idx on tc_orders (customer_mobile);
create index tc_orders_created_idx on tc_orders (created_at desc);
create index tc_orders_reservation_idx on tc_orders (reservation_expires_at)
  where stock_committed = false and payment_status = 'pending';

create trigger tc_orders_touch before update on tc_orders
  for each row execute function tc_touch_updated_at();

-- -------------------------------------------------------------- order items

create table tc_order_items (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null references tc_orders (id) on delete cascade,
  product_id            uuid not null references tc_products (id),

  -- Snapshots. A price change tomorrow must not rewrite what this customer
  -- was charged today, and a renamed product must not rewrite their receipt.
  slug                  text not null,
  name_ar               text not null,
  unit_price_piastres   integer not null check (unit_price_piastres >= 0),
  quantity              integer not null check (quantity > 0),
  line_total_piastres   integer not null check (line_total_piastres >= 0),

  constraint tc_order_items_line_adds_up check (
    line_total_piastres = unit_price_piastres * quantity
  )
);

create index tc_order_items_order_idx on tc_order_items (order_id);

-- ------------------------------------------------------------ status history

create table tc_order_status_history (
  id         bigserial primary key,
  order_id   uuid not null references tc_orders (id) on delete cascade,
  status     text not null,
  -- Internal. The tracking view returns status and timestamp only.
  note       text,
  created_at timestamptz not null default now()
);

create index tc_order_status_history_order_idx on tc_order_status_history (order_id, created_at);

-- ------------------------------------------------------------ payment events

-- Every webhook Paymob delivers, recorded once. The unique constraint is the
-- duplicate protection: a redelivered event fails to insert and is
-- acknowledged without being processed a second time.
create table tc_payment_events (
  id           bigserial primary key,
  provider     text not null default 'paymob',
  event_id     text not null,
  order_id     uuid references tc_orders (id) on delete set null,
  payload      jsonb not null,
  processed_at timestamptz not null default now(),

  unique (provider, event_id)
);

comment on table tc_payment_events is
  'Webhook ledger. The unique (provider, event_id) is what makes processing idempotent.';

-- -------------------------------------------------------------- rate limits

-- Fixed-window counters. In a serverless deployment there is no shared
-- memory to hold these, so they live in the database where every instance
-- sees the same count.
create table tc_rate_limits (
  bucket       text not null,
  identifier   text not null,
  window_start timestamptz not null,
  count        integer not null default 0,

  primary key (bucket, identifier, window_start)
);

create index tc_rate_limits_sweep_idx on tc_rate_limits (window_start);

-- ------------------------------------------------------------------- admins

create table tc_admins (
  auth_user_id uuid primary key,
  email        text not null unique,
  created_at   timestamptz not null default now()
);

comment on table tc_admins is
  'Whoever may reach /admin. Rows are inserted by hand or by the seed script; there is no public sign-up.';

-- ###########################################################################
-- 0003_rls.sql
-- ###########################################################################

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

-- ###########################################################################
-- 0004_checkout.sql
-- ###########################################################################

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

-- ###########################################################################
-- 0005_payments.sql
-- ###########################################################################

-- Payment settlement.
--
-- These functions are called only from the verified webhook handler, after it
-- has checked Paymob's HMAC. They are written so that calling them twice is
-- harmless, because a payment gateway *will* deliver the same event twice and
-- the second delivery must not deduct stock again or flip a settled order.

-- Attaches the gateway's references to an order once the intention is made,
-- so a transaction can be reconciled against the Paymob dashboard later.
create or replace function tc_attach_payment_reference(
  p_order_number   text,
  p_intention_id   text,
  p_paymob_order_id text
) returns void
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
begin
  update tc_orders
     set paymob_intention_id = p_intention_id,
         paymob_order_id     = p_paymob_order_id
   where order_number = p_order_number;

  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------- confirming

-- Marks an order paid and converts its reservation into a real deduction.
--
-- Three things have to be true before that happens, and each is checked here
-- rather than trusted from the caller: the order exists, it has not already
-- been settled, and the amount the gateway captured equals the total we
-- recorded. An amount mismatch is refused outright -- it means the customer
-- was charged something other than what this order says, and no amount of
-- retrying makes that safe to accept.
create or replace function tc_confirm_payment(
  p_order_number    text,
  p_transaction_id  text,
  p_amount_piastres integer,
  p_event_id        text,
  p_payload         jsonb
) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  o    tc_orders%rowtype;
  item record;
begin
  -- Duplicate protection. The unique (provider, event_id) means the second
  -- delivery of the same event inserts nothing and returns here, having
  -- changed no stock and no status.
  insert into tc_payment_events (provider, event_id, payload)
       values ('paymob', p_event_id, p_payload)
  on conflict (provider, event_id) do nothing;

  if not found then
    return jsonb_build_object('result', 'duplicate_event', 'orderNumber', p_order_number);
  end if;

  select * into o from tc_orders where order_number = p_order_number for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;

  update tc_payment_events set order_id = o.id
   where provider = 'paymob' and event_id = p_event_id;

  -- Already settled: acknowledge without doing the work twice.
  if o.payment_status = 'paid' then
    return jsonb_build_object('result', 'already_paid', 'orderNumber', o.order_number);
  end if;

  if p_amount_piastres is distinct from o.total_piastres then
    -- Recorded, not silently dropped: a mismatch is a reconciliation problem
    -- somebody has to look at, and the order stays unpaid in the meantime.
    insert into tc_order_status_history (order_id, status, note)
         values (o.id, o.fulfilment_status,
                 format('Payment amount mismatch: gateway reported %s, order total is %s.',
                        p_amount_piastres, o.total_piastres));
    raise exception 'amount_mismatch:%:%', p_amount_piastres, o.total_piastres
      using errcode = 'P0001';
  end if;

  -- Convert the hold into a deduction. Skipped when stock was already
  -- committed, which is how a cash order that somehow gets paid online, or a
  -- re-confirmation after a manual fix, avoids double-counting.
  if not o.stock_committed then
    for item in select * from tc_order_items where order_id = o.id order by slug loop
      update tc_products
         set stock_quantity    = stock_quantity - item.quantity,
             reserved_quantity = greatest(reserved_quantity - item.quantity, 0)
       where id = item.product_id;
    end loop;
  end if;

  update tc_orders
     set payment_status         = 'paid',
         paymob_transaction_id  = p_transaction_id,
         stock_committed        = true,
         reservation_expires_at = null,
         -- Paying confirms the order; fulfilment starts from there.
         fulfilment_status      = case when fulfilment_status = 'placed'
                                       then 'confirmed' else fulfilment_status end
   where id = o.id;

  insert into tc_order_status_history (order_id, status, note)
       values (o.id, 'confirmed', 'Payment confirmed by verified Paymob webhook.');

  return jsonb_build_object('result', 'confirmed', 'orderNumber', o.order_number);
end;
$$;

-- ------------------------------------------------------------------ failing

-- Releases a hold after a declined, cancelled or abandoned online payment.
create or replace function tc_fail_payment(
  p_order_number text,
  p_status       text,
  p_event_id     text,
  p_payload      jsonb default '{}'::jsonb
) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  o    tc_orders%rowtype;
  item record;
begin
  if p_status not in ('failed', 'cancelled') then
    raise exception 'invalid_payment_status' using errcode = 'P0001';
  end if;

  if p_event_id is not null then
    insert into tc_payment_events (provider, event_id, payload)
         values ('paymob', p_event_id, p_payload)
    on conflict (provider, event_id) do nothing;
    if not found then
      return jsonb_build_object('result', 'duplicate_event', 'orderNumber', p_order_number);
    end if;
  end if;

  select * into o from tc_orders where order_number = p_order_number for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;

  -- A paid order is never walked backwards by a late failure event.
  if o.payment_status = 'paid' then
    return jsonb_build_object('result', 'already_paid', 'orderNumber', o.order_number);
  end if;

  if not o.stock_committed then
    for item in select * from tc_order_items where order_id = o.id order by slug loop
      update tc_products
         set reserved_quantity = greatest(reserved_quantity - item.quantity, 0)
       where id = item.product_id;
    end loop;
  end if;

  update tc_orders
     set payment_status         = p_status,
         reservation_expires_at = null
   where id = o.id;

  insert into tc_order_status_history (order_id, status, note)
       values (o.id, o.fulfilment_status, format('Payment %s; reservation released.', p_status));

  return jsonb_build_object('result', p_status, 'orderNumber', o.order_number);
end;
$$;

-- --------------------------------------------------------------- expiry sweep

-- Releases reservations whose payment window has passed.
--
-- Run it on a schedule (pg_cron, or any scheduled job that can call an RPC).
-- Without it, an abandoned checkout holds the last cap until somebody
-- notices -- Paymob does not always send a cancellation for a customer who
-- simply closes the tab.
create or replace function tc_release_expired_reservations()
returns integer
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  o        record;
  item     record;
  released integer := 0;
begin
  for o in
    select * from tc_orders
     where stock_committed = false
       and payment_status = 'pending'
       and reservation_expires_at is not null
       and reservation_expires_at < now()
     order by created_at
       for update skip locked
  loop
    for item in select * from tc_order_items where order_id = o.id order by slug loop
      update tc_products
         set reserved_quantity = greatest(reserved_quantity - item.quantity, 0)
       where id = item.product_id;
    end loop;

    update tc_orders
       set payment_status = 'cancelled', reservation_expires_at = null
     where id = o.id;

    insert into tc_order_status_history (order_id, status, note)
         values (o.id, o.fulfilment_status, 'Payment window expired; reservation released.');

    released := released + 1;
  end loop;

  return released;
end;
$$;

revoke execute on function tc_attach_payment_reference(text, text, text) from public, anon, authenticated;
revoke execute on function tc_confirm_payment(text, text, integer, text, jsonb) from public, anon, authenticated;
revoke execute on function tc_fail_payment(text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function tc_release_expired_reservations() from public, anon, authenticated;

-- ###########################################################################
-- 0006_tracking_and_admin.sql
-- ###########################################################################

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

-- ###########################################################################
-- 0007_seed.sql
-- ###########################################################################

-- Seed: the two caps, the photograph supplied for each, and every Egyptian
-- governorate as a shipping destination.
--
-- IMPORTANT -- this seed ships the store CLOSED, and `active` is now the ONLY
-- thing holding it closed. Read that twice before changing anything here.
--
-- Every commercial figure below is real and supplied by the business:
--
--   price     950.00 EGP  -> 95000 piastres, both caps
--   stock     10 each     -> 20 in total
--   shipping  100.00 EGP  -> 10000 piastres, flat, every governorate
--
-- Earlier revisions of this seed were safe twice over: a price of zero and a
-- stock of zero each made a sale impossible on their own. That is no longer
-- true. Flipping `active` to true opens the shop immediately, at the real
-- price, against real stock -- so it is deliberately left false, and flipping
-- it is the launch decision itself rather than a step on the way to one.
--
-- Before flipping it, see docs/PRODUCTION-CHECKLIST.md. Photography, Paymob
-- credentials and a domain are all still outstanding.

-- 95000 piastres = 950.00 EGP, and 10 of each cap: a 20-piece first run.
--
-- Twenty, not forty. The run was halved after the figure was first supplied,
-- which matters more than it looks: a sell-out is now half as far away, and
-- there is no waiting list behind it. When it is gone it is gone.
--
-- `active` stays false. See the note at the top of this file -- it is the only
-- thing between this seed and a live shop now.
insert into tc_products (slug, name_ar, description_ar, price_piastres, stock_quantity, active, display_order)
values
  ('taiwan',  'تايوان يا ريس',        'كاب مطرّز بعبارة «تايوان يا ريس».',  95000, 10, false, 1),
  ('al-adou', 'العدو ليس بهذه القوة', 'كاب مطرّز بإحدى أشهر عبارات طاهر.', 95000, 10, false, 2)
on conflict (slug) do nothing;

-- Photography.
--
-- One photograph per cap has been supplied: the cap worn, shot from behind
-- against the sea. `base_path` is the stem; the optimiser writes the AVIF and
-- WebP variants beside it and the gallery builds its srcset from that.
--
-- Only the `main` view is seeded, because only the `main` view exists. Add a
-- row here as each further view is shot -- the gallery reads whatever is in
-- src/lib/catalog/products.ts and grows a thumbnail strip on its own.
insert into tc_product_images (product_id, view, base_path, alt_ar, width, height, display_order)
select p.id, 'main', '/images/products/' || p.slug || '/main', v.alt, 1600, 1600, 1
  from tc_products p
  join (values
    ('taiwan',
     'شخص يرتدي كاب «تايوان يا ريس» الأخضر، مصوَّرًا من الخلف أمام البحر، والعبارة مطرّزة بالأبيض على ظهر الكاب.'),
    ('al-adou',
     'شخص يرتدي كاب «العدو ليس بهذه القوة» النبيتي، مصوَّرًا من الخلف أمام البحر، والعبارة مطرّزة على سطرين.')
  ) as v(slug, alt) on v.slug = p.slug
on conflict (product_id, view) do nothing;

-- Cairo and Giza only, at a flat 100.00 EGP (10000 piastres).
--
-- This is the whole delivery area, and it is enforced here rather than in the
-- copy: a governorate with NO row cannot be quoted and cannot be ordered to.
-- That is the mechanism for refusing a destination -- delete its row, never
-- set its fee to zero, because zero means free delivery.
--
-- The FAQ on the storefront promises Cairo and Giza. If a row is ever added
-- for anywhere else, checkout will accept that order and the FAQ becomes a
-- lie, so add the row and fix the copy in the same change.
--
-- Flat because that is what was supplied: one figure, not a table of them.
-- Vary it per governorate in /admin once the courier's rate card is known.
insert into tc_shipping_zones (governorate, fee_piastres, cod_available, min_days, max_days)
values
  ('Cairo', 10000, true, null, null),
  ('Giza', 10000, true, null, null)
on conflict (governorate) do nothing;

-- The rest of Egypt, ready for the day the shop delivers there. Uncomment the
-- ones you want, run it, and update the delivery answer in
-- src/lib/catalog/copy.ts to match -- or just add them from /admin.
--
-- insert into tc_shipping_zones (governorate, fee_piastres, cod_available, min_days, max_days)
-- values
--   ('Alexandria', 10000, true, null, null),
--   ('Dakahlia', 10000, true, null, null),
--   ('Red Sea', 10000, true, null, null),
--   ('Beheira', 10000, true, null, null),
--   ('Fayoum', 10000, true, null, null),
--   ('Gharbia', 10000, true, null, null),
--   ('Ismailia', 10000, true, null, null),
--   ('Menofia', 10000, true, null, null),
--   ('Minya', 10000, true, null, null),
--   ('Qalyubia', 10000, true, null, null),
--   ('New Valley', 10000, true, null, null),
--   ('Suez', 10000, true, null, null),
--   ('Aswan', 10000, true, null, null),
--   ('Assiut', 10000, true, null, null),
--   ('Beni Suef', 10000, true, null, null),
--   ('Port Said', 10000, true, null, null),
--   ('Damietta', 10000, true, null, null),
--   ('Sharqia', 10000, true, null, null),
--   ('South Sinai', 10000, true, null, null),
--   ('Kafr El Sheikh', 10000, true, null, null),
--   ('Matrouh', 10000, true, null, null),
--   ('Luxor', 10000, true, null, null),
--   ('Qena', 10000, true, null, null),
--   ('North Sinai', 10000, true, null, null),
--   ('Sohag', 10000, true, null, null)
-- on conflict (governorate) do nothing;

-- ---------------------------------------------------------------------------
-- Opening the store. Run these once the real figures are known -- or do the
-- same thing from /admin, which is what it is for.
--
--   update tc_products set active = true where slug = 'taiwan';
--
-- And to vary the flat fee, or add the delivery estimate once the courier
-- confirms one:
--
--   update tc_shipping_zones set fee_piastres = 12000, min_days = 4, max_days = 6
--    where governorate = 'Aswan';
--
-- And to grant somebody the admin area, after they have been created in
-- Supabase Auth (see docs/ADMIN-SETUP.md):
--
--   insert into tc_admins (auth_user_id, email)
--   select id, email from auth.users where email = 'you@example.com';
-- ---------------------------------------------------------------------------

-- ###########################################################################
-- 0008_order_status.sql
-- ###########################################################################

-- The confirmation page's lookup.
--
-- When Paymob sends a customer back to the site, the browser arrives carrying
-- an order number and nothing else -- no mobile number to pair it with, so
-- tc_track_order cannot be used. This function fills that gap, and the way it
-- stays safe is by returning nothing worth stealing.
--
-- It deliberately returns LESS than tracking does: no name, no address, no
-- governorate, no timeline, no email. An order number on its own answers one
-- question -- "did this payment go through?" -- and the moment the customer
-- wants anything more they are sent to /track, which asks for the mobile
-- number as well.
create or replace function tc_order_status(p_order_number text)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  o tc_orders%rowtype;
begin
  select * into o from tc_orders
   where upper(order_number) = upper(btrim(p_order_number));

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'orderNumber',      o.order_number,
    'paymentMethod',    o.payment_method,
    'paymentStatus',    o.payment_status,
    'fulfilmentStatus', o.fulfilment_status,
    'total',            o.total_piastres,
    'subtotal',         o.subtotal_piastres,
    'shippingFee',      o.shipping_piastres,
    'discount',         o.discount_piastres,
    'placedAt',         o.created_at,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', i.slug, 'name', i.name_ar, 'quantity', i.quantity,
               'unitPrice', i.unit_price_piastres, 'lineTotal', i.line_total_piastres
             ) order by i.slug)
        from tc_order_items i where i.order_id = o.id
    ), '[]'::jsonb)
  );
end;
$$;

comment on function tc_order_status is
  'Payment state for a known order number. Returns no personal data: an order number alone never reveals a customer.';

-- Reached through the server function, which rate-limits it.
revoke execute on function tc_order_status(text) from public, anon, authenticated;

-- ===========================================================================
-- Done. Two things left, both in the Supabase dashboard:
--
-- 1. Make yourself an administrator. Create the user first under
--    Authentication -> Users -> Add user (tick "Auto Confirm User"), then run:
--
--      insert into tc_admins (auth_user_id, email)
--      select id, email from auth.users where email = 'you@example.com';
--
-- 2. Turn OFF public sign-ups:
--    Authentication -> Providers -> Email -> untick "Enable sign-ups".
--
-- Then open /admin on your deployed site, sign in, and activate the caps when
-- you are ready to open the shop.
-- ===========================================================================
