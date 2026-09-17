import { describe, expect, it } from "vitest";

import { CART_STORAGE_KEY, sanitizeStoredCart } from "./storage";
import { MAX_QUANTITY_PER_LINE } from "@/lib/domain/validation";

describe("sanitizeStoredCart", () => {
  it("keeps a well-formed cart", () => {
    expect(sanitizeStoredCart([{ slug: "taiwan", quantity: 2 }])).toEqual([
      { slug: "taiwan", quantity: 2 },
    ]);
  });

  it("keeps both caps", () => {
    expect(
      sanitizeStoredCart([
        { slug: "taiwan", quantity: 1 },
        { slug: "al-adou", quantity: 2 },
      ]),
    ).toHaveLength(2);
  });

  it("drops a product this shop does not sell", () => {
    expect(sanitizeStoredCart([{ slug: "hoodie", quantity: 1 }])).toEqual([]);
  });

  it("clamps a quantity somebody edited upwards", () => {
    expect(sanitizeStoredCart([{ slug: "taiwan", quantity: 9999 }])).toEqual([
      { slug: "taiwan", quantity: MAX_QUANTITY_PER_LINE },
    ]);
  });

  it("raises a zero or negative quantity to one", () => {
    expect(sanitizeStoredCart([{ slug: "taiwan", quantity: 0 }])).toEqual([
      { slug: "taiwan", quantity: 1 },
    ]);
    expect(sanitizeStoredCart([{ slug: "taiwan", quantity: -5 }])).toEqual([
      { slug: "taiwan", quantity: 1 },
    ]);
  });

  it("drops a fractional quantity rather than rounding it", () => {
    expect(sanitizeStoredCart([{ slug: "taiwan", quantity: 1.5 }])).toEqual([]);
  });

  it("folds a duplicated slug to one line", () => {
    expect(
      sanitizeStoredCart([
        { slug: "taiwan", quantity: 1 },
        { slug: "taiwan", quantity: 3 },
      ]),
    ).toEqual([{ slug: "taiwan", quantity: 1 }]);
  });

  it("keeps nothing but slug and quantity, so a smuggled price is not read", () => {
    const [line] = sanitizeStoredCart([
      { slug: "taiwan", quantity: 1, unitPrice: 1, total: 1, price: 0 },
    ]);
    expect(line).toEqual({ slug: "taiwan", quantity: 1 });
    expect(Object.keys(line!)).toEqual(["slug", "quantity"]);
  });

  it("survives every shape of corruption without throwing", () => {
    expect(sanitizeStoredCart(null)).toEqual([]);
    expect(sanitizeStoredCart(undefined)).toEqual([]);
    expect(sanitizeStoredCart("not an array")).toEqual([]);
    expect(sanitizeStoredCart(42)).toEqual([]);
    expect(sanitizeStoredCart({})).toEqual([]);
    expect(sanitizeStoredCart([null, undefined, 42, "x", []])).toEqual([]);
    expect(sanitizeStoredCart([{}])).toEqual([]);
    expect(sanitizeStoredCart([{ slug: 5, quantity: "two" }])).toEqual([]);
    expect(sanitizeStoredCart([{ slug: "taiwan" }])).toEqual([]);
    expect(sanitizeStoredCart([{ quantity: 1 }])).toEqual([]);
  });

  it("keeps the good lines from a partly corrupt cart", () => {
    expect(sanitizeStoredCart([{ slug: "bad" }, { slug: "taiwan", quantity: 2 }, null])).toEqual([
      { slug: "taiwan", quantity: 2 },
    ]);
  });
});

describe("the storage key", () => {
  it("is versioned, so a future shape change cannot read an old cart", () => {
    expect(CART_STORAGE_KEY).toMatch(/\.v\d+$/);
  });
});
