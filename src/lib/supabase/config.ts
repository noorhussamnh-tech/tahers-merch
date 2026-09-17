/**
 * Supabase connection settings for the browser.
 *
 * Both values are public by design: they are compiled into the client bundle,
 * and every table they can reach is guarded by row-level security. The service
 * role key is deliberately absent from this file so it cannot be imported from
 * client code even by accident -- it lives in `service.server.ts`, which the
 * bundler will not follow into the browser.
 */

const url = import.meta.env["VITE_SUPABASE_URL"];
const publishableKey = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

export const SUPABASE_CONFIGURED = Boolean(url && publishableKey);

export const SUPABASE_URL = url ?? "";
export const SUPABASE_PUBLISHABLE_KEY = publishableKey ?? "";

/** Public origin of the site, used to build absolute URLs for Paymob. */
export function siteUrl(): string {
  if (typeof window !== "undefined") return window.location.origin;
  const configured = import.meta.env["VITE_SITE_URL"] ?? "http://localhost:8080";
  return configured.replace(/\/$/, "");
}
