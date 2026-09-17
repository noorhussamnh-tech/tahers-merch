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
