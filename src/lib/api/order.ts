/**
 * The confirmation page's data. SERVER ONLY.
 *
 * Two ways a customer reaches /order/TC-XXXXXXXX:
 *
 *   1. Straight from checkout, in which case the browser already holds the
 *      full confirmation -- name, address, the lot -- because `placeOrder`
 *      returned it. Nothing is fetched.
 *   2. Back from Paymob, on a fresh page load with only the order number in
 *      the URL. That is what this function is for, and it is why it returns
 *      no personal data at all: an order number in a browser history, a
 *      shared link or a referrer header must not be enough to learn who
 *      placed the order or where they live.
 *
 * Anyone wanting more than "did the payment go through" is sent to /track,
 * which asks for the mobile number too.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";

import { getServiceClient, toApiError } from "@/lib/supabase/service.server";
import { ApiError } from "@/lib/errors";
import type {
  FulfilmentStatus,
  PaymentMethod,
  PaymentStatus,
  PricedLine,
} from "@/lib/domain/types";

export interface OrderStatus {
  readonly orderNumber: string;
  readonly paymentMethod: PaymentMethod;
  readonly paymentStatus: PaymentStatus;
  readonly fulfilmentStatus: FulfilmentStatus;
  readonly subtotal: number;
  readonly shippingFee: number;
  readonly discount: number;
  readonly total: number;
  readonly placedAt: string;
  readonly lines: readonly PricedLine[];
}

const STATUS_LIMIT = 30;
const STATUS_WINDOW_SECONDS = 600;

export const getOrderStatus = createServerFn({ method: "POST" })
  .inputValidator((input: { orderNumber: string }) => {
    const value = String(input?.orderNumber ?? "")
      .trim()
      .toUpperCase();
    if (!value || value.length > 32) {
      throw new ApiError("invalid_input", "That order number does not look right.");
    }
    return { orderNumber: value };
  })
  .handler(async ({ data }): Promise<OrderStatus | null> => {
    const supabase = getServiceClient();

    // Higher than tracking's limit, because a customer waiting on a payment
    // legitimately refreshes this page; still low enough that it is no use
    // for walking the order-number space.
    const { data: allowed } = await supabase.rpc("tc_check_rate_limit", {
      p_bucket: "order_status",
      p_identifier: getRequestIP({ xForwardedFor: true }) ?? "unknown",
      p_max: STATUS_LIMIT,
      p_window_seconds: STATUS_WINDOW_SECONDS,
    });

    if (allowed === false) {
      throw new ApiError("rate_limited", "Too many lookups. Please wait a few minutes.");
    }

    const { data: order, error } = await supabase.rpc("tc_order_status", {
      p_order_number: data.orderNumber,
    });

    if (error) throw toApiError(error, "getOrderStatus");
    return (order as OrderStatus | null) ?? null;
  });
