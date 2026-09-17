/**
 * Paymob callback verification.
 *
 * Paymob signs a callback by concatenating a fixed, ordered list of fields
 * from the transaction object -- no separators, no keys, just the values one
 * after another -- taking an HMAC-SHA512 of that string with the merchant's
 * HMAC secret, and sending the result as a hex string.
 *
 * Two things about this are easy to get wrong and expensive to get wrong:
 *
 *   1. The field ORDER is fixed. It is the list below -- which reads
 *      alphabetically, though nothing should rely on that -- and a single
 *      field out of place produces a completely different digest.
 *   2. Booleans must be rendered the way Paymob renders them -- "true" and
 *      "false" lowercase -- and absent fields as empty strings, not as
 *      "undefined" or "null".
 *
 * Verify the field list against the current Paymob documentation before going
 * live; see docs/PAYMOB.md for the exact page. If Paymob adds a field, this
 * list is where it goes.
 */

/**
 * The transaction-processed callback fields, in Paymob's order.
 *
 * Dotted names are nested lookups into the transaction object: `order.id` is
 * `obj.order.id`.
 */
export const HMAC_FIELD_ORDER = [
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
] as const;

type Json = Record<string, unknown>;

/** Follows a dotted path, returning undefined rather than throwing. */
function lookup(source: Json, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (value === null || typeof value !== "object") return undefined;
    return (value as Json)[key];
  }, source);
}

/**
 * Renders one value the way Paymob does when it builds the string it signs.
 *
 * Booleans are lowercase words; null and undefined are empty. Numbers use
 * their plain decimal form. Anything else is stringified as-is.
 */
export function renderHmacValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

/** The exact string Paymob signs, for a given transaction object. */
export function buildHmacPayload(transaction: Json): string {
  return HMAC_FIELD_ORDER.map((field) => renderHmacValue(lookup(transaction, field))).join("");
}

/**
 * Computes the expected HMAC.
 *
 * Uses Web Crypto rather than node:crypto so the same code runs on Vercel's
 * edge and node runtimes and in a test, without a polyfill.
 */
export async function computeHmac(transaction: Json, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(buildHmacPayload(transaction)),
  );
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Constant-time string comparison.
 *
 * A plain `===` on a signature leaks, through how long it takes to fail,
 * roughly how much of a guess was correct -- which is enough to reconstruct a
 * valid signature one character at a time. This compares every character
 * regardless of where the first difference is.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * True when `received` is the signature Paymob would have produced.
 *
 * A missing or malformed signature is false, never true: an unsigned callback
 * is an unauthenticated one, and this is the only thing standing between a
 * stranger with the webhook URL and an order marked paid.
 */
export async function verifyHmac(
  transaction: Json,
  received: string | null | undefined,
  secret: string,
): Promise<boolean> {
  if (!received || !secret) return false;
  const expected = await computeHmac(transaction, secret);
  return timingSafeEqual(expected.toLowerCase(), received.trim().toLowerCase());
}
