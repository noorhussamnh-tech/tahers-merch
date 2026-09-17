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
