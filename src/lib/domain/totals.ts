/**
 * Order totals.
 *
 * This is the single place an order's arithmetic happens. The database calls
 * the same rules in SQL when it creates the order (see the `tc_place_order`
 * migration), and this module is what the checkout summary shows while the
 * customer is still filling the form -- so the figure they read and the figure
 * they are charged come from one definition.
 *
 * A total is never accepted from the browser. These functions take a unit
 * price fetched server-side and a quantity, and derive everything else.
 */
import { assertPiastres, lineTotal, sum, type Piastres } from "./money";
import type { PricedLine, ShippingZone } from "./types";

export interface OrderTotals {
  readonly subtotal: Piastres;
  readonly shippingFee: Piastres;
  readonly discount: Piastres;
  readonly total: Piastres;
}

export function priceLine(
  slug: PricedLine["slug"],
  name: string,
  unitPrice: Piastres,
  quantity: number,
): PricedLine {
  return {
    slug,
    name,
    quantity,
    unitPrice: assertPiastres(unitPrice, "Unit price"),
    lineTotal: lineTotal(unitPrice, quantity),
  };
}

export function subtotalOf(lines: readonly PricedLine[]): Piastres {
  return sum(lines.map((line) => line.lineTotal));
}

/**
 * Computes the full breakdown.
 *
 * `discount` is clamped to the subtotal: a discount larger than the goods can
 * never make the shipping free as a side effect, and can never make the total
 * negative. Shipping is added after the discount, deliberately -- the courier
 * is paid regardless of what the customer paid for the cap.
 */
export function computeTotals(
  lines: readonly PricedLine[],
  shippingFee: Piastres,
  discount: Piastres = 0,
): OrderTotals {
  const subtotal = subtotalOf(lines);
  const fee = assertPiastres(shippingFee, "Shipping fee");
  const appliedDiscount = Math.min(assertPiastres(discount, "Discount"), subtotal);

  return {
    subtotal,
    shippingFee: fee,
    discount: appliedDiscount,
    total: subtotal - appliedDiscount + fee,
  };
}

/**
 * The shipping fee for a destination.
 *
 * Returns null when the governorate has no zone configured, which the
 * checkout surfaces as "we cannot quote delivery here yet" rather than
 * silently shipping for free.
 */
export function shippingFeeFor(
  zones: readonly ShippingZone[],
  governorate: string,
): Piastres | null {
  const zone = zones.find((z) => z.governorate === governorate);
  return zone ? zone.fee : null;
}

export function codAvailableIn(zones: readonly ShippingZone[], governorate: string): boolean {
  // Absent zone means we do not know the destination, so we do not offer to
  // send a courier there to collect cash.
  return zones.find((z) => z.governorate === governorate)?.codAvailable ?? false;
}

/**
 * The delivery estimate as a customer-facing Arabic phrase.
 *
 * Returns null when the zone has no range configured yet -- the brief lists
 * delivery periods as information the business has not supplied, so the UI
 * shows nothing rather than an invented number of days.
 */
export function deliveryEstimate(zone: ShippingZone | undefined): string | null {
  if (!zone || zone.minDays === null || zone.maxDays === null) return null;
  if (zone.minDays === zone.maxDays) {
    return `التوصيل خلال ${zone.minDays} ${dayWord(zone.minDays)}.`;
  }
  return `التوصيل خلال ${zone.minDays} إلى ${zone.maxDays} ${dayWord(zone.maxDays)}.`;
}

/** Arabic plural agreement: 1 يوم, 2 يومان, 3-10 أيام, 11+ يومًا. */
function dayWord(days: number): string {
  if (days === 1) return "يوم";
  if (days === 2) return "يومين";
  if (days <= 10) return "أيام";
  return "يومًا";
}
