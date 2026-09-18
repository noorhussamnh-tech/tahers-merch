/**
 * The header.
 *
 * Two bars, following the supplied design: a thin dark announcement strip in
 * Arabic across the top, then the header proper -- the italic wordmark left,
 * mono navigation, cart right with a signal-red count.
 *
 * The strip is the one place the page inverts, and it is what gives the top of
 * the site its edge. It says one true thing and deliberately does NOT repeat
 * the hero headline sitting just below it.
 *
 * On a phone the navigation becomes a slide-out panel. No mega-menu: there are
 * four links.
 */
import { Link } from "@tanstack/react-router";
import { Menu, ShoppingBag, X } from "lucide-react";
import { useEffect, useState } from "react";

import { BRAND, NAV } from "@/lib/catalog/copy";
import { useCart } from "@/lib/cart/store";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const cart = useCart();
  const [menuOpen, setMenuOpen] = useState(false);

  // A phone that navigates with the panel open should not land on the next
  // page with it still covering the screen.
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("hashchange", close);
    return () => window.removeEventListener("hashchange", close);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

  return (
    <>
      {/* The inverted strip. Arabic, centred, quiet. */}
      <div
        lang="ar"
        dir="rtl"
        className="border-b border-border bg-foreground px-4 py-2 text-center font-arabic text-[11px] text-background"
      >
        كمية محدودة
      </div>

      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-page items-center justify-between gap-5 px-5 sm:px-8 lg:h-20 lg:gap-12">
          {/* The wordmark. Heavy italic, always English, even in RTL. */}
          <Link
            to="/"
            className="wordmark truncate text-xl leading-none sm:text-2xl lg:text-[1.75rem]"
          >
            {BRAND.name}
          </Link>

          <nav aria-label="Main" className="hidden md:block">
            <ul className="flex items-center gap-8 lg:gap-10">
              {NAV.map((item) => (
                <li key={item.label}>
                  <NavItem item={item} />
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex shrink-0 items-center justify-end gap-1">
            <button
              type="button"
              onClick={cart.open}
              className="relative flex h-11 items-center gap-2 px-3 transition-colors hover:text-signal"
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

            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="flex h-11 w-11 items-center justify-center md:hidden"
              aria-label="Open menu"
              aria-expanded={menuOpen}
            >
              <Menu className="h-5 w-5" strokeWidth={1.5} aria-hidden />
            </button>
          </div>
        </div>

        {menuOpen && <MobileMenu onClose={() => setMenuOpen(false)} />}
      </header>
    </>
  );
}

function NavItem({ item }: { item: (typeof NAV)[number] }) {
  const className = "label text-foreground/70 transition-colors hover:text-signal";

  // Section links point at an anchor on the homepage; TRACK ORDER is a page.
  if ("hash" in item && item.hash) {
    return (
      <Link to={item.to} hash={item.hash} className={className}>
        {item.label}
      </Link>
    );
  }
  return (
    <Link to={item.to} className={className} activeProps={{ className: "label text-signal" }}>
      {item.label}
    </Link>
  );
}

function MobileMenu({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <button
        type="button"
        className="absolute inset-0 bg-foreground/25"
        onClick={onClose}
        aria-label="Close menu"
      />
      <nav
        aria-label="Main"
        className={cn(
          "absolute inset-y-0 right-0 flex w-full max-w-sm flex-col bg-background",
          "border-l border-border px-6 pb-10 pt-6",
        )}
      >
        <div className="flex items-center justify-between">
          <span className="wordmark text-xl">{BRAND.name}</span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" strokeWidth={1.5} aria-hidden />
          </button>
        </div>

        <ul className="mt-12 flex flex-col gap-1">
          {NAV.map((item) => (
            <li key={item.label}>
              {"hash" in item && item.hash ? (
                <Link
                  to={item.to}
                  hash={item.hash}
                  onClick={onClose}
                  className="block border-b border-border py-5 font-mono text-xs uppercase tracking-[0.2em]"
                >
                  {item.label}
                </Link>
              ) : (
                <Link
                  to={item.to}
                  onClick={onClose}
                  className="block border-b border-border py-5 font-mono text-xs uppercase tracking-[0.2em]"
                >
                  {item.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
