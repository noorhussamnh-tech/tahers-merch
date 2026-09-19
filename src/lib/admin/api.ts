/**
 * Administration.
 *
 * These calls go straight from the browser to Postgres with the signed-in
 * administrator's own token -- no server function in between. That is not a
 * shortcut: every function called here re-derives the caller from their JWT
 * and raises `not_authorized` if they are not on the admin list, and the
 * tables underneath are guarded by row-level security besides. Putting a
 * server function in front would add a hop and nothing else, and it would
 * tempt somebody into using the service-role key where the user's own token
 * is the whole point.
 */
import { requireSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ApiError } from "@/lib/errors";
import type { FulfilmentStatus, PaymentMethod, PaymentStatus } from "@/lib/domain/types";

export interface AdminProduct {
  readonly slug: string;
  readonly name: string;
  readonly price: number;
  readonly stock: number;
  readonly reserved: number;
  readonly available: number;
  readonly active: boolean;
}

export interface AdminOrder {
  readonly orderNumber: string;
  readonly customerName: string;
  readonly customerMobile: string;
  readonly customerEmail: string | null;
  readonly address: Record<string, string>;
  readonly paymentMethod: PaymentMethod;
  readonly paymentStatus: PaymentStatus;
  readonly fulfilmentStatus: FulfilmentStatus;
  readonly subtotal: number;
  readonly shippingFee: number;
  readonly discount: number;
  readonly total: number;
  readonly paymobOrderId: string | null;
  readonly paymobTransactionId: string | null;
  /**
   * What the administrator who confirmed an Instapay transfer matched it
   * against. Null on every other kind of order, and on a transfer nobody has
   * confirmed yet -- which is exactly the state that must not be shipped.
   */
  readonly paymentReference: string | null;
  readonly placedAt: string;
  readonly lines: readonly {
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
}

export interface AdminZone {
  readonly governorate: string;
  readonly fee: number;
  readonly codAvailable: boolean;
  readonly minDays: number | null;
  readonly maxDays: number | null;
}

function fail(error: { message?: string } | null, context: string): never {
  const raw = error?.message ?? "";
  if (raw.includes("not_authorized")) {
    throw new ApiError("not_authorized", "You are not authorized to do that.");
  }
  if (raw.includes("stock_below_reserved")) {
    throw new ApiError(
      "stock_below_reserved",
      "Stock cannot go below the units already reserved for unpaid orders.",
    );
  }
  if (raw.includes("order_not_found")) {
    throw new ApiError("order_not_found", "That order no longer exists.");
  }
  console.error(`[taher-caps] admin ${context} failed`, raw);
  throw new ApiError("unknown", "Something went wrong. Please try again.");
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const supabase = requireSupabaseBrowserClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) fail(error, fn);
  return data as T;
}

export async function isAdmin(): Promise<boolean> {
  const supabase = requireSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("tc_is_admin");
  // A signed-out caller gets an error rather than false; either way they are
  // not an administrator.
  if (error) return false;
  return data === true;
}

export function listProducts(): Promise<AdminProduct[]> {
  return rpc<AdminProduct[]>("tc_admin_products");
}

export function listOrders(search?: string): Promise<AdminOrder[]> {
  return rpc<AdminOrder[]>("tc_admin_orders", { p_search: search?.trim() || null });
}

export function updateProduct(input: {
  slug: string;
  price?: number | undefined;
  stock?: number | undefined;
  active?: boolean | undefined;
}): Promise<unknown> {
  return rpc("tc_admin_update_product", {
    p_slug: input.slug,
    // Undefined becomes null, which the function reads as "leave this alone".
    p_price: input.price ?? null,
    p_stock: input.stock ?? null,
    p_active: input.active ?? null,
  });
}

export function updateFulfilment(
  orderNumber: string,
  status: FulfilmentStatus,
  note?: string,
): Promise<unknown> {
  return rpc("tc_admin_update_fulfilment", {
    p_order_number: orderNumber,
    p_status: status,
    p_note: note?.trim() || null,
  });
}

/**
 * Records that an Instapay transfer arrived.
 *
 * The reference is optional but worth insisting on in practice: it is the
 * only trace of why somebody believed the money was there, and the question
 * "are we sure this one paid?" gets asked after the cap has shipped, not
 * before.
 *
 * Idempotent in the database, so two people confirming the same order on
 * launch day is harmless rather than a double-payment bug.
 */
export function confirmTransfer(orderNumber: string, reference?: string): Promise<unknown> {
  return rpc("tc_admin_confirm_transfer", {
    p_order_number: orderNumber,
    p_reference: reference?.trim() || null,
  });
}

export async function listZones(): Promise<AdminZone[]> {
  const supabase = requireSupabaseBrowserClient();
  // Shipping zones are publicly readable, so this is a plain select.
  const { data, error } = await supabase
    .from("tc_shipping_zones")
    .select("governorate, fee_piastres, cod_available, min_days, max_days")
    .order("governorate");

  if (error) fail(error, "listZones");

  return (data ?? []).map((row) => ({
    governorate: row["governorate"] as string,
    fee: row["fee_piastres"] as number,
    codAvailable: row["cod_available"] as boolean,
    minDays: row["min_days"] as number | null,
    maxDays: row["max_days"] as number | null,
  }));
}

export function updateZone(zone: AdminZone): Promise<unknown> {
  return rpc("tc_admin_update_shipping_zone", {
    p_governorate: zone.governorate,
    p_fee: zone.fee,
    p_cod_available: zone.codAvailable,
    p_min_days: zone.minDays,
    p_max_days: zone.maxDays,
  });
}
