# Running Taher's Merch

This is the whole job, in plain language. No code, nothing technical. If you
can read a spreadsheet and send a WhatsApp message, you can run this shop.

Read it once. After that it is a page you come back to when something looks
wrong.

---

## 1. Who does what

Three jobs. They can be three people or one person, but each one needs a name
against it, because "someone will notice" is how orders get missed.

| The job | What it actually is | How long | Name |
|---|---|---|---|
| **Order watch** | Open the orders list, check for new orders, mark them along | 5 min, once a day | ______ |
| **Fulfilment** | Get the caps to the courier, with the right addresses | Depends on volume | ______ |
| **Decisions** | Price, stock, closing the shop, answering an angry customer | As needed | ______ |

Fill the names in. Today. An unnamed job is an undone job.

**On launch day, order watch is hourly, not daily.** That is the day orders
arrive in a burst, and it is the day the experience people remember is formed.

---

## 2. Your two links

| | |
|---|---|
| **The shop** | https://tahers-merch.vercel.app |
| **The back office** | https://tahers-merch.vercel.app/admin |

The back office asks for an email and password. It is not linked from the
shop and search engines are told to ignore it. Only people you have added can
get in.

Inside there are three tabs: **products**, **orders**, **shipping**.

---

## 3. The daily check — five minutes

1. Open **/admin** → **orders**.
2. Any order you have not seen? Handle it (section 4).
3. Go to **products**. Look at the **Stock** number on both caps.
4. Done.

That is the entire routine. If you do nothing else, do this.

**What you are looking for on the products tab:**

- **Stock** — how many are left to sell. When it hits 0 the shop stops taking
  orders for that cap on its own. You do not have to do anything.
- **Reserved** — caps being held for someone mid-payment. This should be small
  and should keep dropping back to zero. If it sits high for hours, say so and
  it will be looked at.

---

## 4. An order arrives

Right now every order is **cash on delivery**. Nobody has paid yet. The money
is collected at the door.

Open **/admin** → **orders**. Each order shows the customer, their phone, the
address, what they ordered, and what to collect.

Move it along by clicking the buttons, in this order:

| Click | It means |
|---|---|
| **placed** | It arrived. This is automatic — you do not click it |
| **confirmed** | You have seen it and it is real |
| **packed** | The cap is in a bag with the address on it |
| **shipped** | The courier has it |
| **delivered** | The customer has it and you have the money |

**Do this as it happens, not at the end of the week.** The customer's tracking
page shows exactly what you have clicked. If you never click past "placed",
they think you have forgotten them, and they message you — which costs you
more time than clicking would have.

**Cancelling.** There is a Cancel button. It asks you to confirm, because
cancelling puts the cap back into stock so somebody else can buy it. Use it
when an order falls through. Do not use it to tidy the list.

---

## 5. Sending orders to the courier

On the **orders** tab there is an **Export CSV** button.

1. Click it. A file downloads.
2. Open it in Google Sheets or Excel. Every order, every address, and how much
   cash to collect from each one.
3. Send it to the courier however they want it.

Two things it does for you quietly: phone numbers keep their leading zero, and
Arabic names do not turn into gibberish. Both of those ruin a courier's upload
if they go wrong.

**One thing to check every time:** the "Cash to collect" column. An order that
has already been paid online shows 0. Never let a courier collect cash on a
paid order — that is a customer charged twice, and it is very hard to undo.

**Whoever exports the file owns those orders until the courier confirms
receipt.** Write that person's name in section 1. The handover is the moment
things get dropped.

---

## 6. Stopping the shop

You will want this at some point. Sold out, a problem with the manufacturer,
or you just need the orders to stop while you catch up.

**/admin** → **products** → click **Active** on a cap to turn it off.

That cap disappears from the shop immediately. Nobody can order it. Orders
already placed are untouched. Click it again to bring it back.

This is your emergency brake. It is instant and it is reversible. Use it
without hesitating — it is better to close for an hour than to take orders you
cannot fill.

---

## 7. When something looks wrong

| What you see | What it means | What to do |
|---|---|---|
| A change I made "isn't showing" | The site is still serving an older version | Open `/api/version` on the site. If the version is not the latest, it is still publishing. Wait, then check Vercel's Deployments tab |
| The shop shows no caps at all | Both caps are switched off, or the database is unreachable | /admin → products → check **Active**. If they are on, flag it |
| "Sold out" but you have stock | The stock number in /admin is wrong | /admin → products → correct the Stock number and save |
| An order is stuck on "placed" | Nobody has clicked it along | That is section 4. Not a fault |
| **Reserved** is high and not dropping | Payments are starting and not finishing | Flag it. Not urgent unless it is blocking stock |
| A customer says they paid and you see nothing | Do not take their word and do not refuse them | Get the order number, check /admin, escalate before promising anything |
| The whole site is down | Vercel or the database is having a bad day | Check vercel.com and supabase.com status. Usually fixes itself. Do not change anything |

**The rule underneath all of these:** nothing on this list is fixed by
clicking around hopefully. If it is not on the table, write down exactly what
you saw and ask. Guessing at a live shop that takes money is how small
problems become expensive ones.

---

## 8. What is not switched on yet

Be honest with yourself about these. They are the gap between "it works" and
"it is safe to promote."

- **Order notifications.** Check whether they are on by opening `/api/version`
  on the site and reading `orderNotifications`. `"off"` means nothing will tell
  you an order arrived and section 3 is the only thing between an order and
  being ignored; `"email"` means it is working. **Switch it on before any
  announcement, not after.**

  If you have pasted the keys into Vercel and it still says `"off"`: keys are
  read when the site is published, not when they are saved. Vercel →
  Deployments → the top one → ⋯ → **Redeploy**, then check again.
- **No card payments.** Cash on delivery only. Paymob is built and waiting for
  an account.
- **Delivery is Cairo and Giza.** The site says so. Make sure the database
  agrees — if it still lists other governorates, someone in Aswan can order
  and you are committed.

---

## 9. The numbers that tell you the truth

Look at these weekly. They are early warnings, not a report.

- **Stock remaining** — how long you have before the first run is gone.
- **Orders stuck before "shipped" for more than 48 hours** — your fulfilment
  is slower than your promises.
- **Cancellations** — a few are normal. A pattern means something upstream is
  wrong: the price, the delivery time, or the courier.
- **Orders from outside Cairo and Giza** — should be zero. If it is not, the
  delivery area is open wider than the site says.

---

## 10. What you cannot do from here, and who can

You can change the price, the stock, whether a cap is on sale, the delivery
fee, and every order's status. That is deliberately everything a shop owner
needs.

You cannot change the words on the site, the photographs, or how anything
works. Those are changes to the code. Ask, and they get made, tested and
published.

There is no revenue dashboard, no customer list and no bulk editing. Two
products do not need them, and every extra button is another thing that can be
clicked by mistake on a live shop.
