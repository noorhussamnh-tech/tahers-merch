/**
 * The service-role Supabase client. SERVER ONLY.
 *
 * This key bypasses row-level security entirely, which is exactly why the
 * functions it calls do their own checking. It exists so that the checkout,
 * the tracking lookup and the Paymob webhook can reach the security-definer
 * functions that no browser role is granted execute on.
 *
 * The `.server.ts` suffix is load-bearing: TanStack Start refuses to bundle a
 * module with that name into the client, so an accidental import from a
 * component is a build error rather than a leaked key.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "@/lib/errors";

export { ApiError };

let cached: SupabaseClient | null = null;

export class ServerNotConfiguredError extends Error {
  constructor(missing: string) {
    super(`${missing} is not set. The server cannot reach Supabase.`);
    this.name = "ServerNotConfiguredError";
  }
}

export function getServiceClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env["VITE_SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  if (!url) throw new ServerNotConfiguredError("VITE_SUPABASE_URL");
  if (!key) throw new ServerNotConfiguredError("SUPABASE_SERVICE_ROLE_KEY");

  cached = createClient(url, key, {
    auth: {
      // A service client is not a user session. Persisting or refreshing one
      // would be meaningless here and would keep state between requests in a
      // serverless runtime that is supposed to be stateless.
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cached;
}

/**
 * A server-side client that holds only the *publishable* key.
 *
 * Used for reading the catalogue during server rendering. It is subject to
 * row-level security exactly as the browser is, so a server-rendered page
 * cannot accidentally show something a visitor could not have fetched for
 * themselves -- an inactive product, say, or a private setting.
 */
let cachedPublic: SupabaseClient | null = null;

export function getPublicServerClient(): SupabaseClient {
  if (cachedPublic) return cachedPublic;

  const url = process.env["VITE_SUPABASE_URL"];
  const key = process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

  if (!url) throw new ServerNotConfiguredError("VITE_SUPABASE_URL");
  if (!key) throw new ServerNotConfiguredError("VITE_SUPABASE_PUBLISHABLE_KEY");

  cachedPublic = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedPublic;
}

/**
 * Maps a Postgres error onto something safe to show.
 *
 * The database raises machine-readable codes (`insufficient_stock:taiwan`);
 * this turns them into a sentence. Anything unrecognised becomes a generic
 * message, and the detail stays in the server log -- an error string from
 * Postgres can carry column names, constraint names and fragments of a query,
 * none of which a customer should be reading.
 */
export function toApiError(error: { message?: string } | null, context: string): ApiError {
  const raw = error?.message ?? "";

  if (raw.includes("insufficient_stock")) {
    return new ApiError(
      "insufficient_stock",
      "Someone else just took the last one. Reduce the quantity and try again.",
    );
  }
  if (raw.includes("product_unavailable")) {
    return new ApiError("product_unavailable", "That cap is no longer available.");
  }
  if (raw.includes("no_shipping_zone")) {
    return new ApiError("no_shipping_zone", "We cannot deliver to that governorate yet.");
  }
  if (raw.includes("cod_unavailable")) {
    return new ApiError(
      "cod_unavailable",
      "Cash on delivery is not available for that governorate. Please pay online.",
    );
  }
  if (raw.includes("empty_cart")) {
    return new ApiError("empty_cart", "Your cart is empty.");
  }
  if (raw.includes("amount_mismatch")) {
    return new ApiError("amount_mismatch", "The payment amount did not match the order total.");
  }
  if (raw.includes("order_not_found")) {
    return new ApiError("order_not_found", "We could not find that order.");
  }
  if (raw.includes("not_authorized")) {
    return new ApiError("not_authorized", "You are not authorized to do that.");
  }
  if (raw.includes("stock_below_reserved")) {
    return new ApiError(
      "stock_below_reserved",
      "Stock cannot be set below the units already reserved for unpaid orders.",
    );
  }

  console.error(`[taher-caps] ${context} failed`, raw);
  return new ApiError("unknown", "Something went wrong. Please try again.");
}
