/**
 * Privacy and terms.
 *
 * Written from what the code actually does, not from a template: the data
 * listed here is exactly the columns on tc_orders, and the companies listed
 * are exactly the four the site talks to. There is no analytics, no pixel and
 * no advertising tag anywhere in this project, so the page says so plainly --
 * that is a genuine thing to be able to claim, and it stays true only as long
 * as nobody adds one.
 *
 * If a field is ever added to checkout, or a service added to the stack, it
 * belongs here in the same commit. A privacy page that has drifted from the
 * code is worse than none, because it is a written claim that is false.
 *
 * English, matching the FAQ. The customers read Arabic and a translation
 * would serve them better -- noted in docs/MISSING-INFORMATION.md.
 */
import { createFileRoute } from "@tanstack/react-router";

import { BRAND } from "@/lib/catalog/copy";
import { SiteFooter } from "@/components/home-sections";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: `Privacy and terms | ${BRAND.name}` },
      {
        name: "description",
        content: "What we collect, why, who can see it, and the terms of sale.",
      },
    ],
  }),
  component: PrivacyPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12 first:mt-0">
      <h2 className="label text-foreground">{title}</h2>
      <div className="mt-4 flex flex-col gap-4 font-sans text-sm leading-relaxed text-muted">
        {children}
      </div>
    </section>
  );
}

function PrivacyPage() {
  return (
    <>
      <main id="main" className="mx-auto max-w-3xl px-5 py-16 sm:px-8 lg:py-24">
        <h1 className="font-display text-4xl text-foreground sm:text-5xl">Privacy and terms</h1>
        <p className="mt-4 font-sans text-sm text-muted">
          Plain language, and accurate to how the shop actually works.
        </p>

        <Section title="WHAT WE COLLECT">
          <p>
            When you place an order we ask for your name, your mobile number and your delivery
            address — street, building, floor, apartment, city and governorate. You can add a
            delivery note, and you can give an email address if you want one. The email is optional
            and the order works without it.
          </p>
          <p>
            That is everything. We do not ask for your date of birth, your national ID or your
            gender, because none of it is needed to deliver a cap.
          </p>
        </Section>

        <Section title="WHAT WE DO NOT DO">
          <p>
            There is no analytics on this site. No advertising pixel, no tracker, no third-party
            script watching what you look at. Nobody is building a profile of you here.
          </p>
          <p>
            We do not sell, rent or share your details with anyone for marketing, and we do not send
            marketing messages. If we contact you it is about an order you placed.
          </p>
          <p>
            We never see or store your card details. If you pay online, your card is entered on the
            payment provider&rsquo;s own page and it never passes through this site.
          </p>
        </Section>

        <Section title="WHY WE NEED IT">
          <p>
            Your name, phone and address go to the courier so your order can reach you. Your phone
            number is also how order tracking works — the tracking page asks for your order number
            and the mobile number you ordered with, and both must match before it shows anything.
          </p>
          <p>
            We keep a record of orders because we have to be able to answer questions about them
            later.
          </p>
        </Section>

        <Section title="WHO ELSE IS INVOLVED">
          <p>
            Four companies are part of running this shop, and each one only touches what it needs:
          </p>
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>
              <strong className="text-foreground">Supabase</strong> stores the orders.
            </li>
            <li>
              <strong className="text-foreground">Vercel</strong> hosts the website.
            </li>
            <li>
              <strong className="text-foreground">Paymob</strong> handles online card payments, when
              that option is available. Your card details go to them, not to us.
            </li>
            <li>
              <strong className="text-foreground">Resend</strong> sends the email that tells us a
              new order has arrived.
            </li>
          </ul>
          <p>
            The site also loads its typefaces from Google Fonts, which means Google sees that a
            browser requested a font.
          </p>
          <p>
            Beyond these, your address goes to whichever courier delivers your order. That is
            unavoidable — somebody has to know where to bring it.
          </p>
        </Section>

        <Section title="HOW LONG WE KEEP IT">
          <p>
            Order records are kept while the shop is running, because an order you placed is
            something you may ask us about. If you want your details removed, ask and we will remove
            them once the order is complete and there is nothing outstanding on it.
          </p>
        </Section>

        <Section title="YOUR RIGHTS">
          <p>
            You can ask what we hold about you, ask us to correct it, or ask us to delete it. Ask
            through the contact on this page and we will answer.
          </p>
        </Section>

        <Section title="TERMS OF SALE">
          <p>
            <strong className="text-foreground">Delivery.</strong> We currently ship to Cairo and
            Giza only. The expected delivery time is shown at checkout before you place your order.
          </p>
          <p>
            <strong className="text-foreground">Payment.</strong> Cash on delivery, and online card
            payment when it is offered. The price shown at checkout is the price you pay — the total
            is calculated by us, not by your browser.
          </p>
          <p>
            <strong className="text-foreground">Exchanges and returns.</strong> Only possible while
            the courier is still at your door, and not after. Delivery fees apply in all cases.
          </p>
          <p>
            <strong className="text-foreground">Stock.</strong> Each design is made in a limited
            quantity. If it sells out, it is gone. Placing an order does not reserve a cap until the
            order is actually accepted, and if the last one goes while you are checking out, we will
            tell you rather than take your money.
          </p>
          <p>
            <strong className="text-foreground">Cancellation by us.</strong> If we cannot fulfil an
            order, we will say so and you will not be charged.
          </p>
        </Section>

        <Section title="CONTACT">
          {/*
            The one thing on this page that is not yet true. It must be filled in
            before the shop is promoted -- a privacy page that tells somebody to
            get in touch and then gives them no way to is worse than silence.
            See docs/MISSING-INFORMATION.md.
          */}
          <p>
            Contact details are being finalised and will appear here. Until then, questions about an
            order can go through the account the shop was announced from.
          </p>
        </Section>

        <p className="mt-16 font-mono text-xs text-muted">
          This page describes how the shop works today. If that changes, this page changes with it.
        </p>
      </main>

      <SiteFooter />
    </>
  );
}
