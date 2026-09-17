/**
 * The srcset rule.
 *
 * This exists because of a real bug: the manifest claimed a 1600px original
 * while the file was 1024px, so the gallery offered 1200px and 1800px
 * variants the optimiser had never written. The browser asked for one, got a
 * 404, and rendered a broken image where the cap should have been.
 */
import { describe, expect, it } from "vitest";

import { IMAGE_WIDTHS, PRODUCT_CONTENT } from "./products";

/** Mirrors the filter in components/product-image.tsx. */
function offeredWidths(intrinsicWidth: number): number[] {
  const [smallest] = IMAGE_WIDTHS;
  return IMAGE_WIDTHS.filter((width) => width <= intrinsicWidth || width === smallest);
}

describe("offered image widths", () => {
  it("never offers a variant larger than the original, which would not exist", () => {
    expect(offeredWidths(1024)).toEqual([480, 768]);
    expect(offeredWidths(800)).toEqual([480, 768]);
  });

  it("offers every width when the original is large enough", () => {
    expect(offeredWidths(1800)).toEqual([...IMAGE_WIDTHS]);
    expect(offeredWidths(4000)).toEqual([...IMAGE_WIDTHS]);
  });

  it("always offers at least one candidate, even for a tiny original", () => {
    expect(offeredWidths(100)).toEqual([480]);
    expect(offeredWidths(1)).toHaveLength(1);
  });
});

describe("the catalogue's declared sizes", () => {
  it("declares a real intrinsic size for every image", () => {
    for (const product of PRODUCT_CONTENT) {
      for (const image of product.images) {
        expect(image.width, `${image.id} width`).toBeGreaterThan(0);
        expect(image.height, `${image.id} height`).toBeGreaterThan(0);
        // A declared size smaller than the smallest variant would mean the
        // optimiser produced nothing usable for it.
        expect(image.width, `${image.id} is at least one variant wide`).toBeGreaterThanOrEqual(
          IMAGE_WIDTHS[0]!,
        );
      }
    }
  });

  it("gives every image a non-empty Arabic alt text", () => {
    for (const product of PRODUCT_CONTENT) {
      for (const image of product.images) {
        expect(image.alt.trim().length, `${image.id} alt`).toBeGreaterThan(0);
        // Arabic range: the alt text describes the photograph for an Arabic
        // reader, so a stray English placeholder is a mistake worth catching.
        expect(image.alt, `${image.id} alt is Arabic`).toMatch(/[؀-ۿ]/);
      }
    }
  });
});
