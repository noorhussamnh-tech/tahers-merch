/**
 * Input validation.
 *
 * Every schema here runs on the server, inside the checkout and tracking
 * server functions, before anything touches the database. The same schemas
 * run in the browser to render field errors early -- but the browser copy is
 * a convenience, not the guard. A request that skips the form entirely meets
 * exactly these rules.
 *
 * Note what the checkout schema does NOT accept: no price, no subtotal, no
 * total. The browser says which products and how many; the server decides
 * what that costs.
 */
import { z } from "zod";

import { GOVERNORATES, normalizeEgyptianMobile } from "./egypt";
import { PRODUCT_SLUGS } from "@/lib/catalog/products";

/** Nobody needs more than this many of a limited-run cap, and it caps abuse. */
export const MAX_QUANTITY_PER_LINE = 5;

const trimmed = (max: number) => z.string().trim().max(max);

/**
 * Mobile number: validated by normalising it. The schema outputs the
 * canonical 01XXXXXXXXX form, so everything downstream -- the order record,
 * the tracking lookup, the Paymob billing payload -- stores one spelling.
 */
export const mobileSchema = z
  .string()
  .trim()
  .min(1, "Mobile number is required.")
  .transform((value, ctx) => {
    const normalized = normalizeEgyptianMobile(value);
    if (!normalized) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid Egyptian mobile number, for example 01012345678.",
      });
      return z.NEVER;
    }
    return normalized;
  });

export const cartLineSchema = z.object({
  slug: z.enum(PRODUCT_SLUGS),
  quantity: z.number().int().min(1).max(MAX_QUANTITY_PER_LINE),
});

export const deliveryAddressSchema = z.object({
  governorate: z.enum(GOVERNORATES, {
    errorMap: () => ({ message: "Select a governorate." }),
  }),
  city: trimmed(120).min(1, "City or area is required."),
  street: trimmed(240).min(1, "Street address is required."),
  building: trimmed(60).min(1, "Building is required."),
  floor: trimmed(60).min(1, "Floor is required."),
  apartment: trimmed(60).min(1, "Apartment is required."),
  notes: trimmed(500).optional(),
});

export const customerSchema = z.object({
  fullName: trimmed(120).min(2, "Enter the full name for delivery."),
  mobile: mobileSchema,
  // Optional by the brief. An empty string is treated as absent rather than
  // as an invalid address, because a browser submits "" for an untouched field.
  email: z
    .union([z.literal(""), z.string().trim().email("Enter a valid email address.").max(200)])
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
});

export const checkoutSchema = z.object({
  items: z.array(cartLineSchema).min(1, "Your cart is empty.").max(PRODUCT_SLUGS.length),
  customer: customerSchema,
  address: deliveryAddressSchema,
  paymentMethod: z.enum(["paymob", "cod", "instapay"]),
  discountCode: trimmed(40).optional(),
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: "You must accept the terms to place an order." }),
  }),
  /**
   * Client-supplied idempotency key. Two submissions carrying the same key
   * produce one order, which is what stops a double-click or a retried
   * request from reserving the last cap twice.
   */
  idempotencyKey: z.string().uuid(),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

/** Order tracking needs both halves, and neither one alone is enough. */
export const trackingSchema = z.object({
  orderNumber: z
    .string()
    .trim()
    .min(1, "Enter your order number.")
    .max(32)
    // Case-insensitive: order numbers are printed uppercase but customers
    // retype them in whatever case their keyboard is in.
    .transform((value) => value.toUpperCase()),
  mobile: mobileSchema,
});

export type TrackingInput = z.infer<typeof trackingSchema>;

/** Admin edits. Price arrives in piastres so no float ever reaches the row. */
export const productUpdateSchema = z.object({
  slug: z.enum(PRODUCT_SLUGS),
  price: z.number().int().min(0).max(100_000_00).optional(),
  stockQuantity: z.number().int().min(0).max(100_000).optional(),
  active: z.boolean().optional(),
});

export const shippingZoneUpdateSchema = z.object({
  governorate: z.enum(GOVERNORATES),
  fee: z.number().int().min(0).max(10_000_00),
  codAvailable: z.boolean(),
  minDays: z.number().int().min(0).max(60).nullable(),
  maxDays: z.number().int().min(0).max(60).nullable(),
});

export const fulfilmentUpdateSchema = z.object({
  orderNumber: z.string().trim().min(1).max(32),
  status: z.enum(["placed", "confirmed", "packed", "shipped", "delivered", "cancelled"]),
  note: trimmed(500).optional(),
});

/**
 * Formats a ZodError as a field -> message map the forms can render directly.
 * Nested paths are joined with a dot, matching the input `name` attributes.
 */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    // First issue per field wins: showing three messages under one input is
    // noise, and the first is the one the customer hits first.
    if (!(key in result)) result[key] = issue.message;
  }
  return result;
}
