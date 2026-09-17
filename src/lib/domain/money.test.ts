import { describe, expect, it } from "vitest";

import {
  assertPiastres,
  formatEGP,
  isValidPiastres,
  lineTotal,
  piastresToPounds,
  poundsToPiastres,
  sum,
} from "./money";

describe("piastre conversion", () => {
  it("round-trips whole pounds", () => {
    expect(poundsToPiastres(750)).toBe(75_000);
    expect(piastresToPounds(75_000)).toBe(750);
  });

  it("rounds rather than truncating a fractional pound", () => {
    expect(poundsToPiastres(12.345)).toBe(1235);
    expect(poundsToPiastres(12.344)).toBe(1234);
  });

  it("is exact where floating point pounds would not be", () => {
    // 0.1 + 0.2 in pounds is 0.30000000000000004; in piastres it is 30.
    expect(poundsToPiastres(0.1) + poundsToPiastres(0.2)).toBe(30);
  });
});

describe("isValidPiastres", () => {
  it("accepts whole non-negative integers", () => {
    expect(isValidPiastres(0)).toBe(true);
    expect(isValidPiastres(75_000)).toBe(true);
  });

  it("rejects fractions, negatives and non-numbers", () => {
    expect(isValidPiastres(10.5)).toBe(false);
    expect(isValidPiastres(-1)).toBe(false);
    expect(isValidPiastres(Number.NaN)).toBe(false);
    expect(isValidPiastres(Infinity)).toBe(false);
    expect(isValidPiastres("750")).toBe(false);
    expect(isValidPiastres(null)).toBe(false);
  });

  it("throws with the field name when asserted", () => {
    expect(() => assertPiastres(-5, "Shipping fee")).toThrow(/Shipping fee/);
  });
});

describe("formatEGP", () => {
  it("omits decimals for whole pounds", () => {
    expect(formatEGP(75_000)).toBe("750 EGP");
  });

  it("keeps two places when there are piastres", () => {
    expect(formatEGP(75_050)).toBe("750.50 EGP");
  });

  it("uses Western digits, not Arabic-Indic", () => {
    expect(formatEGP(120_000)).toMatch(/^[\d,]+ EGP$/);
  });

  it("formats zero", () => {
    expect(formatEGP(0)).toBe("0 EGP");
  });
});

describe("lineTotal", () => {
  it("multiplies in integers", () => {
    expect(lineTotal(75_000, 3)).toBe(225_000);
  });

  it("treats a zero quantity as zero", () => {
    expect(lineTotal(75_000, 0)).toBe(0);
  });

  it("rejects a fractional or negative quantity", () => {
    expect(() => lineTotal(75_000, 1.5)).toThrow(/Quantity/);
    expect(() => lineTotal(75_000, -1)).toThrow(/Quantity/);
  });
});

describe("sum", () => {
  it("adds amounts", () => {
    expect(sum([100, 250, 25])).toBe(375);
  });

  it("is zero for an empty cart", () => {
    expect(sum([])).toBe(0);
  });

  it("refuses a bad amount rather than coercing it", () => {
    expect(() => sum([100, -1])).toThrow();
  });
});
