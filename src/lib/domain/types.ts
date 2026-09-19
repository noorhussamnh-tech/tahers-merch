/**
 * Shared domain types.
 *
 * These mirror the database columns but use the app's naming and its own
 * unions, so a schema change surfaces as a type error in the mapper rather
 * than as a silently wrong string deep in a component.
 */
import type { Piastres } from "./money";
import type { ProductSlug } from "@/lib/catalog/products";

/** How the customer chose to pay. */
/**
 * How an order is paid for.
 *
 * "instapay" is a bank transfer the customer makes themselves and somebody
 * verifies by hand -- there is no callback, so it behaves like cash on
 * delivery for stock and like an online order for money: placed unpaid, and
 * never shipped until an administrator confirms the transfer arrived.
 */
export type PaymentMethod = "paymob" | "cod" | "instapay";

/**
 * Payment state.
 *
 * `pending` covers both "not attempted yet" (cash on delivery, before the
 * courier collects) and "started but unconfirmed" (an online payment whose
 * webhook has not arrived). The browser returning from Paymob never sets
 * `paid` -- only a verified webhook does.
 */
export type PaymentStatus = "pending" | "paid" | "failed" | "cancelled" | "refunded";

/** Where the order is in fulfilment. Admin moves it along this list. */
export type FulfilmentStatus =
  "placed" | "confirmed" | "packed" | "shipped" | "delivered" | "cancelled";

export const FULFILMENT_FLOW: readonly FulfilmentStatus[] = [
  "placed",
  "confirmed",
  "packed",
  "shipped",
  "delivered",
] as const;

/** A product as the storefront sees it: catalogue copy plus live commerce. */
export interface Product {
  readonly id: string;
  readonly slug: ProductSlug;
  readonly name: string;
  readonly description: string;
  readonly price: Piastres;
  /** Units a customer can still buy: stock minus anything reserved. */
  readonly available: number;
  readonly active: boolean;
  readonly displayOrder: number;
}

export interface CartLine {
  readonly slug: ProductSlug;
  readonly quantity: number;
}

/** A cart line priced against the server's current catalogue. */
export interface PricedLine {
  readonly slug: ProductSlug;
  readonly name: string;
  readonly quantity: number;
  readonly unitPrice: Piastres;
  readonly lineTotal: Piastres;
}

export interface DeliveryAddress {
  readonly governorate: string;
  readonly city: string;
  readonly street: string;
  readonly building: string;
  readonly floor: string;
  readonly apartment: string;
  readonly notes?: string;
}

export interface Customer {
  readonly fullName: string;
  readonly mobile: string;
  readonly email?: string;
}

/** A shipping destination and what it costs to reach it. */
export interface ShippingZone {
  readonly governorate: string;
  readonly fee: Piastres;
  readonly codAvailable: boolean;
  readonly minDays: number | null;
  readonly maxDays: number | null;
}

/** What the confirmation page is given after a successful checkout. */
export interface PlacedOrder {
  readonly orderNumber: string;
  readonly paymentMethod: PaymentMethod;
  readonly paymentStatus: PaymentStatus;
  readonly fulfilmentStatus: FulfilmentStatus;
  readonly lines: readonly PricedLine[];
  readonly subtotal: Piastres;
  readonly shippingFee: Piastres;
  readonly discount: Piastres;
  readonly total: Piastres;
  readonly address: DeliveryAddress;
  readonly customerName: string;
  /** Present only when the order needs the customer sent to Paymob. */
  readonly checkoutUrl?: string;
}

/** One step in the public tracking timeline. */
export interface StatusEvent {
  readonly status: FulfilmentStatus;
  readonly at: string;
}

/**
 * What order tracking is allowed to return.
 *
 * Deliberately narrow: no database id, no email, no street address, no
 * internal notes. A tracking page that knows the order number and the mobile
 * number should learn where the parcel is, and nothing else about the
 * customer record behind it.
 */
export interface TrackedOrder {
  readonly orderNumber: string;
  readonly paymentStatus: PaymentStatus;
  readonly fulfilmentStatus: FulfilmentStatus;
  readonly placedAt: string;
  readonly lines: readonly { name: string; quantity: number }[];
  readonly total: Piastres;
  readonly timeline: readonly StatusEvent[];
  readonly governorate: string;
  readonly expectedMinDays: number | null;
  readonly expectedMaxDays: number | null;
}
