/**
 * The header.
 *
 * Logo left, navigation centred, cart right -- on a cream bar with a hairline
 * under it, sticky, and solid rather than translucent so the editorial type
 * scrolling underneath never shows through it.
 *
 * On a phone the centre navigation becomes a slide-out panel. No mega-menu:
 * there are four links.
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

  // Stop the page behind scrolling while the panel is open.
  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-cream">
      <div className="mx-auto flex h-[74px] max-w-page items-center justify-between gap-4 px-5 md:h-[100px] md:px-10 lg:px-16">
        {/* Left: the logo, always English. */}
        <Link
          to="/"
          className="font-display text-2xl leading-none tracking-tight text-ink md:text-[1.75rem]"
        >
          {BRAND.name}
        </Link>

        {/* Centre: navigation, English, on a desktop only. */}
        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-9">
            {NAV.map((item) => (
              <li key={item.label}>
                <NavItem item={item} />
              </li>
            ))}
          </ul>
        </nav>

        {/* Right: the cart, and on a phone the menu button. */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={cart.open}
            className="relative flex h-11 items-center gap-2 px-3 text-ink transition-colors hover:text-accent"
            aria-label={`Cart, ${cart.count} item${cart.count === 1 ? "" : "s"}`}
          >
            <ShoppingBag className="h-5 w-5" strokeWidth={1.5} aria-hidden />
            <span className="control hidden sm:inline">Cart</span>
            {/* Rendered only once the stored cart has been read, so the
                server-rendered header and the hydrated one agree. */}
            {cart.ready && cart.count > 0 && (
              <span
                className="absolute right-1 top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 font-sans text-[10px] leading-none text-paper"
                aria-hidden
              >
                {cart.count}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="flex h-11 w-11 items-center justify-center text-ink md:hidden"
            aria-label="Open menu"
            aria-expanded={menuOpen}
          >
            <Menu className="h-5 w-5" strokeWidth={1.5} aria-hidden />
          </button>
        </div>
      </div>

      {menuOpen && <MobileMenu onClose={() => setMenuOpen(false)} />}
    </header>
  );
}

function NavItem({ item }: { item: (typeof NAV)[number] }) {
  const className =
    "control text-ink/70 transition-colors hover:text-accent [&.active]:text-accent";

  // Section links point at an anchor on the homepage; TRACK ORDER is a page.
  if ("hash" in item && item.hash) {
    return (
      <Link to={item.to} hash={item.hash} className={className}>
        {item.label}
      </Link>
    );
  }
  return (
    <Link to={item.to} className={className}>
      {item.label}
    </Link>
  );
}

function MobileMenu({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <button
        type="button"
        className="absolute inset-0 bg-ink/20"
        onClick={onClose}
        aria-label="Close menu"
      />
      <nav
        aria-label="Main"
        className={cn(
          "absolute inset-y-0 right-0 flex w-full max-w-sm flex-col bg-cream",
          "border-l border-line px-6 pb-10 pt-6",
        )}
      >
        <div className="flex items-center justify-between">
          <span className="font-display text-2xl text-ink">{BRAND.name}</span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center text-ink"
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
                  className="block border-b border-line py-5 font-sans text-sm uppercase tracking-[0.14em] text-ink"
                >
                  {item.label}
                </Link>
              ) : (
                <Link
                  to={item.to}
                  onClick={onClose}
                  className="block border-b border-line py-5 font-sans text-sm uppercase tracking-[0.14em] text-ink"
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
