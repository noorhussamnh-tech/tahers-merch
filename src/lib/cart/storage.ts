/**
 * Reading and writing the stored cart.
 *
 * Kept apart from the React provider so the rules below are a pure function
 * that can be tested directly -- they are what stands between the shop and a
 * cart that has been sitting in a browser for a month, or edited by hand in
 * devtools.
 *
 * The stored shape is slugs and quantities. No prices, no totals: a price
 * that persists is a price that goes stale, and every figure shown is derived
 * from a freshly fetched catalogue instead.
 */
import { MAX_QUANTITY_PER_LINE } from "@/lib/domain/validation";
import { isProductSlug } from "@/lib/catalog/products";
import type { CartLine } from "@/lib/domain/types";

export const CART_STORAGE_KEY = "taher-caps.cart.v1";

/**
 * Filters arbitrary parsed JSON down to a cart this shop can act on.
 *
 * Anything unrecognised is dropped rather than repaired or thrown over: a
 * corrupt cart should cost the customer their cart, never the page.
 */
export function sanitizeStoredCart(parsed: unknown): CartLine[] {
  if (!Array.isArray(parsed)) return [];

  const lines: CartLine[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue;

    const { slug, quantity } = entry as { slug?: unknown; quantity?: unknown };
    if (typeof slug !== "string" || !isProductSlug(slug)) continue;
    if (typeof quantity !== "number" || !Number.isInteger(quantity)) continue;

    // One line per product: a duplicated slug keeps the first and drops the
    // rest, rather than summing, which could exceed the per-line maximum.
    if (lines.some((line) => line.slug === slug)) continue;

    lines.push({ slug, quantity: Math.min(Math.max(quantity, 1), MAX_QUANTITY_PER_LINE) });
  }
  return lines;
}

export function readStoredCart(): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    return raw ? sanitizeStoredCart(JSON.parse(raw)) : [];
  } catch {
    // A private window, blocked storage, or invalid JSON. An empty cart is
    // the right answer to all three, and none should break the shop.
    return [];
  }
}

export function writeStoredCart(lines: readonly CartLine[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // Storage full or blocked. The cart still works for this visit.
  }
}
