import { describe, expect, it } from "vitest";

import {
  GOVERNORATES,
  foldArabicDigits,
  isEgyptianMobile,
  isGovernorate,
  maskMobile,
  normalizeEgyptianMobile,
} from "./egypt";

describe("normalizeEgyptianMobile", () => {
  it("accepts the plain local form", () => {
    expect(normalizeEgyptianMobile("01012345678")).toBe("01012345678");
  });

  it("accepts every live Egyptian prefix", () => {
    for (const prefix of ["010", "011", "012", "015"]) {
      expect(normalizeEgyptianMobile(`${prefix}12345678`)).toBe(`${prefix}12345678`);
    }
  });

  it("strips international prefixes", () => {
    expect(normalizeEgyptianMobile("+201012345678")).toBe("01012345678");
    expect(normalizeEgyptianMobile("00201012345678")).toBe("01012345678");
    expect(normalizeEgyptianMobile("201012345678")).toBe("01012345678");
  });

  it("restores a missing leading zero", () => {
    expect(normalizeEgyptianMobile("1012345678")).toBe("01012345678");
  });

  it("ignores spaces, dashes and parentheses", () => {
    expect(normalizeEgyptianMobile(" 010 1234 5678 ")).toBe("01012345678");
    expect(normalizeEgyptianMobile("010-1234-5678")).toBe("01012345678");
    expect(normalizeEgyptianMobile("(010) 1234 5678")).toBe("01012345678");
  });

  it("folds Arabic-Indic digits, which an Arabic keyboard produces by default", () => {
    expect(normalizeEgyptianMobile("٠١٠١٢٣٤٥٦٧٨")).toBe("01012345678");
  });

  it("rejects a landline, a wrong prefix and a wrong length", () => {
    expect(normalizeEgyptianMobile("0223456789")).toBeNull();
    expect(normalizeEgyptianMobile("01312345678")).toBeNull();
    expect(normalizeEgyptianMobile("0101234567")).toBeNull();
    expect(normalizeEgyptianMobile("010123456789")).toBeNull();
    expect(normalizeEgyptianMobile("")).toBeNull();
    expect(normalizeEgyptianMobile("not a phone")).toBeNull();
  });
});

describe("isEgyptianMobile", () => {
  it("tests the canonical form only", () => {
    expect(isEgyptianMobile("01012345678")).toBe(true);
    expect(isEgyptianMobile("+201012345678")).toBe(false);
  });
});

describe("foldArabicDigits", () => {
  it("converts both Arabic-Indic ranges", () => {
    expect(foldArabicDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
    expect(foldArabicDigits("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
  });

  it("leaves Western digits and Arabic letters alone", () => {
    expect(foldArabicDigits("تايوان 2024")).toBe("تايوان 2024");
  });
});

describe("maskMobile", () => {
  it("shows only the last four digits", () => {
    expect(maskMobile("01012345678")).toBe("•••••••5678");
  });
});

describe("governorates", () => {
  it("covers all 27 Egyptian governorates", () => {
    expect(GOVERNORATES).toHaveLength(27);
  });

  it("has no duplicates, so a zone maps to exactly one destination", () => {
    expect(new Set(GOVERNORATES).size).toBe(GOVERNORATES.length);
  });

  it("narrows an arbitrary string", () => {
    expect(isGovernorate("Cairo")).toBe(true);
    expect(isGovernorate("Atlantis")).toBe(false);
  });
});
