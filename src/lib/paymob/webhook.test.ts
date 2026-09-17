/**
 * The webhook's two decisions, tested in isolation.
 *
 * Which order a callback is about, and whether it means the money arrived.
 * Both are pure functions on the payload, and both are places where being
 * wrong costs real money -- a misread order number marks the wrong order
 * paid, and a misread status marks an unpaid order paid.
 */
import { describe, expect, it } from "vitest";

import { classify, extractOrderNumber } from "./webhook.server";

describe("extractOrderNumber", () => {
  it("reads the reference from extras", () => {
    expect(extractOrderNumber({ extras: { order_number: "TC-9VY0Y9ED" } })).toBe("TC-9VY0Y9ED");
  });

  it("falls back to the payment key claims, where some flows put it", () => {
    expect(
      extractOrderNumber({ payment_key_claims: { extra: { order_number: "TC-33R0S8DS" } } }),
    ).toBe("TC-33R0S8DS");
  });

  it("falls back to merchant_order_id", () => {
    expect(extractOrderNumber({ order: { merchant_order_id: "TC-ABCDEFGH" } })).toBe("TC-ABCDEFGH");
  });

  it("strips the attempt suffix we append to special_reference", () => {
    // createIntention sends "TC-XXXXXXXX-<base36 clock>" so a retry does not
    // collide with the first attempt at the gateway.
    expect(extractOrderNumber({ order: { merchant_order_id: "TC-ABCDEFGH-m2k9x1" } })).toBe(
      "TC-ABCDEFGH",
    );
  });

  it("uppercases what it finds", () => {
    expect(extractOrderNumber({ extras: { order_number: "tc-abcdefgh" } })).toBe("TC-ABCDEFGH");
  });

  it("prefers extras over merchant_order_id when both are present", () => {
    expect(
      extractOrderNumber({
        extras: { order_number: "TC-11111111" },
        order: { merchant_order_id: "TC-22222222" },
      }),
    ).toBe("TC-11111111");
  });

  it("returns null rather than guessing when there is no reference", () => {
    expect(extractOrderNumber({})).toBeNull();
    expect(extractOrderNumber({ extras: null })).toBeNull();
    expect(extractOrderNumber({ order: { merchant_order_id: "12345" } })).toBeNull();
    expect(extractOrderNumber({ extras: { order_number: "not-an-order" } })).toBeNull();
  });

  it("does not match a reference of the wrong length", () => {
    expect(extractOrderNumber({ extras: { order_number: "TC-ABC" } })).toBeNull();
  });

  it("ignores the ambiguous letters the order-number alphabet excludes", () => {
    // I, L, O and U are not in the alphabet, so a string containing them is
    // not a valid order number and must not match.
    expect(extractOrderNumber({ extras: { order_number: "TC-IIIILLLL" } })).toBeNull();
  });
});

describe("classify", () => {
  it("calls a plain success paid", () => {
    expect(classify({ success: true })).toBe("paid");
  });

  it("calls an explicit failure failed", () => {
    expect(classify({ success: false })).toBe("failed");
  });

  it("treats a pending transaction as neither, so nothing is settled early", () => {
    expect(classify({ success: true, pending: true })).toBe("pending");
    expect(classify({ success: false, pending: true })).toBe("pending");
  });

  it("does not call a voided transaction paid, even though success is true", () => {
    // This is the trap: Paymob sends success=true on a void as well, and
    // taking it at face value marks a reversed payment as received.
    expect(classify({ success: true, is_voided: true })).toBe("failed");
  });

  it("does not call a refunded transaction paid", () => {
    expect(classify({ success: true, is_refunded: true })).toBe("failed");
  });

  it("does not call an errored transaction paid", () => {
    expect(classify({ success: true, error_occured: true })).toBe("failed");
  });

  it("treats a missing success flag as failed, never as paid", () => {
    expect(classify({})).toBe("failed");
    // Through `unknown` because `exactOptionalPropertyTypes` distinguishes an
    // absent property from one present and undefined. A JSON payload can be
    // either, so both are worth asserting.
    expect(classify({ success: undefined } as unknown as { success?: boolean })).toBe("failed");
  });

  it("does not accept a truthy non-boolean as success", () => {
    // A string "true" from a malformed payload must not read as payment.
    expect(classify({ success: "true" as unknown as boolean })).toBe("failed");
    expect(classify({ success: 1 as unknown as boolean })).toBe("failed");
  });
});
