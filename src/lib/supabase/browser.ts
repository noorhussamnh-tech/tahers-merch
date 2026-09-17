/**
 * The browser Supabase client.
 *
 * Sessions live in cookies rather than localStorage so the server can read
 * them during SSR and so a cross-site script cannot lift the token out of
 * storage. Created lazily and cached: two clients in one tab fight over token
 * refresh.
 *
 * This client is used for exactly two things -- reading the public catalogue,
 * and signing an administrator in. Everything to do with an order goes through
 * a server function instead.
 */
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SUPABASE_CONFIGURED, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config";

let cached: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!SUPABASE_CONFIGURED) return null;
  if (!cached) {
    cached = createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { flowType: "pkce" },
    });
  }
  return cached;
}

/**
 * Thrown when the app is running without Supabase credentials. Surfaced as a
 * setup message rather than a crash, so a misconfigured deploy is diagnosable
 * from the page rather than only from the logs.
 */
export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
    this.name = "SupabaseNotConfiguredError";
  }
}

export function requireSupabaseBrowserClient(): SupabaseClient {
  const client = getSupabaseBrowserClient();
  if (!client) throw new SupabaseNotConfiguredError();
  return client;
}
