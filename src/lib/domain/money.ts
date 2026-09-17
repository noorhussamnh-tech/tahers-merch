/**
 * Money.
 *
 * Every amount in this codebase is an integer number of piastres, never a
 * float of pounds. Two reasons, and both of them bite in production:
 *
 *   1. 0.1 + 0.2 !== 0.3. A cart that adds three items and a shipping fee in
 *      floats can disagree with the database about the total by a piastre,
 *      and a payment gateway will reject the mismatch rather than round it.
 *   2. Paymob's intention API takes `amount_cents` as an integer anyway, so
 *      piastres is the representation we would have to convert to regardless.
 *
 * The only place pounds appear is in formatting for a human.
 */

/** 1 EGP = 100 piastres. */
export const PIASTRES_PER_POUND = 100;

/** A branded integer so a raw pound figure cannot be passed by accident. */
export type Piastres = number;

export function poundsToPiastres(pounds: number): Piastres {
  return Math.round(pounds * PIASTRES_PER_POUND);
}

export function piastresToPounds(piastres: Piastres): number {
  return piastres / PIASTRES_PER_POUND;
}

/**
 * Rejects anything that is not a whole, non-negative, finite piastre amount.
 * Used at every boundary where an amount arrives from outside this module --
 * the database, a form, or a webhook.
 */
export function isValidPiastres(value: unknown): value is Piastres {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function assertPiastres(value: unknown, what: string): Piastres {
  if (!isValidPiastres(value)) {
    throw new Error(`${what} must be a whole non-negative piastre amount, received ${value}`);
  }
  return value;
}

/**
 * Formats an amount for display, in Arabic-Egypt locale with Western digits.
 *
 * `numberingSystem: latn` is deliberate: the storefront's Arabic copy is
 * editorial, but a price is a figure a customer will compare against a bank
 * app and a delivery receipt, both of which show Western digits in Egypt.
 */
export function formatEGP(piastres: Piastres): string {
  const pounds = piastresToPounds(piastres);
  // Whole pounds print without decimals; anything else keeps its two places,
  // so a 750 EGP cap does not read as "750.00 EGP".
  const hasFraction = piastres % PIASTRES_PER_POUND !== 0;
  const formatted = new Intl.NumberFormat("ar-EG-u-nu-latn", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(pounds);
  return `${formatted} EGP`;
}

/** Multiplies a unit price by a quantity, staying in integers throughout. */
export function lineTotal(unitPrice: Piastres, quantity: number): Piastres {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new Error(`Quantity must be a whole non-negative number, received ${quantity}`);
  }
  return assertPiastres(unitPrice, "Unit price") * quantity;
}

export function sum(amounts: readonly Piastres[]): Piastres {
  return amounts.reduce<Piastres>((total, amount) => total + assertPiastres(amount, "Amount"), 0);
}
