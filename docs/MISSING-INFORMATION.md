# Missing business information

Everything the site needs that has not been supplied. Each item says what is
in the code today, where to change it, and what breaks if it ships as-is.

Nothing on this list has been invented. Where a figure was needed to make the
code run, the code ships in a state that *cannot transact* rather than one
that transacts on a guess — both products are seeded inactive, so there is no
window in which a deploy could sell a cap for nothing.

---

## Blocking — the shop cannot open without these

| # | What is missing | Placeholder today | Where to set it |
|---|---|---|---|
| 1 | **Price of each cap** | `0` piastres, product inactive | `/admin` → Products, or `update tc_products set price_piastres = …` |
| 2 | **Stock count for each cap** | `0` | `/admin` → Products |
| 3 | **Shipping fee per governorate** | `0` for all 27 | `/admin` → Shipping |
| 4 | **Product photography** | "Photo pending" panels | See *Photography* below |
| 5 | **Paymob credentials** | Blank | `.env` — see `docs/PAYMOB.md` |
| 6 | **Domain name** | `REPLACE-WITH-DOMAIN` | See *Domain* below |

A fee of `0` means free delivery, not "unset" — the database has no way to
express "unknown" for a `not null` column. The admin Shipping tab counts how
many governorates are still at zero and says so.

---

## Non-blocking — the shop works, but says less than it should

| # | What is missing | Placeholder today | Where to set it |
|---|---|---|---|
| 7 | **Material / fabric composition** | `"سيتم إضافة تفاصيل الخامة بعد تأكيدها."` | `src/lib/catalog/copy.ts` → `FAQ`, the `material` entry |
| 8 | **Delivery period per governorate** | `null` — no estimate is shown at all | `/admin` → Shipping, Min/Max days |
| 9 | **Return and exchange policy** | Generic sentence pointing at "the store policy" | `tc_store_settings` key `returns_policy_ar`, and the `returns` FAQ entry |
| 10 | **Support contact** (WhatsApp / email) | `null` | `tc_store_settings` key `support_contact` |
| 11 | **Which governorates allow cash on delivery** | All 27 allow it | `/admin` → Shipping, COD column |
| 12 | **Discount codes** | None — `{}` | `tc_store_settings` key `discount_codes` |

On (8): the storefront shows no delivery estimate at all while these are null,
rather than a guessed number of days. The FAQ answer already says the period
depends on the governorate and appears at checkout, which stays true.

On (12): the `APPLY` control and the whole discount mechanism are built and
tested. No codes exist because none were supplied. The format is:

```json
{ "TAHER10": { "type": "percent", "value": 10, "active": true },
  "OFF50":   { "type": "fixed",   "value": 5000, "active": true } }
```

`value` is whole percent for `percent`, and **piastres** for `fixed`
(`5000` = 50 EGP). Codes are matched case-insensitively.

---

## Photography

The brief forbids generated replacement imagery, and none has been produced.
Every photograph is a clearly-marked "photo pending" panel until real files
arrive.

To add them:

1. Put the originals in `public/images/products/<slug>/originals/<view>.jpg`,
   where `<slug>` is `taiwan` or `al-adou` and `<view>` is one of
   `main`, `front`, `side`, `back`, `detail`.
2. `npm install --no-save sharp && node scripts/optimize-images.mjs`
   — this writes the AVIF/WebP variants and the JPEG fallback, preserving the
   aspect ratio and never cropping.
3. Set `placeholder: false` on those entries in
   `src/lib/catalog/products.ts`.
4. Check the Arabic alt text in the same file describes what each photograph
   actually shows.

`allPhotographySupplied()` in that file returns true once none are left.

---

## Domain

`REPLACE-WITH-DOMAIN` appears in four places and all four must change
together, or the canonical URLs and structured data will point at nothing:

- `src/lib/seo/structured-data.ts` → `SITE_ORIGIN`
- `src/routes/index.tsx` → the canonical link
- `public/robots.txt` → the `Sitemap:` line
- `public/sitemap.xml` → all three `<loc>` entries

And set `VITE_SITE_URL` in the deployment environment to the same origin —
that one is what Paymob is told to redirect back to, so a wrong value sends
paying customers to the wrong host.

---

## Decisions taken in the absence of instruction

Recorded so they can be overridden deliberately rather than discovered later.

| Decision | What was chosen | Why | Where to change |
|---|---|---|---|
| **COD reservation policy** | Cash orders deduct stock immediately and never reserve | There is no payment step that can fail, so holding the unit would only make it unsellable. Cancelling returns it. | `tc_place_order` in `0004_checkout.sql` |
| **Online payment hold** | 30 minutes, then the reservation is released | Long enough to finish a card payment, short enough that an abandoned tab does not hold the last cap all day | `tc_store_settings` key `reservation_minutes` |
| **Discount vs. shipping** | Discounts apply to goods only; shipping is always charged | The courier is paid regardless of what the customer paid for the cap | `tc_place_order` |
| **Max per line** | 5 of each cap | Limited run; also caps abuse | `MAX_QUANTITY_PER_LINE` in `src/lib/domain/validation.ts` |
| **Stock shown to customers** | Exact count only at 5 or fewer, otherwise just "available" | A precise stock figure above that is not useful to a customer and not the shop's to publish | `Availability` in `src/components/product-section.tsx` |
| **Order number format** | `TC-` + 8 random characters from a 32-letter alphabet with no I, L, O or U | Non-sequential so orders cannot be enumerated; unambiguous when read aloud | `tc_generate_order_number` in `0002_orders.sql` |

---

## Not built, deliberately

The brief rules these out and nothing in the code anticipates them: collections,
categories, related products, wishlists, customer accounts, a blog, a
newsletter, product reviews, drop numbers, lookbooks, and any product beyond
the two caps. The storefront knows exactly two slugs; a third row in
`tc_products` would not render.
