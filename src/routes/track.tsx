/**
 * Order tracking.
 *
 * Asks for the order number and the mobile number it was placed with, and one
 * without the other is no use. A wrong pair gets one message -- never "that
 * order exists but the number is wrong", which would confirm an order number
 * to somebody guessing at them.
 *
 * What comes back is narrow by design: status, what was ordered, the total,
 * a timeline and the governorate. No street address, no email, no notes.
 */
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { FULFILMENT_FLOW, type FulfilmentStatus, type TrackedOrder } from "@/lib/domain/types";
import { SiteFooter } from "@/components/home-sections";
import { UI } from "@/lib/catalog/copy";
import { formatEGP } from "@/lib/domain/money";
import { trackOrder } from "@/lib/api/tracking";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/track")({
  head: () => ({
    meta: [
      { title: "Track your order | Taher's Merch" },
      { name: "description", content: "تتبّع طلبك برقم الطلب ورقم الموبايل." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: TrackPage,
});

/** English labels: this is a status display, and the controls are English. */
const STATUS_LABEL: Record<FulfilmentStatus, string> = {
  placed: "Order placed",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

function TrackPage() {
  const [orderNumber, setOrderNumber] = useState("");
  const [mobile, setMobile] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "found" | "notFound" | "error">("idle");
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setState("loading");
    setMessage("");

    try {
      const result = await trackOrder({ data: { orderNumber, mobile } });
      if (result) {
        setOrder(result);
        setState("found");
      } else {
        setOrder(null);
        setState("notFound");
      }
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error ? error.message : "Something went wrong. Please try again.",
      );
    }
  }

  return (
    <>
      <div className="mx-auto max-w-3xl px-5 py-16 md:px-10 md:py-24">
        <h1 className="font-display text-headline text-foreground">Track your order</h1>
        <p dir="rtl" className="mt-4 font-arabic text-base leading-loose text-muted">
          أدخل رقم الطلب ورقم الموبايل الذي طلبت به.
        </p>

        <form onSubmit={handleSubmit} noValidate className="mt-10 flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="orderNumber" className="font-sans text-xs text-muted">
              Order number
            </label>
            <input
              id="orderNumber"
              name="orderNumber"
              required
              placeholder="TC-XXXXXXXX"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              className="h-12 w-full border border-border bg-background px-3 font-sans text-sm uppercase tracking-wide text-foreground outline-none transition-colors placeholder:normal-case placeholder:text-muted/60 focus:border-signal"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="mobile" className="font-sans text-xs text-muted">
              Mobile number
            </label>
            <input
              id="mobile"
              name="mobile"
              type="tel"
              inputMode="tel"
              required
              placeholder="01012345678"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              className="h-12 w-full border border-border bg-background px-3 font-sans text-sm text-foreground outline-none transition-colors placeholder:text-muted/60 focus:border-signal"
            />
          </div>

          <Button type="submit" size="lg" disabled={state === "loading"} className="self-start">
            {state === "loading" ? "Looking…" : UI.trackOrder}
          </Button>
        </form>

        {/* One message for both "no such order" and "wrong mobile number". */}
        {state === "notFound" && (
          <div className="mt-8 border border-border bg-card p-5">
            <p className="font-sans text-sm text-foreground">
              We could not find an order matching those details.
            </p>
            <p className="mt-2 font-sans text-xs leading-relaxed text-muted">
              Check the order number and the mobile number you ordered with.
            </p>
          </div>
        )}

        {state === "error" && (
          <p role="alert" className="mt-8 font-sans text-sm text-error">
            {message}
          </p>
        )}

        {state === "found" && order && <OrderDetail order={order} />}
      </div>

      <SiteFooter />
    </>
  );
}

function OrderDetail({ order }: { order: TrackedOrder }) {
  const cancelled = order.fulfilmentStatus === "cancelled";
  const reachedIndex = FULFILMENT_FLOW.indexOf(order.fulfilmentStatus);

  return (
    <div className="mt-12 border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-5">
        <div>
          <p className="eyebrow">Order number</p>
          <p className="mt-1 font-sans text-lg tracking-wide text-foreground">
            {order.orderNumber}
          </p>
        </div>
        <span
          className={cn(
            "border px-3 py-1.5 font-sans text-[11px] uppercase tracking-[0.14em]",
            order.paymentStatus === "paid"
              ? "border-success text-success"
              : "border-border text-muted",
          )}
        >
          Payment {order.paymentStatus}
        </span>
      </div>

      <ul className="flex flex-col gap-3 border-b border-border px-6 py-6">
        {order.lines.map((line, index) => (
          <li key={`${line.name}-${index}`} className="flex items-center justify-between gap-4">
            <span dir="rtl" className="font-arabic text-base text-foreground">
              {line.name}
            </span>
            <span className="font-sans text-xs text-muted">× {line.quantity}</span>
          </li>
        ))}
      </ul>

      <div className="flex items-baseline justify-between border-b border-border px-6 py-5">
        <span className="control text-foreground">Total</span>
        <span className="font-sans text-lg text-foreground">{formatEGP(order.total)}</span>
      </div>

      {/* The timeline. A cancelled order shows the plain history rather than
          a progress track it never finished. */}
      <div className="px-6 py-6">
        <p className="eyebrow mb-5">Status</p>

        {cancelled ? (
          <p className="font-sans text-sm text-error">{STATUS_LABEL.cancelled}</p>
        ) : (
          <ol className="flex flex-col gap-0">
            {FULFILMENT_FLOW.map((step, index) => {
              const reached = index <= reachedIndex;
              const event = order.timeline.find((entry) => entry.status === step);
              return (
                <li key={step} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border",
                        reached ? "border-signal bg-signal" : "border-border bg-background",
                      )}
                      aria-hidden
                    />
                    {index < FULFILMENT_FLOW.length - 1 && (
                      <span
                        className={cn("w-px flex-1", reached ? "bg-signal/40" : "bg-line")}
                        aria-hidden
                      />
                    )}
                  </div>
                  <div className="pb-6">
                    <p
                      className={cn(
                        "font-sans text-sm",
                        reached ? "text-foreground" : "text-muted/60",
                      )}
                    >
                      {STATUS_LABEL[step]}
                    </p>
                    {event && (
                      <p className="mt-0.5 font-sans text-xs text-muted">
                        {new Date(event.at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {/* Only when the courier's service level is configured. */}
        {order.expectedMinDays != null && order.expectedMaxDays != null && !cancelled && (
          <p dir="rtl" className="mt-2 font-arabic text-sm leading-loose text-muted">
            {order.expectedMinDays === order.expectedMaxDays
              ? `التوصيل المتوقع خلال ${order.expectedMinDays} أيام إلى ${order.governorate}.`
              : `التوصيل المتوقع خلال ${order.expectedMinDays} إلى ${order.expectedMaxDays} أيام إلى ${order.governorate}.`}
          </p>
        )}
      </div>

      <div className="border-t border-border px-6 py-5">
        <Link
          to="/"
          hash="shop"
          className="control text-muted underline underline-offset-4 transition-colors hover:text-signal"
        >
          {UI.continueShopping}
        </Link>
      </div>
    </div>
  );
}
