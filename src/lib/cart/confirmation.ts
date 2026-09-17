/**
 * Carrying a placed order to the confirmation page.
 *
 * The confirmation shows the customer their name and delivery address back.
 * That information is not fetched by order number -- `tc_order_status`
 * deliberately returns none of it, so that an order number on its own (in a
 * browser history, a shared link, a referrer header) reveals nothing about
 * who placed the order.
 *
 * So the browser keeps it, for the few minutes between placing the order and
 * reading the confirmation. sessionStorage rather than localStorage: it dies
 * with the tab, which is exactly the lifetime wanted. If it is gone -- a new
 * tab, a shared link, a returning customer -- the page falls back to the
 * payment status alone and offers the tracking page, which asks for the
 * mobile number.
 */
import type { PlacedOrder } from "@/lib/domain/types";

const KEY_PREFIX = "taher-caps.order.";

export function rememberOrder(order: PlacedOrder): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(`${KEY_PREFIX}${order.orderNumber}`, JSON.stringify(order));
  } catch {
    // Blocked or full storage. The confirmation falls back to the status-only
    // view, which is a smaller page, not a broken one.
  }
}

export function recallOrder(orderNumber: string): PlacedOrder | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(`${KEY_PREFIX}${orderNumber}`);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;

    // Only trusted as far as it agrees with the URL: this is the customer's
    // own browser, but a mismatched record is a bug, not something to render.
    const order = parsed as PlacedOrder;
    return order.orderNumber === orderNumber ? order : null;
  } catch {
    return null;
  }
}

export function forgetOrder(orderNumber: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(`${KEY_PREFIX}${orderNumber}`);
  } catch {
    // Nothing to do; it expires with the tab regardless.
  }
}
