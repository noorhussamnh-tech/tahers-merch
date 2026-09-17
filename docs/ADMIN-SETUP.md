# Admin setup

There is **no sign-up**. An administrator exists because somebody created an
account in Supabase and then inserted a row in `tc_admins` by hand. Both steps
are required: a valid Supabase account that is not on that list can sign in
and sees only "you are not an administrator", and every admin function refuses
it besides.

---

## Creating the first administrator

1. **Create the account.** Supabase dashboard → Authentication → Users → *Add
   user*. Use an email and password, and tick *Auto Confirm User* — there is
   no email flow in this app.

2. **Grant it.** SQL editor:

   ```sql
   insert into tc_admins (auth_user_id, email)
   select id, email from auth.users where email = 'you@example.com';
   ```

3. **Sign in** at `/admin`.

To remove somebody, delete their `tc_admins` row. Their Supabase account
survives; their access does not.

```sql
delete from tc_admins where email = 'former@example.com';
```

---

## Turn off public sign-up

The app never calls `signUp`, but the Supabase project must refuse it too, or
anyone can create an account against the project directly.

Dashboard → Authentication → Providers → Email:

- **Disable** *Enable sign-ups*
- Leave *Confirm email* on if sign-ups are ever re-enabled

Being able to sign up would not by itself grant admin — `tc_admins` decides
that — but there is no reason for strangers to hold accounts on this project.

---

## What an administrator can do

Three tabs, and nothing else:

**Products** — change the price, set the stock, activate or deactivate each
cap. Deactivating hides it from the storefront entirely (row-level security
removes the row, not just a button). Stock cannot be set below the units
already reserved for unpaid online orders; the form says so when it refuses.

**Orders** — search by order number or mobile number, see the full record
including the delivery address and the Paymob references, and move an order
along: placed → confirmed → packed → shipped → delivered. Cancelling returns
the stock, whichever way it left — a cash order had it deducted at checkout,
an unpaid online order still has it on hold — and asks for confirmation first.

**Shipping** — the fee, cash-on-delivery availability, and the delivery
estimate for each of the 27 governorates. A fee of zero means free delivery,
so the tab counts how many are still at zero and warns.

There is deliberately no revenue dashboard, no customer list, no export and no
bulk editing. Two products do not need them.

---

## Security notes

- `/admin` is `noindex, nofollow` and is disallowed in `robots.txt`.
- Admin calls go from the browser straight to Postgres with the
  administrator's own token. Every function re-checks `tc_is_admin()` itself,
  and the tables are guarded by row-level security besides. The service-role
  key is never used for admin work.
- A signed-in non-admin reading `tc_orders` gets zero rows — no policy matches
  them — rather than an error. An anonymous caller has no grant on the table
  at all.
- Both of those are asserted in `supabase/tests/rls.test.sql`, which runs as
  the real `anon` and `authenticated` roles.
