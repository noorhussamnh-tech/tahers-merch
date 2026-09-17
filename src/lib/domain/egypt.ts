/**
 * Egypt-specific address and phone rules.
 *
 * The governorate list is the canonical set of destination keys: a shipping
 * zone row, a delivery address and a checkout dropdown all use the same
 * spelling from here, so a fee can never fail to match a destination because
 * one of them said "Qalyubia" and the other "Qaliubiya".
 */

export const GOVERNORATES = [
  "Cairo",
  "Giza",
  "Alexandria",
  "Dakahlia",
  "Red Sea",
  "Beheira",
  "Fayoum",
  "Gharbia",
  "Ismailia",
  "Menofia",
  "Minya",
  "Qalyubia",
  "New Valley",
  "Suez",
  "Aswan",
  "Assiut",
  "Beni Suef",
  "Port Said",
  "Damietta",
  "Sharqia",
  "South Sinai",
  "Kafr El Sheikh",
  "Matrouh",
  "Luxor",
  "Qena",
  "North Sinai",
  "Sohag",
] as const;

export type Governorate = (typeof GOVERNORATES)[number];

export function isGovernorate(value: string): value is Governorate {
  return (GOVERNORATES as readonly string[]).includes(value);
}

/**
 * Normalises an Egyptian mobile number to local 11-digit form (01XXXXXXXXX).
 *
 * Accepts what customers actually type: +20 or 0020 prefixes, a leading zero
 * or not, and spaces, dashes or parentheses anywhere. Arabic-Indic digits are
 * folded to Western ones, because an Arabic keyboard produces them by default
 * and a customer should not have to know that the form wants ASCII.
 *
 * Returns null when the result is not a valid Egyptian mobile number, which
 * the caller surfaces as a field error rather than guessing.
 */
export function normalizeEgyptianMobile(input: string): string | null {
  const folded = foldArabicDigits(input);
  const digitsOnly = folded.replace(/[^\d+]/g, "");

  let local = digitsOnly;
  if (local.startsWith("+20")) local = local.slice(3);
  else if (local.startsWith("0020")) local = local.slice(4);
  else if (local.startsWith("20") && local.length === 12) local = local.slice(2);

  // At this point we expect either 1XXXXXXXXX (10) or 01XXXXXXXXX (11).
  if (local.length === 10 && local.startsWith("1")) local = `0${local}`;

  return isEgyptianMobile(local) ? local : null;
}

/** Vodafone 010, Etisalat 011, Orange 012, WE 015. */
const MOBILE_PATTERN = /^01[0125]\d{8}$/;

export function isEgyptianMobile(value: string): boolean {
  return MOBILE_PATTERN.test(value);
}

/** Converts Arabic-Indic (٠-٩) and Eastern Arabic-Indic (۰-۹) digits to ASCII. */
export function foldArabicDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (char) => {
    const code = char.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

/**
 * The last four digits, for showing a customer which number an order is
 * attached to without printing the whole thing back at them.
 */
export function maskMobile(mobile: string): string {
  return mobile.length <= 4 ? mobile : `${"•".repeat(mobile.length - 4)}${mobile.slice(-4)}`;
}
