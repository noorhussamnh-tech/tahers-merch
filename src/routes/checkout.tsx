/**
 * Checkout.
 *
 * English throughout, because every field here is something a customer
 * operates. Compact: one column of fields on a phone, two on a desktop, with
 * the order summary beside them rather than hidden behind an accordion.
 *
 * The totals on this page come from `quoteOrder`, which prices the cart
 * server-side. Nothing here computes a total from a price held in the
 * browser -- the summary and the charge come from the same source, so they
 * cannot disagree.
 */
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CART_EMPTY, UI } from "@/lib/catalog/copy";
import { GOVERNORATES } from "@/lib/domain/egypt";
import { Route as RootRoute } from "./__root";
import { checkoutSchema, fieldErrors } from "@/lib/domain/validation";
import { formatEGP } from "@/lib/domain/money";
import type { PaymentMethod } from "@/lib/domain/types";
import { loadInstapayAccount } from "@/lib/api/catalog";
import { placeOrder, quoteOrder } from "@/lib/api/checkout";
import { productContent } from "@/lib/catalog/products";
import { rememberOrder } from "@/lib/cart/confirmation";
import { useCart } from "@/lib/cart/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/checkout")({
  // Loaded here rather than in the component so the payment options are right
  // in the first render. Offering "Instapay" for a moment and then removing it
  // would be worse than never showing it.
  loader: async () => ({ instapay: await loadInstapayAccount() }),
  head: () => ({
    meta: [
      { title: "Checkout | Taher's Merch" },
      // A checkout page has nothing to offer a search engine and should never
      // appear in one.
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CheckoutPage,
});

type Quote = Awaited<ReturnType<typeof quoteOrder>>;

const EMPTY_FORM = {
  fullName: "",
  mobile: "",
  email: "",
  governorate: "",
  city: "",
  street: "",
  building: "",
  floor: "",
  apartment: "",
  notes: "",
};

function CheckoutPage() {
  const cart = useCart();
  const navigate = useNavigate();
  const { products } = RootRoute.useLoaderData();

  const [form, setForm] = useState(EMPTY_FORM);
  const { instapay } = Route.useLoaderData();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cod");
  const [discountCode, setDiscountCode] = useState("");
  const [appliedCode, setAppliedCode] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [quote, setQuote] = useState<Quote | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /**
   * One key per checkout attempt.
   *
   * The server folds repeat submissions carrying the same key into one order,
   * which is what makes a double-click, a flaky connection or a browser retry
   * safe. A new key is minted only when a previous attempt failed in a way
   * that means the order was never created.
   */
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const items = useMemo(
    () => cart.lines.map((line) => ({ slug: line.slug, quantity: line.quantity })),
    [cart.lines],
  );

  // Re-price whenever the cart, the destination or the discount code changes.
  useEffect(() => {
    if (items.length === 0 || !form.governorate) {
      setQuote(null);
      return;
    }

    let cancelled = false;
    quoteOrder({ data: { items, governorate: form.governorate, discountCode: appliedCode } })
      .then((result) => {
        if (!cancelled) setQuote(result);
      })
      .catch(() => {
        if (!cancelled) setQuote(null);
      });

    return () => {
      cancelled = true;
    };
  }, [items, form.governorate, appliedCode]);

  // Cash on delivery is not offered everywhere. If the customer picks a
  // governorate where it is unavailable while it is selected, move them to
  // online payment rather than letting them submit something that will fail.
  useEffect(() => {
    if (quote && !quote.codAvailable && paymentMethod === "cod") {
      // Cash refused here. A transfer is the closer substitute -- it works in
      // every governorate and needs no card -- so prefer it when it is on.
      setPaymentMethod(instapay ? "instapay" : "paymob");
    }
  }, [quote, paymentMethod, instapay]);

  if (cart.ready && cart.lines.length === 0) {
    return <EmptyCheckout />;
  }

  const set = (field: keyof typeof EMPTY_FORM) => (value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    // Clear the error as soon as the customer edits the field it was about.
    setErrors((current) => {
      if (!(field in current)) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const payload = {
      items,
      customer: {
        fullName: form.fullName,
        mobile: form.mobile,
        email: form.email,
      },
      address: {
        governorate: form.governorate,
        city: form.city,
        street: form.street,
        building: form.building,
        floor: form.floor,
        apartment: form.apartment,
        notes: form.notes,
      },
      paymentMethod,
      discountCode: appliedCode || undefined,
      acceptedTerms,
      idempotencyKey,
    };

    // The same schema the server runs, so the customer sees field errors
    // before a round trip. The server checks again regardless.
    const parsed = checkoutSchema.safeParse(payload);
    if (!parsed.success) {
      const issues = fieldErrors(parsed.error);
      setErrors(mapIssuePaths(issues));
      toast.error("Please check the highlighted fields.");
      return;
    }

    setSubmitting(true);
    setErrors({});

    try {
      const order = await placeOrder({ data: payload });

      // Held for the confirmation page, which shows the name and address the
      // order was placed with. Not fetched by order number: that lookup
      // deliberately returns no personal data.
      rememberOrder(order);
      cart.clear();

      if (order.checkoutUrl) {
        // A full navigation, not a router one: this leaves the site.
        window.location.href = order.checkoutUrl;
        return;
      }

      await navigate({ to: "/order/$orderNumber", params: { orderNumber: order.orderNumber } });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong. Please try again.";
      toast.error(message);

      // Stock ran out, or the destination changed under them: the order was
      // never created, so the next attempt needs a fresh key.
      if (/stock|unavailable|cart/i.test(message)) {
        setIdempotencyKey(crypto.randomUUID());
      }
      setSubmitting(false);
    }
  }

  const lines = cart.lines.flatMap((line) => {
    const product = products.find((entry) => entry.slug === line.slug);
    return product ? [{ line, product }] : [];
  });

  return (
    <div className="mx-auto max-w-page px-5 py-12 md:px-10 md:py-16 lg:px-16">
      <h1 className="font-display text-headline text-foreground">Checkout</h1>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="mt-10 grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-16"
      >
        <div className="flex flex-col gap-10">
          <Fieldset legend="Contact">
            <Field label="Full name" name="fullName" error={errors["fullName"]} required>
              <input
                id="fullName"
                name="fullName"
                autoComplete="name"
                value={form.fullName}
                onChange={(e) => set("fullName")(e.target.value)}
                className={inputClass(errors["fullName"])}
              />
            </Field>

            <Field label="Mobile number" name="mobile" error={errors["mobile"]} required>
              <input
                id="mobile"
                name="mobile"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="01012345678"
                value={form.mobile}
                onChange={(e) => set("mobile")(e.target.value)}
                className={inputClass(errors["mobile"])}
              />
            </Field>

            <Field label="Email (optional)" name="email" error={errors["email"]}>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => set("email")(e.target.value)}
                className={inputClass(errors["email"])}
              />
            </Field>
          </Fieldset>

          <Fieldset legend="Delivery address">
            <Field label="Governorate" name="governorate" error={errors["governorate"]} required>
              <select
                id="governorate"
                name="governorate"
                autoComplete="address-level1"
                value={form.governorate}
                onChange={(e) => set("governorate")(e.target.value)}
                className={inputClass(errors["governorate"])}
              >
                <option value="">Select a governorate</option>
                {GOVERNORATES.map((governorate) => (
                  <option key={governorate} value={governorate}>
                    {governorate}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="City or area" name="city" error={errors["city"]} required>
              <input
                id="city"
                name="city"
                autoComplete="address-level2"
                value={form.city}
                onChange={(e) => set("city")(e.target.value)}
                className={inputClass(errors["city"])}
              />
            </Field>

            <Field label="Street address" name="street" error={errors["street"]} required>
              <input
                id="street"
                name="street"
                autoComplete="address-line1"
                value={form.street}
                onChange={(e) => set("street")(e.target.value)}
                className={inputClass(errors["street"])}
              />
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Building" name="building" error={errors["building"]} required>
                <input
                  id="building"
                  name="building"
                  value={form.building}
                  onChange={(e) => set("building")(e.target.value)}
                  className={inputClass(errors["building"])}
                />
              </Field>
              <Field label="Floor" name="floor" error={errors["floor"]} required>
                <input
                  id="floor"
                  name="floor"
                  value={form.floor}
                  onChange={(e) => set("floor")(e.target.value)}
                  className={inputClass(errors["floor"])}
                />
              </Field>
              <Field label="Apartment" name="apartment" error={errors["apartment"]} required>
                <input
                  id="apartment"
                  name="apartment"
                  value={form.apartment}
                  onChange={(e) => set("apartment")(e.target.value)}
                  className={inputClass(errors["apartment"])}
                />
              </Field>
            </div>

            <Field label="Delivery notes (optional)" name="notes" error={errors["notes"]}>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                value={form.notes}
                onChange={(e) => set("notes")(e.target.value)}
                className={cn(inputClass(errors["notes"]), "h-auto py-3")}
              />
            </Field>
          </Fieldset>

          <Fieldset legend="Payment">
            <PaymentOption
              value="cod"
              current={paymentMethod}
              onSelect={setPaymentMethod}
              disabled={quote ? !quote.codAvailable : false}
              title="Cash on delivery"
              note={
                quote && !quote.codAvailable
                  ? "Not available for the selected governorate."
                  : "Pay the courier when the cap arrives."
              }
            />
            {/*
              Shown only when an account has actually been set. The alternative
              -- offering it and explaining the account later -- means a
              customer choosing a way to pay that does not exist yet.
            */}
            {instapay && (
              <PaymentOption
                value="instapay"
                current={paymentMethod}
                onSelect={setPaymentMethod}
                title="Instapay transfer"
                note="Transfer the total, then send us the receipt. We confirm it before the cap ships. The account details appear on the next screen."
              />
            )}
            <PaymentOption
              value="paymob"
              current={paymentMethod}
              onSelect={setPaymentMethod}
              title="Pay online"
              note="Card payment, handled by Paymob. Your card details never reach this site."
            />
          </Fieldset>
        </div>

        {/* ------------------------------------------------- order summary */}
        <aside className="lg:sticky lg:top-32 lg:h-fit">
          <div className="border border-border bg-card p-6">
            <h2 className="control text-foreground">Order summary</h2>

            <ul className="mt-6 flex flex-col gap-4 border-b border-border pb-6">
              {lines.map(({ line, product }) => (
                <li key={line.slug} className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <span
                      dir="rtl"
                      className="block font-arabic text-sm leading-snug text-foreground"
                    >
                      {productContent(line.slug).name}
                    </span>
                    <span className="font-sans text-xs text-muted">× {line.quantity}</span>
                  </div>
                  <span className="shrink-0 font-sans text-sm text-foreground">
                    {formatEGP(product.price * line.quantity)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex gap-2 border-b border-border py-5">
              <input
                aria-label="Discount code"
                placeholder="Discount code"
                value={discountCode}
                onChange={(e) => setDiscountCode(e.target.value)}
                className={cn(inputClass(undefined), "h-11 flex-1")}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-11"
                onClick={() => {
                  setAppliedCode(discountCode.trim());
                  if (!discountCode.trim()) toast.error("Enter a code first.");
                }}
              >
                {UI.apply}
              </Button>
            </div>

            <dl className="flex flex-col gap-3 border-b border-border py-5 font-sans text-sm">
              <Row label="Subtotal" value={quote ? formatEGP(quote.subtotal) : "—"} />

              {quote && quote.discount > 0 && (
                <Row label="Discount" value={`− ${formatEGP(quote.discount)}`} accent />
              )}

              <Row
                label="Shipping"
                value={
                  !form.governorate
                    ? "Select a governorate"
                    : quote?.shippingFee === null || quote?.shippingFee === undefined
                      ? "Unavailable"
                      : formatEGP(quote.shippingFee)
                }
              />
            </dl>

            <div className="flex items-baseline justify-between py-5 font-sans">
              <span className="text-xs uppercase tracking-[0.14em] text-foreground">Total</span>
              <span className="text-lg text-foreground">
                {quote?.total != null ? formatEGP(quote.total) : "—"}
              </span>
            </div>

            {appliedCode && quote && !quote.discountApplied && (
              <p className="pb-4 font-sans text-xs text-error">That discount code did not apply.</p>
            )}

            {/* Only shown once the courier's service level is configured;
                otherwise the shop says nothing rather than guessing. */}
            {quote?.minDays != null && quote.maxDays != null && (
              <p dir="rtl" className="pb-4 font-arabic text-xs leading-relaxed text-muted">
                {quote.minDays === quote.maxDays
                  ? `التوصيل خلال ${quote.minDays} أيام.`
                  : `التوصيل خلال ${quote.minDays} إلى ${quote.maxDays} أيام.`}
              </p>
            )}

            <label className="flex cursor-pointer items-start gap-3 border-t border-border pt-5">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#7D252A]"
              />
              <span className="font-sans text-xs leading-relaxed text-muted">
                I accept the store terms, including the exchange and return policy.
              </span>
            </label>
            {errors["acceptedTerms"] && (
              <p className="mt-2 font-sans text-xs text-error">{errors["acceptedTerms"]}</p>
            )}

            <Button
              type="submit"
              size="lg"
              className="mt-6 w-full"
              disabled={submitting || quote?.total == null}
            >
              {submitting ? "Placing order…" : UI.placeOrder}
            </Button>

            <p className="mt-4 text-center font-sans text-[11px] leading-relaxed text-muted">
              Prices and totals are calculated on the server.
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className={accent ? "text-signal" : "text-foreground"}>{value}</dd>
    </div>
  );
}

function Fieldset({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-5">
      <legend className="control mb-1 text-foreground">{legend}</legend>
      {children}
    </fieldset>
  );
}

function Field({
  label,
  name,
  error,
  required,
  children,
}: {
  label: string;
  name: string;
  error?: string | undefined;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="font-sans text-xs text-muted">
        {label}
        {required && <span className="text-signal"> *</span>}
      </label>
      {children}
      {error && (
        <p role="alert" className="font-sans text-xs text-error">
          {error}
        </p>
      )}
    </div>
  );
}

function inputClass(error: string | undefined): string {
  return cn(
    "h-12 w-full border bg-background px-3 font-sans text-sm text-foreground",
    "outline-none transition-colors placeholder:text-muted/60",
    "focus:border-signal",
    error ? "border-error" : "border-border",
  );
}

function PaymentOption({
  value,
  current,
  onSelect,
  title,
  note,
  disabled,
}: {
  value: PaymentMethod;
  current: string;
  onSelect: (value: PaymentMethod) => void;
  title: string;
  note: string;
  disabled?: boolean;
}) {
  const selected = current === value;
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 border p-4 transition-colors",
        selected ? "border-signal bg-card" : "border-border",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <input
        type="radio"
        name="paymentMethod"
        value={value}
        checked={selected}
        disabled={disabled}
        onChange={() => onSelect(value)}
        className="mt-1 h-4 w-4 shrink-0 accent-[#7D252A]"
      />
      <span className="flex flex-col gap-1">
        <span className="font-sans text-sm text-foreground">{title}</span>
        <span className="font-sans text-xs leading-relaxed text-muted">{note}</span>
      </span>
    </label>
  );
}

function EmptyCheckout() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-page flex-col items-center justify-center gap-8 px-5 text-center">
      <p className="font-display text-headline text-foreground">{CART_EMPTY.heading}</p>
      <Link to="/" hash="shop" className="control text-signal underline underline-offset-4">
        {CART_EMPTY.action}
      </Link>
    </div>
  );
}

/**
 * Turns Zod's nested paths ("customer.fullName") into the flat field names the
 * inputs use ("fullName"), so an error lands under the input it is about.
 */
function mapIssuePaths(issues: Record<string, string>): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const [path, message] of Object.entries(issues)) {
    const leaf = path.split(".").at(-1) ?? path;
    mapped[leaf] = message;
  }
  return mapped;
}
