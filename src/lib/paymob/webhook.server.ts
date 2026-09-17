/**
 * The Paymob webhook. SERVER ONLY.
 *
 * This is the only thing in the system that can mark an order paid. The
 * browser coming back from Paymob proves nothing -- a customer can navigate
 * to the success URL themselves, and an attacker certainly can -- so the
 * return page only ever *reads* a status that this handler wrote.
 *
 * The order of checks matters and is deliberate:
 *
 *   1. Verify the HMAC. Everything after this point treats the payload as
 *      Paymob's word; before it, the payload is a stranger's.
 *   2. Find the order by our own reference, not by anything the payload
 *      claims about amounts.
 *   3. Let the database compare the captured amount against the order total
 *      and refuse a mismatch.
 *   4. Record the event id, so a redelivery does nothing the second time.
 *
 * It always answers 200 to a request whose signature verified, even when the
 * order turns out to be unknown or already settled. A gateway that receives a
 * 500 retries, and retrying will not fix either of those; the detail goes to
 * the log instead.
 */
import { getServiceClient } from "@/lib/supabase/service.server";
import { verifyHmac } from "./hmac";

/** Paymob's transaction object, as much of it as we read. */
interface PaymobTransaction {
  id?: number | string;
  amount_cents?: number | string;
  success?: boolean;
  pending?: boolean;
  error_occured?: boolean;
  is_voided?: boolean;
  is_refunded?: boolean;
  order?: { id?: number | string; merchant_order_id?: string };
  // Our own reference, echoed back.
  extras?: { order_number?: string } | null;
  payment_key_claims?: { extra?: { order_number?: string } } | null;
  data?: Record<string, unknown>;
}

interface PaymobCallback {
  type?: string;
  obj?: PaymobTransaction;
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Finds our order number in the callback.
 *
 * Paymob echoes `extras` back in more than one place depending on the flow,
 * and the `special_reference` we set comes back on `merchant_order_id` with
 * the attempt suffix still attached. Each candidate is tried in turn, and the
 * suffix is trimmed back to the `TC-XXXXXXXX` shape.
 */
export function extractOrderNumber(transaction: PaymobTransaction): string | null {
  const candidates = [
    transaction.extras?.order_number,
    transaction.payment_key_claims?.extra?.order_number,
    transaction.order?.merchant_order_id,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const match = candidate.match(/TC-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}/i);
    if (match) return match[0].toUpperCase();
  }
  return null;
}

/**
 * Decides what a transaction means.
 *
 * `success` alone is not enough: a voided or refunded transaction also
 * carries success=true, and a pending one is neither a success nor a failure
 * yet. Anything not clearly successful is treated as not-paid, which is the
 * safe direction to be wrong in.
 */
export function classify(transaction: PaymobTransaction): "paid" | "failed" | "pending" {
  if (transaction.pending === true) return "pending";
  if (transaction.is_voided === true || transaction.is_refunded === true) return "failed";
  if (transaction.error_occured === true) return "failed";
  return transaction.success === true ? "paid" : "failed";
}

export async function handlePaymobWebhook(request: Request): Promise<Response> {
  const secret = process.env["PAYMOB_HMAC_SECRET"];
  if (!secret) {
    // Fail closed. Without the secret nothing can be verified, and accepting
    // an unverified callback would let anyone mark any order paid.
    console.error("[taher-caps] PAYMOB_HMAC_SECRET is not set; webhook refused");
    return json(503, { error: "not_configured" });
  }

  let body: PaymobCallback;
  try {
    body = (await request.json()) as PaymobCallback;
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const transaction = body.obj;
  if (!transaction) return json(400, { error: "no_transaction" });

  // Paymob sends the signature as a query parameter on the callback URL.
  const url = new URL(request.url);
  const received = url.searchParams.get("hmac") ?? request.headers.get("hmac");

  if (!(await verifyHmac(transaction as Record<string, unknown>, received, secret))) {
    console.warn("[taher-caps] rejected a Paymob callback with a bad signature");
    return json(401, { error: "bad_signature" });
  }

  const orderNumber = extractOrderNumber(transaction);
  if (!orderNumber) {
    console.error("[taher-caps] verified callback carried no recognisable order number");
    return json(200, { result: "ignored_no_order_number" });
  }

  // The event id is what makes processing idempotent. Paymob's transaction id
  // is unique per transaction and stable across redeliveries of the same one.
  const eventId = String(transaction.id ?? "");
  if (!eventId) return json(200, { result: "ignored_no_transaction_id" });

  const outcome = classify(transaction);
  if (outcome === "pending") {
    // Nothing to do yet: the hold stands, and a later callback will settle it.
    return json(200, { result: "pending", orderNumber });
  }

  const supabase = getServiceClient();

  if (outcome === "failed") {
    const { error } = await supabase.rpc("tc_fail_payment", {
      p_order_number: orderNumber,
      p_status: "failed",
      p_event_id: eventId,
      p_payload: transaction as unknown as Record<string, unknown>,
    });
    if (error) {
      console.error("[taher-caps] could not record failed payment", orderNumber, error.message);
      return json(200, { result: "failed_not_recorded", orderNumber });
    }
    return json(200, { result: "failed", orderNumber });
  }

  // The amount is passed through as an integer and compared inside the
  // database against the order's own total. A mismatch is refused there, not
  // here, so the check cannot be skipped by a different caller.
  const amount = Number(transaction.amount_cents);
  if (!Number.isSafeInteger(amount)) {
    console.error(
      "[taher-caps] verified callback had a non-integer amount",
      transaction.amount_cents,
    );
    return json(200, { result: "ignored_bad_amount", orderNumber });
  }

  const { data, error } = await supabase.rpc("tc_confirm_payment", {
    p_order_number: orderNumber,
    p_transaction_id: eventId,
    p_amount_piastres: amount,
    p_event_id: eventId,
    p_payload: transaction as unknown as Record<string, unknown>,
  });

  if (error) {
    if (error.message.includes("amount_mismatch")) {
      // Recorded against the order by the database. Somebody has to look at
      // it; the order stays unpaid in the meantime, and Paymob is told we
      // received the callback so it stops retrying.
      console.error("[taher-caps] AMOUNT MISMATCH on", orderNumber, error.message);
      return json(200, { result: "amount_mismatch", orderNumber });
    }
    console.error("[taher-caps] could not confirm payment", orderNumber, error.message);
    // A transient database failure is worth a retry, so this one is a 500.
    return json(500, { error: "confirm_failed" });
  }

  return json(200, { result: (data as { result?: string })?.result ?? "confirmed", orderNumber });
}
