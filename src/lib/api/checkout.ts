/**
 * Checkout. SERVER ONLY.
 *
 * The one entry point through which an order can come into existence. It
 * validates the request, rate-limits the caller, hands the work to
 * `tc_place_order` -- which does the pricing and the stock reservation inside
 * a single transaction -- and, for an online payment, starts the Paymob
 * intention and returns where to send the customer.
 *
 * What this function never does: trust a price, a subtotal or a total from
 * the browser. The request carries slugs and quantities; everything with a
 * currency attached is looked up.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";

import { getServiceClient, toApiError } from "@/lib/supabase/service.server";
import { ApiError } from "@/lib/errors";
import { checkoutSchema, type CheckoutInput } from "@/lib/domain/validation";
import { createIntention, paymobConfigured } from "@/lib/paymob/client.server";
import { siteUrl } from "@/lib/supabase/config";
import type { PlacedOrder, PricedLine } from "@/lib/domain/types";

/**
 * Checkout attempts allowed from one address per window.
 *
 * Generous enough that a customer who mistypes their address four times is
 * unaffected, tight enough that nobody walks the last of the stock into
 * reservations with a script.
 */
const CHECKOUT_LIMIT = 10;
const CHECKOUT_WINDOW_SECONDS = 600;

/**
 * Identifies the caller for rate limiting.
 *
 * `xForwardedFor` is trusted because this app is deployed behind Vercel,
 * which overwrites the header with the real client address. On a host that
 * does not, this would be a header an attacker sets freely -- see
 * docs/DEPLOYMENT.md before moving it somewhere else.
 */
function callerId(): string {
  return getRequestIP({ xForwardedFor: true }) ?? "unknown";
}

async function enforceRateLimit(bucket: string, max: number, windowSeconds: number): Promise<void> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("tc_check_rate_limit", {
    p_bucket: bucket,
    p_identifier: callerId(),
    p_max: max,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    // A limiter that cannot be reached must not become a way to bypass it,
    // nor a way to take the shop down. It is logged and the request proceeds:
    // the database is still the thing that prevents overselling.
    console.error("[taher-caps] rate limit check failed", error.message);
    return;
  }

  if (data === false) {
    throw new ApiError(
      "rate_limited",
      "Too many attempts. Please wait a few minutes and try again.",
    );
  }
}

interface OrderSummaryPayload {
  orderNumber: string;
  paymentMethod: "paymob" | "cod";
  paymentStatus: PlacedOrder["paymentStatus"];
  fulfilmentStatus: PlacedOrder["fulfilmentStatus"];
  subtotal: number;
  shippingFee: number;
  discount: number;
  total: number;
  customerName: string;
  address: PlacedOrder["address"];
  lines: PricedLine[];
}

/** Prices a cart without creating anything, for the checkout summary. */
export const quoteOrder = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { items: CheckoutInput["items"]; governorate: string; discountCode?: string }) => input,
  )
  .handler(async ({ data }) => {
    const supabase = getServiceClient();
    const { data: quote, error } = await supabase.rpc("tc_quote_order", {
      p_items: data.items,
      p_governorate: data.governorate,
      p_discount_code: data.discountCode ?? null,
    });

    if (error) throw toApiError(error, "quoteOrder");

    return quote as {
      lines: PricedLine[];
      subtotal: number;
      discount: number;
      shippingFee: number | null;
      total: number | null;
      codAvailable: boolean;
      minDays: number | null;
      maxDays: number | null;
      discountApplied: boolean;
    };
  });

export const placeOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    // Validation runs here, on the server, whatever the browser did or did
    // not do. A request that never touched the form meets the same rules.
    const parsed = checkoutSchema.safeParse(input);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new ApiError("invalid_input", first?.message ?? "Please check the form and try again.");
    }
    return parsed.data;
  })
  .handler(async ({ data }): Promise<PlacedOrder> => {
    await enforceRateLimit("checkout", CHECKOUT_LIMIT, CHECKOUT_WINDOW_SECONDS);

    if (data.paymentMethod === "paymob" && !paymobConfigured()) {
      throw new ApiError(
        "paymob_unavailable",
        "Online payment is not available right now. Please choose cash on delivery.",
      );
    }

    const supabase = getServiceClient();

    // The database decides the price, the shipping fee, the discount and the
    // total, and reserves the stock, all in one transaction.
    const { data: summary, error } = await supabase.rpc("tc_place_order", {
      p_items: data.items,
      p_customer: {
        fullName: data.customer.fullName,
        mobile: data.customer.mobile,
        email: data.customer.email ?? "",
      },
      p_address: data.address,
      p_payment_method: data.paymentMethod,
      p_idempotency_key: data.idempotencyKey,
      p_discount_code: data.discountCode ?? null,
    });

    if (error) throw toApiError(error, "placeOrder");

    const order = summary as OrderSummaryPayload;

    const placed: PlacedOrder = {
      orderNumber: order.orderNumber,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      fulfilmentStatus: order.fulfilmentStatus,
      lines: order.lines,
      subtotal: order.subtotal,
      shippingFee: order.shippingFee,
      discount: order.discount,
      total: order.total,
      address: order.address,
      customerName: order.customerName,
    };

    if (data.paymentMethod === "cod") return placed;

    // Online payment: start the intention and hand back somewhere to go.
    //
    // If this throws, the order exists with its stock reserved and its
    // payment pending -- which is recoverable. The customer sees an error,
    // the reservation expires on its own, and nothing has been charged. The
    // alternative, creating the intention first, would risk a charge against
    // an order that was never written down.
    try {
      const intention = await createIntention({
        amountPiastres: order.total,
        orderNumber: order.orderNumber,
        customer: data.customer,
        address: {
          governorate: data.address.governorate,
          city: data.address.city,
          street: data.address.street,
          building: data.address.building,
        },
        items: order.lines.map((line) => ({
          name: line.name,
          amountPiastres: line.unitPrice,
          quantity: line.quantity,
        })),
        redirectionUrl: `${siteUrl()}/order/${order.orderNumber}`,
        notificationUrl: `${siteUrl()}/api/paymob/webhook`,
      });

      await supabase.rpc("tc_attach_payment_reference", {
        p_order_number: order.orderNumber,
        p_intention_id: intention.intentionId,
        p_paymob_order_id: intention.paymobOrderId,
      });

      return { ...placed, checkoutUrl: intention.checkoutUrl };
    } catch (cause) {
      console.error("[taher-caps] could not start payment for", order.orderNumber, cause);
      throw new ApiError(
        "payment_start_failed",
        `Your order ${order.orderNumber} was saved, but the payment could not be started. Please try paying again from the order page.`,
      );
    }
  });
