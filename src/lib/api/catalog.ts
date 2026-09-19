/**
 * Reading the shop.
 *
 * Server functions rather than browser fetches, so the homepage and the two
 * product pages arrive already rendered -- which matters for a store whose
 * customers arrive from a link in a video description, on a phone, on mobile
 * data, and for the search engines that have to read the Arabic copy.
 *
 * These read through the publishable key, so row-level security applies here
 * exactly as it would in the browser.
 */
import { createServerFn } from "@tanstack/react-start";

import { getPublicServerClient, toApiError } from "@/lib/supabase/service.server";
import { isProductSlug, type ProductSlug } from "@/lib/catalog/products";
import type { Product, ShippingZone } from "@/lib/domain/types";

interface ProductRow {
  id: string;
  slug: string;
  name_ar: string;
  description_ar: string;
  price_piastres: number;
  stock_quantity: number;
  reserved_quantity: number;
  active: boolean;
  display_order: number;
}

function toProduct(row: ProductRow): Product | null {
  // A row whose slug the storefront does not know about is skipped rather
  // than rendered: the catalogue is fixed at two caps, and a third would have
  // no copy, no photographs and no section to live in.
  if (!isProductSlug(row.slug)) return null;

  return {
    id: row.id,
    slug: row.slug as ProductSlug,
    name: row.name_ar,
    description: row.description_ar,
    price: row.price_piastres,
    available: Math.max(row.stock_quantity - row.reserved_quantity, 0),
    active: row.active,
    displayOrder: row.display_order,
  };
}

interface ZoneRow {
  governorate: string;
  fee_piastres: number;
  cod_available: boolean;
  min_days: number | null;
  max_days: number | null;
}

function toZone(row: ZoneRow): ShippingZone {
  return {
    governorate: row.governorate,
    fee: row.fee_piastres,
    codAvailable: row.cod_available,
    minDays: row.min_days,
    maxDays: row.max_days,
  };
}

export interface Catalog {
  readonly products: readonly Product[];
  /**
   * False when Supabase is not configured at all. The storefront still
   * renders -- the copy and photography are static -- but the buy controls
   * say so instead of failing silently.
   */
  readonly configured: boolean;
}

export const loadCatalog = createServerFn({ method: "GET" }).handler(async (): Promise<Catalog> => {
  let supabase;
  try {
    supabase = getPublicServerClient();
  } catch {
    return { products: [], configured: false };
  }

  const { data, error } = await supabase
    .from("tc_products")
    .select(
      "id, slug, name_ar, description_ar, price_piastres, stock_quantity, reserved_quantity, active, display_order",
    )
    .order("display_order");

  if (error) throw toApiError(error, "loadCatalog");

  const products = ((data ?? []) as ProductRow[])
    .map(toProduct)
    .filter((p): p is Product => p !== null);

  return { products, configured: true };
});

export const loadShippingZones = createServerFn({ method: "GET" }).handler(
  async (): Promise<readonly ShippingZone[]> => {
    let supabase;
    try {
      supabase = getPublicServerClient();
    } catch {
      return [];
    }

    const { data, error } = await supabase
      .from("tc_shipping_zones")
      .select("governorate, fee_piastres, cod_available, min_days, max_days")
      .order("governorate");

    if (error) throw toApiError(error, "loadShippingZones");
    return ((data ?? []) as ZoneRow[]).map(toZone);
  },
);

/**
 * The account an Instapay customer transfers to.
 *
 * Null means Instapay is switched off, and that is the only switch there is:
 * the checkout hides the option, so nobody is ever offered a payment method
 * with nowhere to send the money. Filling the setting in turns it on, with no
 * deployment — which matters, because a wrong account number is the one thing
 * here that loses real money and it has to be fixable in seconds.
 *
 * Read through the publishable key like everything else in this file. The row
 * is marked public in tc_store_settings because a payment handle is meant to
 * be given out; that is a deliberate flag on one row, not a default.
 */
export interface InstapayAccount {
  /** The Instapay address or mobile number to transfer to. */
  readonly handle: string;
  /** The account holder's name, so a customer can check before sending. */
  readonly name: string;
}

export const loadInstapayAccount = createServerFn({ method: "GET" }).handler(
  async (): Promise<InstapayAccount | null> => {
    let supabase;
    try {
      supabase = getPublicServerClient();
    } catch {
      return null;
    }

    const { data, error } = await supabase
      .from("tc_store_settings")
      .select("value")
      .eq("key", "instapay_account")
      .maybeSingle();

    // A missing row is "not set up", not a failure. The shop keeps selling
    // for cash.
    if (error || !data) return null;

    const value = (data as { value: unknown }).value as Partial<InstapayAccount> | null;
    const handle = value?.handle?.trim() ?? "";
    const name = value?.name?.trim() ?? "";

    // No handle, no option. A name on its own is not somewhere to send money.
    if (!handle) return null;

    return { handle, name };
  },
);
