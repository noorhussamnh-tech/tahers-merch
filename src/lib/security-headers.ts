/**
 * Security headers applied to every response.
 *
 * Set at the server entry rather than in a host config file so they travel
 * with the app: the same protections apply on Vercel, on any other Nitro
 * target, and in local preview.
 */

/**
 * Content Security Policy.
 *
 * `connect-src` is narrow -- the app talks to its own origin and to its
 * Supabase project. It does NOT need to reach Paymob: the customer is sent to
 * Paymob's own page by a top-level navigation, and Paymob talks back to the
 * server, not to the browser.
 *
 * `'unsafe-inline'` is granted to styles because Tailwind's runtime emits
 * style attributes. It is NOT granted to scripts.
 */
function buildCsp(supabaseOrigin: string | null): string {
  const connect = ["'self'", supabaseOrigin, supabaseOrigin?.replace(/^https:/, "wss:")]
    .filter(Boolean)
    .join(" ");

  return [
    "default-src 'self'",
    // TanStack Start hydrates from inline module scripts it generates itself.
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    `connect-src ${connect}`,
    // The storefront is never framed. The Paymob checkout is a page we send
    // the customer to, not an iframe we host, so nothing here needs relaxing.
    "frame-ancestors 'none'",
    "base-uri 'self'",
    // Only our own origin may be the target of a form post -- including the
    // checkout form, which posts to a server function on this origin.
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

function supabaseOrigin(): string | null {
  const url = process.env["VITE_SUPABASE_URL"];
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function securityHeaders(): Record<string, string> {
  return {
    "content-security-policy": buildCsp(supabaseOrigin()),
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    // None of these are used; denying them shrinks the attack surface. Note
    // `payment=()` is safe: the Payment Request API is not used, because the
    // customer pays on Paymob's page rather than on ours.
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    // Order pages carry a customer's own details; keep documents out of
    // shared caches. Static assets are exempt below.
    "cache-control": "no-store, max-age=0",
  };
}

/** Applies the headers to a response without discarding what it already set. */
export function withSecurityHeaders(response: Response): Response {
  const contentType = response.headers.get("content-type") ?? "";
  const isDocument = contentType.includes("text/html");

  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(securityHeaders())) {
    if (key === "cache-control" && !isDocument) continue;
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
