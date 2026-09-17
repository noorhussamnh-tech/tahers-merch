/**
 * Order tracking. SERVER ONLY.
 *
 * The lookup itself is the database's `tc_track_order`, which returns a
 * deliberately narrow projection and requires both the order number and the
 * mobile number it was placed with. This wrapper adds the thing SQL cannot
 * do for itself: a rate limit, so the pair cannot be guessed at scale.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";

import { getServiceClient, toApiError } from "@/lib/supabase/service.server";
import { ApiError } from "@/lib/errors";
import { trackingSchema } from "@/lib/domain/validation";
import type { TrackedOrder } from "@/lib/domain/types";

/**
 * Tighter than checkout, because this is the endpoint somebody would point a
 * script at. Ten wrong guesses in ten minutes is far more than a customer
 * re-reading a number off a screen needs, and far fewer than a search of the
 * order-number space would take -- which at 32^8 combinations would need
 * longer than the shop will exist.
 */
const TRACK_LIMIT = 10;
const TRACK_WINDOW_SECONDS = 600;

export const trackOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const parsed = trackingSchema.safeParse(input);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new ApiError("invalid_input", first?.message ?? "Check the details and try again.");
    }
    return parsed.data;
  })
  .handler(async ({ data }): Promise<TrackedOrder | null> => {
    const supabase = getServiceClient();
    const identifier = getRequestIP({ xForwardedFor: true }) ?? "unknown";

    const { data: allowed, error: limitError } = await supabase.rpc("tc_check_rate_limit", {
      p_bucket: "track",
      p_identifier: identifier,
      p_max: TRACK_LIMIT,
      p_window_seconds: TRACK_WINDOW_SECONDS,
    });

    if (limitError) {
      console.error("[taher-caps] tracking rate limit failed", limitError.message);
    } else if (allowed === false) {
      throw new ApiError(
        "rate_limited",
        "Too many lookups. Please wait a few minutes and try again.",
      );
    }

    const { data: order, error } = await supabase.rpc("tc_track_order", {
      p_order_number: data.orderNumber,
      p_mobile: data.mobile,
    });

    if (error) throw toApiError(error, "trackOrder");

    // Null covers both "no such order" and "wrong mobile number", and the
    // caller renders one message for both. Telling them apart would confirm
    // that an order number exists to somebody guessing at them.
    return (order as TrackedOrder | null) ?? null;
  });
