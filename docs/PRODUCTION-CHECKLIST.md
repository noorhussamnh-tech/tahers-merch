# Production checklist

Work top to bottom. The shop ships **closed** — both caps inactive, every
price zero — so nothing here is urgent until you want to open it, and nothing
can be sold before section 2 is done.

---

## 1. Infrastructure

- [ ] Supabase project created, migrations `0001`–`0008` applied in order
- [ ] Seed confirmed: `select slug, active from tc_products` → two rows, both
      `false`
- [ ] Service-role key set in the deployment environment, **not** prefixed
      `VITE_`
- [ ] `VITE_SITE_URL` is the production origin
- [ ] Domain registered, added to Vercel, and `REPLACE-WITH-DOMAIN` replaced
      in all four files (see `docs/MISSING-INFORMATION.md`)
- [ ] At least one administrator in `tc_admins`, and sign-in verified
- [ ] Public sign-up disabled in Supabase Auth
- [ ] `tc_release_expired_reservations()` scheduled

## 2. Business information — the shop cannot open without these

- [ ] Price set on both caps
- [ ] Stock set on both caps
- [ ] Shipping fee set for every governorate you deliver to
- [ ] Governorates you do **not** deliver to: delete their `tc_shipping_zones`
      row, so checkout refuses them rather than quoting free delivery
- [ ] Cash-on-delivery availability set per governorate
- [ ] Both caps activated — **do this last**

Leaving a governorate at a fee of zero means free delivery there. The admin
Shipping tab counts how many are still at zero.

## 3. Photography

- [ ] Real photographs in `public/images/products/<slug>/originals/`
- [ ] `node scripts/optimize-images.mjs` run
- [ ] `placeholder: false` set in `src/lib/catalog/products.ts`
- [ ] `allPhotographySupplied()` returns true
- [ ] Arabic alt text checked against what each photograph actually shows
- [ ] No photograph is cropped through the embroidery

## 4. Payment

- [ ] Sandbox: success, failure, cancellation, duplicate webhook, bad
      signature, amount mismatch — all behave as `docs/PAYMOB.md` describes
- [ ] Live credentials set in production
- [ ] Callback URL points at the production domain
- [ ] **One real end-to-end transaction completed and verified in the Paymob
      dashboard**, and the order reads `paid` in `/admin`

> Until that last box is ticked, do not tell anyone live payment works.
> Sandbox passing is a different claim.

## 5. Copy and content

- [ ] Material answer replaced once the manufacturer confirms it
- [ ] Return and exchange policy written, in `tc_store_settings`
      (`returns_policy_ar`) and the FAQ
- [ ] Support contact set (`support_contact`)
- [ ] Delivery periods set per governorate, or left null so no estimate shows
- [ ] Every Arabic string proofread by a native reader —
      `src/lib/catalog/copy.ts` and `products.ts` hold all of it
- [ ] Taher's phrases checked character by character against how he says them

## 6. Checks that must pass

```sh
npm run verify                         # lint, typecheck, 97 unit tests, build
DATABASE_URL=… ./scripts/test-db.sh    # schema, RLS, concurrency
```

- [ ] `npm run verify` clean
- [ ] `./scripts/test-db.sh` clean, against a database built from the
      migrations as they will be deployed

## 7. Manual pass, on the deployed site

**Layout**

- [ ] Desktop at 1440px: hero splits ~40/60, header ~100px with a hairline
      under it, content capped and centred
- [ ] Phone at 320px: nothing overflows sideways, the photograph comes before
      the text, the sticky ADD TO CART bar appears on a product page and not
      twice on the homepage
- [ ] Arabic blocks read right to left; navigation, buttons and the whole
      checkout read left to right and stay English
- [ ] No Taher phrase breaks across a line awkwardly at any width

**Commerce**

- [ ] Add to cart, hard-refresh, cart survives
- [ ] Quantity up and down; going below one removes the line
- [ ] Set a cap's stock to 0 in admin → storefront says sold out and the
      button is disabled
- [ ] Checkout with an invalid mobile number → field error, no order created
- [ ] Cash order completes, shows an order number, stock drops by the quantity
- [ ] Online order sends you to Paymob and comes back to the right page

**Privacy**

- [ ] Track with the right order number and mobile → the order
- [ ] Track with the right order number and a wrong mobile → the same "not
      found" message, not a different one
- [ ] The tracking result contains no street address, no email, no notes
- [ ] `/admin` in a signed-out browser → sign-in, not data
- [ ] A signed-in non-admin at `/admin` → refused

**Headers**

- [ ] `curl -I https://<domain>/` shows `content-security-policy`,
      `strict-transport-security`, `x-frame-options: DENY`
- [ ] The client bundle contains no secrets:

  ```sh
  grep -rl "SUPABASE_SERVICE_ROLE_KEY\|PAYMOB_SECRET_KEY\|PAYMOB_HMAC_SECRET" \
    .vercel/output/static   # must find nothing
  ```

## 8. Launch day

- [ ] Both caps activated
- [ ] One test order placed on production and then cancelled in admin —
      confirm the stock comes back
- [ ] Somebody is watching `/admin` for the first orders
- [ ] Somebody knows how to answer the support contact

---

## After launch

- Reservations released on time (watch `reserved_quantity` on both products;
  it should not creep upwards)
- Orders stuck in `pending` for more than an hour — a webhook that is not
  arriving
- Any `AMOUNT MISMATCH` in the logs — that is a human's problem, immediately
- `tc_rate_limits` growing without bound → schedule `tc_sweep_rate_limits()`
