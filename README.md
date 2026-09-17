# Taher Caps

A shop that sells two caps.

Both carry phrases by the Egyptian writer and creator Taher El Moataz Bellah —
**«تايوان يا ريس»** and **«العدو ليس بهذه القوة»**. There is no third product,
no collection, and no plan for one: the storefront knows exactly two slugs, and
a third row in the database would not render.

- **Frontend** — TanStack Start (React 19, Vite, Tailwind v4)
- **Database and auth** — Supabase (Postgres + Supabase Auth)
- **Payments** — Paymob (Unified Intention), and cash on delivery
- **Hosting** — Vercel

---

## Contents

1. [Running it locally](#1-running-it-locally)
2. [What the site is](#2-what-the-site-is)
3. [How it is put together](#3-how-it-is-put-together)
4. [Money, stock and the things that must not go wrong](#4-money-stock-and-the-things-that-must-not-go-wrong)
5. [Testing](#5-testing)
6. [The Arabic, and where it lives](#6-the-arabic-and-where-it-lives)
7. [Photography](#7-photography)
8. [Further documentation](#8-further-documentation)

---

## 1. Running it locally

Requires Node 22+ or Bun 1.1+.

```sh
git clone <this-repository>
cd taher-caps
bun install            # or: npm install
cp .env.example .env   # then fill in at least the Supabase values
bun run dev            # http://localhost:8080
```

The site renders without Supabase — the copy and the layout are static — but
both caps read as unavailable and a notice says why.

To get a working shop, apply `supabase/migrations/*.sql` in order to a
Supabase project, set the two `VITE_SUPABASE_*` values and
`SUPABASE_SERVICE_ROLE_KEY`. Price, stock and shipping are already seeded; the
only thing left is to activate the caps in `/admin` when you mean to open. See
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

### Commands

| | |
|---|---|
| `bun run dev` | Development server |
| `bun run build` | Production build |
| `bun run verify` | Lint, typecheck, unit tests, build — run this before pushing |
| `bun run test` | Unit tests |
| `./scripts/test-db.sh` | Schema, row-level security and concurrency tests (needs `DATABASE_URL`) |
| `node scripts/optimize-images.mjs` | Turn supplied photographs into the AVIF/WebP variants |

---

## 2. What the site is

One page, plus the pages an order needs.

| Route | What it is |
|---|---|
| `/` | Hero, the two caps, about, FAQ |
| `/product/taiwan`, `/product/al-adou` | One cap, on its own URL, for linking to |
| `/checkout` | Name, address, payment method |
| `/order/:orderNumber` | Confirmation, and where Paymob returns the customer |
| `/track` | Order status, by order number **and** mobile number |
| `/admin` | Price, stock, orders, shipping fees |
| `/api/paymob/webhook` | Server-to-server, mounted in `src/server.ts` |

### The language rule

Everything a customer **reads** is Arabic. Everything a customer **operates**
is English — navigation, buttons, form labels, statuses.

The document is `lang="en" dir="ltr"`, and each Arabic block sets `dir="rtl"`
for itself. Setting the page to RTL would flip the checkout form and the
English controls with it, which is the failure this arrangement avoids.

---

## 3. How it is put together

```
src/
  routes/            pages; file-based routing
  components/        header, cart, gallery, product sections
  lib/
    catalog/         all copy and all photography configuration
    cart/            cart state, and its storage rules
    domain/          money, validation, totals, Egypt-specific rules — pure, tested
    api/             server functions (checkout, tracking, catalogue, order status)
    paymob/          intention creation, HMAC verification, the webhook
    supabase/        browser client, service client, public server client
  server.ts          request entry: mounts the webhook, applies security headers
supabase/
  migrations/        0001–0008, applied in order
  tests/             SQL tests, run by scripts/test-db.sh
```

Three rules hold the shape:

**Copy lives in `lib/catalog`.** Not in components. Every Arabic string — the
hero, the product phrases, the about section, the FAQ — is in `copy.ts` or
`products.ts`, so it can be proofread in one pass and no component can invent a
line.

**Anything with money in it is server-side.** `lib/api` and anything named
`*.server.ts` never reaches the browser; the build enforces it and the
production checklist greps the bundle to be sure.

**The database is the last word.** Prices, totals and stock are decided in
SQL, inside one transaction, whatever the browser sent.

---

## 4. Money, stock and the things that must not go wrong

### Prices are never taken from the browser

A checkout request carries slugs, quantities and an address. Nothing else with
a number on it. `tc_place_order` looks up the price, looks up the shipping fee,
resolves any discount code against settings the browser cannot read, does the
arithmetic, and reserves the stock.

A request that smuggles in `"unitPrice": 1` is priced exactly like one that
does not. There is a test for that.

The cart in `localStorage` holds slugs and quantities — never prices. A cart
can sit in a browser for a month; a price that sits with it goes stale.

### Everything is in piastres

Integers, never floats. `0.1 + 0.2 !== 0.3`, and a cart that disagrees with
the gateway by one piastre is a rejected payment. Paymob's `amount_cents` is
an integer too, so this is the representation nothing has to convert away from.

### Stock cannot be oversold

Two customers after the last cap serialise on a row lock. The second reads the
first one's reservation and is refused — not the stale count it saw on the
product page.

`supabase/tests/concurrency.sh` proves it with two real connections:

```
  ok    customer A got the cap
  ok    customer B was refused
  ok    exactly one order exists
  ok    stock is zero, not minus one
  ok    nothing is left reserved
```

Cash and card behave differently on purpose:

| | Cash on delivery | Online payment |
|---|---|---|
| At checkout | Stock deducted immediately | Held in `reserved_quantity` |
| Why | No payment step can fail, so a hold would only make the unit unsellable | The money has not arrived yet |
| If it fails | — | Hold released, cap sellable again |
| If abandoned | — | Released after 30 minutes by `tc_release_expired_reservations()` |

### Only a verified webhook marks an order paid

The customer's browser coming back from Paymob proves nothing — anyone can
navigate to that URL. The webhook verifies an HMAC-SHA512 over 20 named fields
in a fixed order, compared in constant time; then the database compares the
captured amount against the order's own total and refuses a mismatch; then a
unique `(provider, event_id)` makes a redelivery a no-op.

Missing `PAYMOB_HMAC_SECRET` means the webhook refuses everything. It fails
closed.

### Order tracking gives up as little as possible

`tc_track_order` needs the order number **and** the mobile number, and builds
its result field by field. There is no row to over-fetch from: no internal id,
no email, no street address, no delivery notes, no internal notes, no mention
of any other order.

A wrong pair returns the same nothing as an unknown order. Distinguishing them
would confirm that an order number exists to somebody guessing at them — and
order numbers are random precisely so they cannot be walked.

### Row-level security is the fence, not the UI

An anonymous visitor can read active products, their photographs, the shipping
fees and the settings marked public. Nothing else — not by policy and not by
grant. A signed-in person who is not an administrator reads zero orders.

`supabase/tests/rls.test.sql` asserts this as the real `anon` and
`authenticated` roles, because a test that runs as the owner proves nothing.

---

## 5. Testing

```sh
bun run verify                        # lint, typecheck, 97 unit tests, production build
DATABASE_URL=… ./scripts/test-db.sh   # schema, RLS, concurrency
```

Unit tests cover the money arithmetic, Egyptian mobile-number normalisation
(including Arabic-Indic digits), order totals and discount clamping, the cart's
tolerance of a corrupt stored value, the Paymob HMAC, and how a callback is
classified — including that a voided transaction is not "paid" despite
carrying `success: true`.

The SQL suite covers what a browser test cannot reach: two customers racing for
the last cap, a webhook arriving twice, a payment for the wrong amount, a late
failure against an already-paid order, an expired reservation, what tracking
refuses to return, and what each database role can actually select.

`test-db.sh` drops and recreates the public schema. Point it at a development
database.

---

## 6. The Arabic, and where it lives

| What | Where |
|---|---|
| Hero, about, FAQ, functional labels | `src/lib/catalog/copy.ts` |
| Product names, phrases, descriptions, alt text | `src/lib/catalog/products.ts` |

Taher's phrases are quoted, not written. Nothing in this repository may add a
line attributed to him that he did not say, and the comments in both files say
so.

The hierarchy on a product section is deliberate and is the thing to preserve
if that component is ever reworked: the product name, then the main phrase in
the editorial serif, then the second line smaller, then — once, tiny, as a
caption on the photography — the aside. Giving all three the same weight is the
failure mode.

---

## 7. Photography

**No cap imagery has been generated, and none should be.**

One photograph per cap has been supplied — each shows the cap worn, from
behind, against the sea. The catalogue and the seed describe exactly those two,
with Arabic alt text for what is actually in frame. The **files are not in the
repository yet**, so both still render as a "photo pending" panel.

To add them:

```sh
# 1. save the two photographs as:
#      public/images/products/taiwan/originals/main.jpg    (green cap)
#      public/images/products/al-adou/originals/main.jpg   (burgundy cap)
npm install --no-save sharp
node scripts/optimize-images.mjs
# 2. set PHOTO_READY = true in src/lib/catalog/products.ts
```

Only the `main` view exists. Front, side and a close crop of the embroidery
would each earn their place — one back-of-head shot does not show a customer
the fit or the stitch. Adding one is an entry in the product's `images` array;
the gallery grows a thumbnail strip on its own.

The script writes AVIF and WebP at four widths plus a JPEG fallback, keeps the
originals untouched as masters, and never crops — the embroidery is the
product. The gallery uses `object-contain` for the same reason: a photograph
whose aspect ratio differs from the frame is letterboxed, not sliced.

---

## 8. Further documentation

| | |
|---|---|
| [`docs/MISSING-INFORMATION.md`](docs/MISSING-INFORMATION.md) | Everything the business has not supplied, and every decision taken in its absence |
| [`docs/PAYMOB.md`](docs/PAYMOB.md) | The payment flow, sandbox testing, and what must be true before real money |
| [`docs/ADMIN-SETUP.md`](docs/ADMIN-SETUP.md) | Creating an administrator; disabling public sign-up |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Supabase, Vercel, domain, and the runtime notes that matter |
| [`docs/PRODUCTION-CHECKLIST.md`](docs/PRODUCTION-CHECKLIST.md) | Everything to do before opening the shop |

---

## Current state

The shop ships **closed**, and `active = false` is the only thing holding it
closed. Every commercial figure is real: 950.00 EGP a cap, 20 of each, and a
flat 100.00 EGP to deliver anywhere in Egypt.

That is a change worth noticing. Earlier the shop was safe twice over — a price
of zero and a stock of zero each made a sale impossible on their own. Now
flipping `active` in `/admin` opens a real shop at a real price against real
stock. It is the launch decision, not a step on the way to one.

**Nothing is deployed.** There is no URL yet: the site needs a Supabase project
and a host before it has one. See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

Live payment is **not** verified. The Paymob integration is complete and
tested against its own test suite, but no real transaction has been put
through, and no merchant credentials have been configured. Do not describe it
as working until both are true.
