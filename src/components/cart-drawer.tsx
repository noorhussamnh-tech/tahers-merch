/**
 * The cart.
 *
 * A drawer on a desktop, a full-screen panel on a phone. Prices come from the
 * catalogue passed in, never from storage -- the cart itself holds only slugs
 * and quantities, so what a customer sees is always today's price.
 *
 * No jokes in here. The cart and the checkout are where somebody is deciding
 * whether to spend money, and the brief is explicit that the personality
 * belongs on the product sections, not on the controls.
 */
import { Link } from "@tanstack/react-router";
import { Minus, Plus, X } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { CART_EMPTY, UI } from "@/lib/catalog/copy";
import { ProductImage } from "@/components/product-image";
import { formatEGP } from "@/lib/domain/money";
import { mainImage, productContent } from "@/lib/catalog/products";
import { useCart } from "@/lib/cart/store";
import type { Product } from "@/lib/domain/types";

export function CartDrawer({ products }: { products: readonly Product[] }) {
  const cart = useCart();

  // Escape closes, and the page behind does not scroll while it is open.
  useEffect(() => {
    if (!cart.isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") cart.close();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [cart]);

  if (!cart.isOpen) return null;

  const priced = cart.lines.flatMap((line) => {
    const product = products.find((p) => p.slug === line.slug);
    // A cap that was deactivated while the cart sat in a browser simply drops
    // out of the view; checkout would refuse it anyway.
    if (!product) return [];
    return [{ line, product, total: product.price * line.quantity }];
  });

  const subtotal = priced.reduce((sum, entry) => sum + entry.total, 0);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Cart">
      <button
        type="button"
        className="absolute inset-0 bg-ink/25"
        onClick={cart.close}
        aria-label="Close cart"
      />

      <aside className="absolute inset-y-0 right-0 flex w-full flex-col bg-cream sm:max-w-md sm:border-l sm:border-line">
        <header className="flex items-center justify-between border-b border-line px-6 py-5">
          <h2 className="control text-ink">{UI.cart}</h2>
          <button
            type="button"
            onClick={cart.close}
            className="flex h-10 w-10 items-center justify-center text-ink transition-colors hover:text-accent"
            aria-label="Close cart"
          >
            <X className="h-5 w-5" strokeWidth={1.5} aria-hidden />
          </button>
        </header>

        {priced.length === 0 ? (
          <EmptyCart onContinue={cart.close} />
        ) : (
          <>
            <ul className="flex-1 overflow-y-auto px-6">
              {priced.map(({ line, product, total }) => (
                <li key={line.slug} className="flex gap-4 border-b border-line py-6">
                  <div className="w-20 shrink-0 overflow-hidden bg-paper">
                    <ProductImage
                      image={mainImage(line.slug)}
                      sizes="80px"
                      className="aspect-square"
                    />
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div dir="rtl" className="font-arabic text-base leading-snug text-ink">
                      {productContent(line.slug).name}
                    </div>
                    <div className="font-sans text-sm text-muted">{formatEGP(product.price)}</div>

                    <div className="mt-auto flex items-center justify-between gap-3">
                      <QuantityStepper
                        value={line.quantity}
                        max={Math.max(product.available, line.quantity)}
                        onChange={(next) => cart.setQuantity(line.slug, next)}
                        label={productContent(line.slug).name}
                      />
                      <button
                        type="button"
                        onClick={() => cart.remove(line.slug)}
                        className="font-sans text-[11px] uppercase tracking-[0.14em] text-muted underline underline-offset-4 transition-colors hover:text-accent"
                      >
                        {UI.remove}
                      </button>
                    </div>
                  </div>

                  <div className="shrink-0 font-sans text-sm text-ink">{formatEGP(total)}</div>
                </li>
              ))}
            </ul>

            <footer className="border-t border-line px-6 py-6">
              <div className="flex items-center justify-between font-sans text-sm text-ink">
                <span className="uppercase tracking-[0.14em]">Subtotal</span>
                <span>{formatEGP(subtotal)}</span>
              </div>
              {/* Honest about what is not yet known: the fee depends on the
                  governorate, which is asked for at checkout. */}
              <p className="mt-2 font-sans text-xs text-muted">
                Shipping is calculated at checkout.
              </p>

              <Button asChild size="lg" className="mt-6 w-full">
                <Link to="/checkout" onClick={cart.close}>
                  {UI.checkout}
                </Link>
              </Button>

              <button
                type="button"
                onClick={cart.close}
                className="mt-4 w-full font-sans text-[11px] uppercase tracking-[0.14em] text-muted underline underline-offset-4 transition-colors hover:text-accent"
              >
                {UI.continueShopping}
              </button>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}

function EmptyCart({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-8 text-center">
      <p className="font-display text-3xl text-ink">{CART_EMPTY.heading}</p>
      <Button variant="outline" onClick={onContinue}>
        {CART_EMPTY.action}
      </Button>
    </div>
  );
}

export function QuantityStepper({
  value,
  max,
  onChange,
  label,
}: {
  value: number;
  max: number;
  onChange: (next: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center border border-line [direction:ltr]">
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        className="flex h-9 w-9 items-center justify-center text-ink transition-colors hover:text-accent disabled:opacity-30"
        aria-label={`Decrease quantity of ${label}`}
      >
        <Minus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      </button>
      <span
        className="w-8 text-center font-sans text-sm text-ink"
        aria-live="polite"
        aria-label={`Quantity of ${label}`}
      >
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        className="flex h-9 w-9 items-center justify-center text-ink transition-colors hover:text-accent disabled:opacity-30"
        aria-label={`Increase quantity of ${label}`}
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}
