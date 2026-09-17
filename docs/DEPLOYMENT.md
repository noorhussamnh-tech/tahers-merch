# Deployment

Target is Vercel, which is what `vercel.json` and the Nitro preset assume. Any
Nitro target works — set `NITRO_PRESET` — but the notes on client IPs below
are specific to running behind a proxy that rewrites `x-forwarded-for`.

---

## 1. Supabase

1. Create a project. Note the URL and the **publishable** key (Project
   Settings → API Keys), and the **service role** key from the same page.
2. Apply the migrations, in order:

   ```sh
   supabase db push          # with the CLI linked to the project
   # or paste supabase/migrations/*.sql into the SQL editor, 0001 first
   ```

3. Confirm the seed landed and the shop is closed as intended:

   ```sql
   select slug, price_piastres, stock_quantity, active from tc_products;
   -- both rows: price 0, stock 0, active false
   ```

4. Create an administrator — see `docs/ADMIN-SETUP.md`.

5. Schedule the reservation sweep. Without it an abandoned online checkout
   holds its stock indefinitely:

   ```sql
   select cron.schedule(
     'release-expired-reservations', '*/5 * * * *',
     $$ select tc_release_expired_reservations() $$
   );
   ```

   (Enable the `pg_cron` extension first, or call the function from any
   external scheduler.)

---

## 2. Vercel

1. Import the repository. Framework preset: **Other**. The build command and
   install command come from `vercel.json`.
2. Set the environment variables from `.env.example` in Project Settings →
   Environment Variables. Set them for **Production** and **Preview**
   separately, and point Preview at a separate Supabase project if you want
   preview deploys that cannot touch real orders.
3. `VITE_SITE_URL` must be the real production origin. It is what Paymob is
   told to redirect back to and to post its webhook to, so a wrong value sends
   paying customers to the wrong host.
4. Deploy, then add the domain.

### Preview deployments

Vercel gives every preview a unique URL, which `VITE_SITE_URL` will not match.
Online payment therefore does not work correctly on previews unless that
variable is set per-deployment. Test payment on production or on a stable
staging domain, not on a preview.

---

## 3. Domain

Register it, add it in Vercel, then replace `REPLACE-WITH-DOMAIN` in all four
places listed in `docs/MISSING-INFORMATION.md`. They must change together or
the canonical URLs and structured data point at nothing.

---

## 4. Paymob

See `docs/PAYMOB.md`. Sandbox first, and do not describe live payment as
working until a real transaction has gone through end to end.

---

## Notes on the runtime

**Client IP and rate limiting.** Checkout, tracking and the order-status
lookup are rate-limited by client address, read from `x-forwarded-for`. That
header is only trustworthy because Vercel overwrites it with the real client
address. On a host that does not, it is a header an attacker sets freely and
the limits become decorative — see `callerId()` in `src/lib/api/checkout.ts`
before moving hosts.

**Security headers** are applied in `src/server.ts`, not in a host config, so
they travel with the app to any target. The CSP allows Google Fonts for
stylesheets and font files, the Supabase origin for data, and nothing else.
It does not need to allow Paymob: the customer is sent there by a top-level
navigation, and Paymob talks back to the server.

**Caching.** HTML documents are `no-store`, because order pages carry a
customer's own details. Static assets are exempt and cache normally.

---

## Verifying a deploy

```sh
npm run verify            # lint, typecheck, unit tests, production build
DATABASE_URL=… ./scripts/test-db.sh   # schema, RLS and concurrency, on a dev database
```

`test-db.sh` drops and recreates the public schema. It refuses a URL
containing "prod", but that is a guard, not a guarantee — point it at a
development database.

Then, on the deployed site:

- [ ] Homepage renders, both caps present, Arabic reads right to left
- [ ] Navigation and buttons read left to right and are in English
- [ ] `/product/taiwan` and `/product/al-adou` load and are in the sitemap
- [ ] Add to cart, reload the page, cart survives
- [ ] Checkout quotes a shipping fee once a governorate is chosen
- [ ] A cash order completes and shows an order number
- [ ] That order number plus its mobile number tracks; a wrong mobile does not
- [ ] `/admin` refuses an account that is not in `tc_admins`
- [ ] `curl -I https://<domain>/` shows the CSP and HSTS headers
