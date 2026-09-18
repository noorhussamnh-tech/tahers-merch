# Missing business information

Everything the site needs that has not been supplied. Each item says what is
in the code today, where to change it, and what breaks if it ships as-is.

Nothing on this list has been invented.

**Every commercial figure is now real.** Price, stock and shipping have all
been supplied, which means `active = false` is the only thing holding the shop
closed — earlier it was safe twice over, because a price of zero and a stock of
zero each made a sale impossible on their own. Flipping `active` now opens a
real shop at a real price against real stock. Treat it as the launch decision,
not as a step on the way to one.

---

## Blocking — the shop cannot open without these

| # | What is missing | Placeholder today | Where to set it |
|---|---|---|---|
| 1 | **Photograph files** | "Photo pending" panels | See *Photography* below |
| 2 | **Paymob credentials** | Blank | `.env` — see `docs/PAYMOB.md` |
| 3 | **Domain name** | `REPLACE-WITH-DOMAIN` | See *Domain* below |
| 4 | **A deployed site** | Nothing is hosted anywhere | See `docs/DEPLOYMENT.md` |

Nothing here stops a **cash-on-delivery** shop working — that path needs only
a Supabase project and a deploy. Paymob is what online card payment needs, and
photography is what makes it worth visiting.

### Supplied

- **Price — 950.00 EGP**, both caps, seeded as `95000` piastres.
- **Stock — 20 of each cap**, 40 in the first run.
- **Shipping — 100.00 EGP flat**, seeded as `10000` piastres against **Cairo
  and Giza, and nowhere else**. The delivery area is the set of rows in
  `tc_shipping_zones`: a governorate without one cannot be quoted and cannot be
  ordered to, which is what makes the FAQ's "Cairo and Giza only" true rather
  than merely stated. Add a row and the promise breaks, so add the row and the
  copy together. Flat because one figure was supplied, not a table of them.
- **Cap colours** — green with white thread (تايوان يا ريس), burgundy with
  cream thread (العدو ليس بهذه القوة). Recorded on `ProductContent.colour` in
  `src/lib/catalog/products.ts` and shown on each product section. The brief
  forbids altering either, so they are written down rather than implied.

To refuse a governorate, **delete its `tc_shipping_zones` row** — a destination
with no row cannot be quoted or ordered to. Do not set its fee to zero: zero
means free delivery, and the database has no way to express "unknown" for a
`not null` column.

---

## Non-blocking — the shop works, but says less than it should

| # | What is missing | Placeholder today | Where to set it |
|---|---|---|---|
| 6 | **Material / fabric composition** | `"سيتم إضافة تفاصيل الخامة بعد تأكيدها."` | `src/lib/catalog/copy.ts` → `FAQ`, the `material` entry |
| 7 | **Delivery period per governorate** | `null` — no estimate is shown at all | `/admin` → Shipping, Min/Max days |
| 8 | **Return and exchange policy** | Generic sentence pointing at "the store policy" | `tc_store_settings` key `returns_policy_ar`, and the `returns` FAQ entry |
| 9 | **Support contact** (WhatsApp / email) | `null`, and the privacy page says so in as many words | `tc_store_settings` key `support_contact`, and the CONTACT section of `src/routes/privacy.tsx` |
| 9b | **An Arabic privacy page** | English only, matching the FAQ — but the customers read Arabic and this is the one page where precision matters to them | `src/routes/privacy.tsx` |
| 10 | **Which governorates allow cash on delivery** | Cairo and Giza, the only two seeded | `/admin` → Shipping, COD column |
| 11 | **Discount codes** | None — `{}` | `tc_store_settings` key `discount_codes` |

On (7): the storefront shows no delivery estimate at all while these are null,
rather than a guessed number of days. The FAQ answer already says the period
depends on the governorate and appears at checkout, which stays true.

On (11): the `APPLY` control and the whole discount mechanism are built and
tested. No codes exist because none were supplied. The format is:

```json
{ "TAHER10": { "type": "percent", "value": 10, "active": true },
  "OFF50":   { "type": "fixed",   "value": 5000, "active": true } }
```

`value` is whole percent for `percent`, and **piastres** for `fixed`
(`5000` = 50 EGP). Codes are matched case-insensitively.

---

## Photography

**One photograph per cap exists** — the cap worn, shot from behind against the
sea. The catalogue and the seed describe exactly those two and nothing more;
the Arabic alt text describes what is actually in each frame.

The **files themselves are not in the repository yet.** They were shared as
images in conversation, not as files, so nobody has been able to write the
bytes into `public/images/`. Until they are there, both render as a
"photo pending" panel rather than a broken image.

To add them:

1. Save the two photographs as:
   - `public/images/products/taiwan/originals/main.jpg` — the green cap
   - `public/images/products/al-adou/originals/main.jpg` — the burgundy cap
2. `npm install --no-save sharp && node scripts/optimize-images.mjs`
   — writes the AVIF/WebP variants and the JPEG fallback, preserving the
   aspect ratio and never cropping.
3. Set `PHOTO_READY = true` in `src/lib/catalog/products.ts`. It is one switch
   because both caps are in the same state.

Then check: the placeholder panels are gone, and
`allPhotographySupplied()` returns true.

### Further views

Only the `main` view exists. Front, side, and a close crop of the embroidery
would each earn their place — the embroidery is the product, and one
back-of-head shot does not show a customer the fit or the stitch quality. When
they are shot, add an entry to the product's `images` array and a row to the
`tc_product_images` seed; the gallery grows a thumbnail strip on its own once
there is more than one.

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
