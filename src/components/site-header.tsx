/**
 * The header.
 *
 * Two bars: a thin inverted announcement strip in Arabic across the top, then
 * the wordmark on the left and the cart on the right.
 *
 * There is no navigation. The site is one page with two caps on it, and
 * scrolling reaches everything a link would have. That also means no mobile
 * menu button -- a hamburger that opens an empty panel is worse than no
 * hamburger. TRACK ORDER and FAQ live in the footer, where somebody chasing an
 * order will look for them.
 *
 * To put navigation back, add entries to NAV in lib/catalog/copy.ts and the
 * list below renders again.
 */
import { Link } from "@tanstack/react-router";
import { ShoppingBag } from "lucide-react";

import { BRAND, NAV } from "@/lib/catalog/copy";
import { useCart } from "@/lib/cart/store";

export function SiteHeader() {
  const cart = useCart();

  return (
    <>
      {/* The inverted strip. Arabic, centred, quiet. It deliberately does not
          repeat the hero headline sitting just below it. */}
      <div
        lang="ar"
        dir="rtl"
        className="border-b border-border bg-foreground px-4 py-2 text-center font-arabic text-[11px] text-background"
      >
        كمية محدودة
      </div>

      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-page items-center justify-between gap-5 px-5 sm:px-8 lg:h-20">
          {/* The wordmark. Heavy italic, always English, even inside RTL. */}
          <Link
            to="/"
            className="wordmark truncate text-xl leading-none sm:text-2xl lg:text-[1.75rem]"
          >
            {BRAND.name}
          </Link>

          {/* Empty today. Kept so that adding a link back is one array entry. */}
          {NAV.length > 0 && (
            <nav aria-label="Main" className="hidden md:block">
              <ul className="flex items-center gap-8 lg:gap-10">
                {NAV.map((item) => (
                  <li key={item.label}>
                    {item.hash ? (
                      <Link
                        to={item.to}
                        hash={item.hash}
                        className="label text-foreground/70 transition-colors hover:text-signal"
                      >
                        {item.label}
                      </Link>
                    ) : (
                      <Link
                        to={item.to}
                        className="label text-foreground/70 transition-colors hover:text-signal"
                        activeProps={{ className: "label text-signal" }}
                      >
                        {item.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          )}

          <button
            type="button"
            onClick={cart.open}
            className="relative flex h-11 shrink-0 items-center gap-2 px-3 transition-colors hover:text-signal"
            aria-label={`Cart, ${cart.count} item${cart.count === 1 ? "" : "s"}`}
          >
            <ShoppingBag className="h-5 w-5" strokeWidth={1.5} aria-hidden />
            <span className="label hidden sm:inline">Cart</span>
            {/* Rendered only once the stored cart has been read, so the
                server-rendered header and the hydrated one agree. */}
            {cart.ready && cart.count > 0 && (
              <span
                className="absolute right-1 top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-signal px-1 font-mono text-[10px] leading-none text-signal-foreground"
                aria-hidden
              >
                {cart.count}
              </span>
            )}
          </button>
        </div>
      </header>
    </>
  );
}
