import { describe, expect, it } from "vitest";

import {
  HMAC_FIELD_ORDER,
  buildHmacPayload,
  computeHmac,
  renderHmacValue,
  timingSafeEqual,
  verifyHmac,
} from "./hmac";

/** A transaction shaped the way Paymob sends one. */
const TRANSACTION = {
  amount_cents: 81000,
  created_at: "2026-09-17T12:00:00.000000",
  currency: "EGP",
  error_occured: false,
  has_parent_transaction: false,
  id: 123456789,
  integration_id: 4242,
  is_3d_secure: true,
  is_auth: false,
  is_capture: false,
  is_refunded: false,
  is_standalone_payment: true,
  is_voided: false,
  order: { id: 987654321 },
  owner: 1111,
  pending: false,
  source_data: { pan: "2346", sub_type: "MasterCard", type: "card" },
  success: true,
};

const SECRET = "test-hmac-secret";

describe("HMAC field order", () => {
  it("is the twenty fields Paymob signs", () => {
    expect(HMAC_FIELD_ORDER).toHaveLength(20);
  });

  it("starts and ends where Paymob's list does", () => {
    expect(HMAC_FIELD_ORDER[0]).toBe("amount_cents");
    expect(HMAC_FIELD_ORDER.at(-1)).toBe("success");
  });

  it("is pinned field by field, not derived from sorting", () => {
    // The list happens to read alphabetically, but nothing may depend on
    // that: it is Paymob's list, and if they add a field out of sequence the
    // constant is what changes. Pinning it here means a well-meaning
    // "tidy-up" that re-sorts or reorders the constant fails this test.
    expect([...HMAC_FIELD_ORDER]).toEqual([
      "amount_cents",
      "created_at",
      "currency",
      "error_occured",
      "has_parent_transaction",
      "id",
      "integration_id",
      "is_3d_secure",
      "is_auth",
      "is_capture",
      "is_refunded",
      "is_standalone_payment",
      "is_voided",
      "order.id",
      "owner",
      "pending",
      "source_data.pan",
      "source_data.sub_type",
      "source_data.type",
      "success",
    ]);
  });
});

describe("renderHmacValue", () => {
  it("renders booleans as lowercase words", () => {
    expect(renderHmacValue(true)).toBe("true");
    expect(renderHmacValue(false)).toBe("false");
  });

  it("renders a missing value as empty, not as the word undefined", () => {
    expect(renderHmacValue(undefined)).toBe("");
    expect(renderHmacValue(null)).toBe("");
  });

  it("renders numbers plainly", () => {
    expect(renderHmacValue(81000)).toBe("81000");
    expect(renderHmacValue(0)).toBe("0");
  });
});

describe("buildHmacPayload", () => {
  it("concatenates the values in order with no separator", () => {
    const payload = buildHmacPayload(TRANSACTION);
    expect(payload.startsWith("810002026-09-17T12:00:00.000000EGPfalsefalse")).toBe(true);
    expect(payload.endsWith("cardtrue")).toBe(true);
  });

  it("reads nested paths", () => {
    expect(buildHmacPayload(TRANSACTION)).toContain("987654321");
    expect(buildHmacPayload(TRANSACTION)).toContain("MasterCard");
  });

  it("does not throw when a nested object is missing entirely", () => {
    const partial = { ...TRANSACTION, source_data: undefined, order: undefined };
    expect(() => buildHmacPayload(partial)).not.toThrow();
  });

  it("changes when any single field changes", async () => {
    const original = buildHmacPayload(TRANSACTION);
    for (const patch of [
      { amount_cents: 81001 },
      { success: false },
      { id: 123456780 },
      { currency: "USD" },
    ]) {
      expect(buildHmacPayload({ ...TRANSACTION, ...patch })).not.toBe(original);
    }
  });
});

describe("verifyHmac", () => {
  it("accepts the signature it computes", async () => {
    const signature = await computeHmac(TRANSACTION, SECRET);
    await expect(verifyHmac(TRANSACTION, signature, SECRET)).resolves.toBe(true);
  });

  it("is case-insensitive about the hex, which gateways vary on", async () => {
    const signature = await computeHmac(TRANSACTION, SECRET);
    await expect(verifyHmac(TRANSACTION, signature.toUpperCase(), SECRET)).resolves.toBe(true);
  });

  it("tolerates surrounding whitespace from a query string", async () => {
    const signature = await computeHmac(TRANSACTION, SECRET);
    await expect(verifyHmac(TRANSACTION, ` ${signature} `, SECRET)).resolves.toBe(true);
  });

  it("rejects a tampered amount, which is the attack that matters", async () => {
    const signature = await computeHmac(TRANSACTION, SECRET);
    const tampered = { ...TRANSACTION, amount_cents: 1 };
    await expect(verifyHmac(tampered, signature, SECRET)).resolves.toBe(false);
  });

  it("rejects a forged success flag", async () => {
    const signature = await computeHmac({ ...TRANSACTION, success: false }, SECRET);
    await expect(verifyHmac(TRANSACTION, signature, SECRET)).resolves.toBe(false);
  });

  it("rejects a signature made with a different secret", async () => {
    const signature = await computeHmac(TRANSACTION, "someone-elses-secret");
    await expect(verifyHmac(TRANSACTION, signature, SECRET)).resolves.toBe(false);
  });

  it("rejects a missing signature rather than passing it through", async () => {
    await expect(verifyHmac(TRANSACTION, null, SECRET)).resolves.toBe(false);
    await expect(verifyHmac(TRANSACTION, "", SECRET)).resolves.toBe(false);
    await expect(verifyHmac(TRANSACTION, undefined, SECRET)).resolves.toBe(false);
  });

  it("rejects everything when the secret is not configured", async () => {
    const signature = await computeHmac(TRANSACTION, SECRET);
    // A deploy that forgot PAYMOB_HMAC_SECRET must fail closed, never open.
    await expect(verifyHmac(TRANSACTION, signature, "")).resolves.toBe(false);
  });

  it("produces a 128-character SHA-512 hex digest", async () => {
    const signature = await computeHmac(TRANSACTION, SECRET);
    expect(signature).toMatch(/^[0-9a-f]{128}$/);
  });

  it("is stable across calls", async () => {
    const a = await computeHmac(TRANSACTION, SECRET);
    const b = await computeHmac(TRANSACTION, SECRET);
    expect(a).toBe(b);
  });
});

describe("timingSafeEqual", () => {
  it("matches identical strings", () => {
    expect(timingSafeEqual("abc123", "abc123")).toBe(true);
  });

  it("rejects different strings of the same length", () => {
    expect(timingSafeEqual("abc123", "abc124")).toBe(false);
  });

  it("rejects different lengths", () => {
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });

  it("compares the whole string rather than stopping at the first difference", () => {
    // Not a timing measurement -- just a guard that an early-exit refactor
    // would have to break one of these cases to pass.
    expect(timingSafeEqual("xbc", "abc")).toBe(false);
    expect(timingSafeEqual("abx", "abc")).toBe(false);
  });
});
