# Paymob

How online payment is wired up, how to test it in sandbox, and what must be
true before it is switched on for real money.

---

## The shape of it

```
  Browser                 This server                  Paymob
     │                         │                          │
     │  PLACE ORDER            │                          │
     ├────────────────────────►│                          │
     │                         │ tc_place_order           │
     │                         │  price + reserve stock   │
     │                         │                          │
     │                         │  POST /v1/intention/     │
     │                         ├─────────────────────────►│
     │                         │  client_secret           │
     │                         │◄─────────────────────────┤
     │  redirect to checkout   │                          │
     │◄────────────────────────┤                          │
     │                                                    │
     │  customer types their card ───────────────────────►│
     │                                                    │
     │                         │  POST /api/paymob/webhook│
     │                         │◄─────────────────────────┤   ← the only thing
     │                         │  verify HMAC             │     that can mark
     │                         │  tc_confirm_payment      │     an order paid
     │  back to /order/TC-…    │                          │
     │◄───────────────────────────────────────────────────┤
```

**The browser's return is not proof of payment.** A customer can navigate to
`/order/TC-XXXXXXXX` themselves, and so can anyone else. The order page reads
a status; only the verified webhook writes one.

---

## Credentials

Four values, all server-side, all in `.env` (and in the Vercel project for a
deploy). See `.env.example` for the exact variable names.

| Variable | Where to find it | What it does |
|---|---|---|
| `PAYMOB_SECRET_KEY` | Dashboard → Settings → API Keys | Authenticates intention creation, as `Authorization: Token <key>` |
| `PAYMOB_PUBLIC_KEY` | Dashboard → Settings → API Keys | Goes in the checkout URL. Visible to the browser by design; grants nothing alone |
| `PAYMOB_INTEGRATION_ID_CARD` | Dashboard → Developers → Payment Integrations | The numeric integration to charge through |
| `PAYMOB_HMAC_SECRET` | Dashboard → Settings → Account Info → HMAC | Verifies callbacks. Without it the webhook refuses everything |

> **Confirm these against the current documentation before going live.**
> Paymob has changed both its base URL and its credential names in the past,
> and it runs region-specific hosts for Egypt, Saudi Arabia, the UAE, Oman and
> Pakistan. The names above reflect the Unified Intention flow at the time of
> writing. `PAYMOB_API_BASE` and `PAYMOB_CHECKOUT_URL` exist precisely so a
> move does not need a code change.
>
> Reference: <https://developers.paymob.com/>

With any of the four missing, `paymobConfigured()` returns false, the checkout
does not offer online payment, and the shop runs cash-on-delivery only. That
is a safe state, not a broken one.

---

## Webhook

Paymob must be told where to post. In the dashboard set the **Transaction
Processed Callback** to:

```
https://<your-domain>/api/paymob/webhook
```

It is mounted in `src/server.ts`, not as a route, on purpose: a gateway
posting server-to-server carries no cookie and no CSRF token, and correctly
so, and it must not go through the server-function RPC layer.

### What the handler checks, in order

1. **`PAYMOB_HMAC_SECRET` is set.** If not, it answers 503 and processes
   nothing. Failing closed: an unverified callback could mark any order paid.
2. **The HMAC verifies.** SHA-512 over 20 named fields concatenated in a fixed
   order, compared in constant time. A bad or missing signature is a 401.
3. **The order number is recognisable.** Read from `extras`, then
   `payment_key_claims.extra`, then `merchant_order_id`.
4. **The transaction actually succeeded.** `success: true` is not enough — a
   voided or refunded transaction carries it too, and a pending one is neither
   yet. See `classify()`.
5. **The amount matches the order total.** Checked inside `tc_confirm_payment`,
   in SQL, so it cannot be skipped by a different caller. A mismatch is
   refused, recorded against the order's history, and answered 200 so Paymob
   stops retrying — it needs a human, not a retry.
6. **The event has not been seen before.** `tc_payment_events` has a unique
   `(provider, event_id)`; a redelivery inserts nothing and returns
   `duplicate_event` without touching stock or status.

### The HMAC field order

Twenty fields, concatenated with no separator, in exactly this sequence:

```
amount_cents, created_at, currency, error_occured, has_parent_transaction,
id, integration_id, is_3d_secure, is_auth, is_capture, is_refunded,
is_standalone_payment, is_voided, order.id, owner, pending, source_data.pan,
source_data.sub_type, source_data.type, success
```

Booleans render as lowercase `true`/`false`; absent fields as an empty string.
The list is pinned in `src/lib/paymob/hmac.ts` and asserted field-by-field in
`hmac.test.ts`, so a re-sort or a reorder fails the test rather than silently
rejecting every real callback.

---

## Testing in sandbox

1. Put the sandbox credentials in `.env`. Set `VITE_SITE_URL` to a public
   HTTPS origin — Paymob cannot reach `localhost`, so use a tunnel
   (`ngrok http 8080` or similar) and use the tunnel's URL.
2. Set the callback in the dashboard to `<tunnel>/api/paymob/webhook`.
3. `npm run dev`, add a cap to the cart, check out, choose **Pay online**.
4. Use Paymob's published sandbox test cards. Do not use a real card.

### What to verify

| Case | How | Expected |
|---|---|---|
| **Success** | Sandbox card that approves | Order `paid`, fulfilment `confirmed`, stock deducted, reservation released |
| **Failure** | Sandbox card that declines | Order `failed`, reservation released, cap sellable again |
| **Cancellation** | Close the tab mid-payment | Order stays `pending` until the reservation expires, then `cancelled` and released |
| **Duplicate webhook** | Re-POST the same body and `?hmac=` | `duplicate_event`; stock and status unchanged |
| **Bad signature** | POST with `?hmac=deadbeef` | 401; nothing changes |
| **No secret** | Unset `PAYMOB_HMAC_SECRET`, POST | 503; nothing changes |
| **Amount mismatch** | Confirm with the wrong amount | Refused, order stays unpaid, note recorded in the order's history |

The last four are covered by automated tests — `supabase/tests/schema.test.sql`
for the database side, `src/lib/paymob/*.test.ts` for the verification side —
so they can be re-checked with `./scripts/test-db.sh` and `npm test` without a
gateway.

### Expired reservations

An abandoned checkout holds stock until its reservation expires. Paymob does
not reliably send a cancellation for a customer who simply closes the tab, so
something has to sweep:

```sql
select tc_release_expired_reservations();
```

Schedule it (pg_cron, or any scheduler that can call an RPC) at least every
few minutes once the shop is live. Without it, an abandoned checkout holds the
last cap until somebody notices.

---

## Before real money

- [ ] Live credentials in the production environment, not sandbox
- [ ] Callback URL points at the production domain
- [ ] `VITE_SITE_URL` is the production origin
- [ ] One real end-to-end transaction completed and verified in the Paymob
      dashboard, and the order shows `paid` in `/admin`
- [ ] The reservation sweep is scheduled
- [ ] A refund has been walked through in the dashboard so the process is known

**Do not describe live payment as working until a real transaction has been
put through end to end.** Sandbox passing is not the same claim.
