import { describe, expect, it } from "vitest";

import {
  codAvailableIn,
  computeTotals,
  deliveryEstimate,
  priceLine,
  shippingFeeFor,
} from "./totals";
import type { ShippingZone } from "./types";

const CAP = priceLine("taiwan", "تايوان يا ريس", 75_000, 2);
const OTHER = priceLine("al-adou", "العدو ليس بهذه القوة", 80_000, 1);

const ZONES: ShippingZone[] = [
  { governorate: "Cairo", fee: 6_000, codAvailable: true, minDays: 2, maxDays: 4 },
  { governorate: "Aswan", fee: 11_000, codAvailable: false, minDays: 5, maxDays: 7 },
  { governorate: "Luxor", fee: 11_000, codAvailable: true, minDays: null, maxDays: null },
];

describe("priceLine", () => {
  it("derives the line total from unit price and quantity", () => {
    expect(CAP.lineTotal).toBe(150_000);
  });

  it("refuses a price that is not whole piastres", () => {
    expect(() => priceLine("taiwan", "x", 750.5, 1)).toThrow(/Unit price/);
  });
});

describe("computeTotals", () => {
  it("adds the lines and the shipping fee", () => {
    const totals = computeTotals([CAP, OTHER], 6_000);
    expect(totals.subtotal).toBe(230_000);
    expect(totals.shippingFee).toBe(6_000);
    expect(totals.discount).toBe(0);
    expect(totals.total).toBe(236_000);
  });

  it("applies a discount to the goods only, never to shipping", () => {
    const totals = computeTotals([CAP], 6_000, 20_000);
    expect(totals.subtotal).toBe(150_000);
    expect(totals.discount).toBe(20_000);
    expect(totals.total).toBe(136_000);
  });

  it("clamps an oversized discount to the subtotal so shipping is still charged", () => {
    const totals = computeTotals([CAP], 6_000, 999_999);
    expect(totals.discount).toBe(150_000);
    expect(totals.total).toBe(6_000);
  });

  it("never produces a negative total", () => {
    const totals = computeTotals([CAP], 0, 999_999);
    expect(totals.total).toBe(0);
  });

  it("handles an empty cart without inventing a charge", () => {
    const totals = computeTotals([], 0);
    expect(totals).toEqual({ subtotal: 0, shippingFee: 0, discount: 0, total: 0 });
  });

  it("rejects a fractional shipping fee rather than rounding it", () => {
    expect(() => computeTotals([CAP], 60.5)).toThrow(/Shipping fee/);
  });
});

describe("shippingFeeFor", () => {
  it("finds the configured fee", () => {
    expect(shippingFeeFor(ZONES, "Cairo")).toBe(6_000);
  });

  it("returns null for a destination with no zone, rather than shipping free", () => {
    expect(shippingFeeFor(ZONES, "Matrouh")).toBeNull();
  });
});

describe("codAvailableIn", () => {
  it("follows the zone setting", () => {
    expect(codAvailableIn(ZONES, "Cairo")).toBe(true);
    expect(codAvailableIn(ZONES, "Aswan")).toBe(false);
  });

  it("refuses cash on delivery to an unknown destination", () => {
    expect(codAvailableIn(ZONES, "Matrouh")).toBe(false);
  });
});

describe("deliveryEstimate", () => {
  it("renders a range", () => {
    expect(deliveryEstimate(ZONES[0])).toBe("التوصيل خلال 2 إلى 4 أيام.");
  });

  it("renders a single day count with Arabic plural agreement", () => {
    expect(deliveryEstimate({ ...ZONES[0]!, minDays: 1, maxDays: 1 })).toBe("التوصيل خلال 1 يوم.");
    expect(deliveryEstimate({ ...ZONES[0]!, minDays: 2, maxDays: 2 })).toBe(
      "التوصيل خلال 2 يومين.",
    );
    expect(deliveryEstimate({ ...ZONES[0]!, minDays: 12, maxDays: 12 })).toBe(
      "التوصيل خلال 12 يومًا.",
    );
  });

  it("says nothing when the business has not supplied a delivery period", () => {
    expect(deliveryEstimate(ZONES[2])).toBeNull();
    expect(deliveryEstimate(undefined)).toBeNull();
  });
});
