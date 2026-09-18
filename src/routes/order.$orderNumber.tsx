/**
 * Order confirmation.
 *
 * Reached twice: straight from checkout, and again when Paymob sends the
 * browser back. The second time is why nothing on this page may be taken as
 * proof of payment -- a customer can navigate here themselves, and so can
 * anyone else. The payment status shown is read from the database, where only
 * a verified webhook can have written "paid".
 *
 * The name and address come from the browser's own record of the checkout it
 * just completed. When that is gone, the page shows the payment state and
 * sends the customer to tracking, which asks for their mobile number.
 */
import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatEGP } from "@/lib/domain/money";
import { getOrderStatus, type OrderStatus } from "@/lib/api/order";
import { recallOrder } from "@/lib/cart/confirmation";
import { SiteFooter } from "@/components/home-sections";
import { UI } from "@/lib/catalog/copy";
import { cn } from "@/lib/utils";
import type { PaymentStatus, PlacedOrder } from "@/lib/domain/types";

export const Route = createFileRoute("/order/$orderNumber")({
  head: () => ({
    meta: [
      { title: "Your order | Taher's Merch" },
      // Never indexed: the URL contains an order number.
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  loader: ({ params }) => getOrderStatus({ data: { orderNumber: params.orderNumber } }),
  component: OrderPage,
});

function OrderPage() {
  const status = Route.useLoaderData();
  const { orderNumber } = Route.useParams();

  // Read after mount: sessionStorage does not exist during server rendering.
  const [remembered, setRemembered] = useState<PlacedOrder | null>(null);
  useEffect(() => setRemembered(recallOrder(orderNumber)), [orderNumber]);

  if (!status) return <UnknownOrder />;

  return (
    <>
      <div className="mx-auto max-w-3xl px-5 py-16 md:px-10 md:py-24">
        <p className="eyebrow">Order confirmed</p>

        <h1 className="mt-5 font-display text-headline text-foreground">
          Your order has been confirmed.
        </h1>

        <div className="mt-10 border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-5">
            <div>
              <p className="eyebrow">Order number</p>
              <p className="mt-1 font-sans text-lg tracking-wide text-foreground">
                {status.orderNumber}
              </p>
            </div>
            <PaymentBadge method={status.paymentMethod} status={status.paymentStatus} />
          </div>

          <ul className="flex flex-col gap-4 border-b border-border px-6 py-6">
            {status.lines.map((line) => (
              <li key={line.slug} className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <span
                    dir="rtl"
                    className="block font-arabic text-base leading-snug text-foreground"
                  >
                    {line.name}
                  </span>
                  <span className="font-sans text-xs text-muted">× {line.quantity}</span>
                </div>
                <span className="shrink-0 font-sans text-sm text-foreground">
                  {formatEGP(line.lineTotal)}
                </span>
              </li>
            ))}
          </ul>

          <dl className="flex flex-col gap-3 border-b border-border px-6 py-5 font-sans text-sm">
            <SummaryRow label="Subtotal" value={formatEGP(status.subtotal)} />
            {status.discount > 0 && (
              <SummaryRow label="Discount" value={`− ${formatEGP(status.discount)}`} />
            )}
            <SummaryRow label="Shipping" value={formatEGP(status.shippingFee)} />
          </dl>

          <div className="flex items-baseline justify-between px-6 py-5">
            <span className="control text-foreground">Total</span>
            <span className="font-sans text-xl text-foreground">{formatEGP(status.total)}</span>
          </div>

          {remembered && (
            <div className="border-t border-border px-6 py-5">
              <p className="eyebrow">Delivering to</p>
              <p className="mt-2 font-sans text-sm leading-relaxed text-foreground">
                {remembered.customerName}
                <br />
                {remembered.address.street}, Building {remembered.address.building}, Floor{" "}
                {remembered.address.floor}, Apt {remembered.address.apartment}
                <br />
                {remembered.address.city}, {remembered.address.governorate}
              </p>
            </div>
          )}
        </div>

        <PaymentGuidance method={status.paymentMethod} status={status.paymentStatus} />

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Button asChild size="lg">
            <Link to="/track">{UI.trackOrder}</Link>
          </Button>
          <Link
            to="/"
            hash="shop"
            className="control text-muted underline underline-offset-4 transition-colors hover:text-signal"
          >
            {UI.continueShopping}
          </Link>
        </div>

        <p className="mt-8 font-sans text-xs leading-relaxed text-muted">
          Keep your order number. Tracking an order needs both the order number and the mobile
          number it was placed with.
        </p>
      </div>

      <SiteFooter />
    </>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}

/**
 * The payment state, said plainly.
 *
 * An online order distinguishes confirmed, pending and failed, because those
 * mean three very different things to somebody who has just typed their card
 * number in. A cash order is always pending until the courier collects, and
 * saying "pending" without explaining it would read as a problem.
 */
function PaymentBadge({
  method,
  status,
}: {
  method: OrderStatus["paymentMethod"];
  status: PaymentStatus;
}) {
  const label = paymentLabel(method, status);
  return (
    <span
      className={cn(
        "border px-3 py-1.5 font-sans text-[11px] uppercase tracking-[0.14em]",
        status === "paid" && "border-success text-success",
        status === "pending" && "border-border text-muted",
        (status === "failed" || status === "cancelled") && "border-error text-error",
        status === "refunded" && "border-border text-muted",
      )}
    >
      {label}
    </span>
  );
}

function paymentLabel(method: OrderStatus["paymentMethod"], status: PaymentStatus): string {
  if (method === "cod") {
    return status === "pending" ? "Cash on delivery" : `Payment ${status}`;
  }
  switch (status) {
    case "paid":
      return "Payment confirmed";
    case "pending":
      return "Payment pending";
    case "failed":
      return "Payment failed";
    case "cancelled":
      return "Payment cancelled";
    case "refunded":
      return "Refunded";
  }
}

function PaymentGuidance({
  method,
  status,
}: {
  method: OrderStatus["paymentMethod"];
  status: PaymentStatus;
}) {
  if (method === "cod") {
    return (
      <p dir="rtl" className="mt-8 font-arabic text-base leading-loose text-muted">
        سيتم تحصيل المبلغ عند الاستلام.
      </p>
    );
  }

  if (status === "paid") {
    return (
      <p dir="rtl" className="mt-8 font-arabic text-base leading-loose text-success">
        تم تأكيد الدفع.
      </p>
    );
  }

  if (status === "pending") {
    return (
      <div className="mt-8 border border-border bg-card p-5">
        <p dir="rtl" className="font-arabic text-base leading-loose text-foreground">
          لم يصلنا تأكيد الدفع بعد.
        </p>
        <p className="mt-2 font-sans text-xs leading-relaxed text-muted">
          A payment can take a minute to confirm. Refresh this page shortly. If it stays pending,
          nothing has been charged and you can order again.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 border border-error/40 bg-card p-5">
      <p dir="rtl" className="font-arabic text-base leading-loose text-error">
        لم يتم الدفع.
      </p>
      <p className="mt-2 font-sans text-xs leading-relaxed text-muted">
        Nothing has been charged and the caps have been released back into stock. You can place the
        order again.
      </p>
      <Button asChild variant="outline" size="sm" className="mt-4">
        <Link to="/" hash="shop">
          {UI.tryAgain}
        </Link>
      </Button>
    </div>
  );
}

function UnknownOrder() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-page flex-col items-center justify-center gap-8 px-5 text-center">
      <p className="font-display text-headline text-foreground">We could not find that order.</p>
      <p className="font-sans text-sm text-muted">
        Check the order number, or look it up with your mobile number.
      </p>
      <Button asChild>
        <Link to="/track">{UI.trackOrder}</Link>
      </Button>
    </div>
  );
}
