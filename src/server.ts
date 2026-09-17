/**
 * The server entry.
 *
 * Two jobs beyond handing requests to TanStack Start:
 *
 *   1. Mount the Paymob webhook. It is mounted here rather than as a route
 *      because it is not a page and must not go through the server-function
 *      RPC layer or its CSRF middleware -- a payment gateway posting
 *      server-to-server carries no cookie and no CSRF token, and correctly so.
 *   2. Apply the security headers to everything, including responses that
 *      failed.
 */
import { handlePaymobWebhook } from "./lib/paymob/webhook.server";
import { renderErrorPage } from "./lib/error-page";
import { withSecurityHeaders } from "./lib/security-headers";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

/** The path Paymob is told to notify. Changing it means changing the dashboard. */
const WEBHOOK_PATH = "/api/paymob/webhook";

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);

      if (url.pathname === WEBHOOK_PATH) {
        if (request.method !== "POST") {
          return withSecurityHeaders(
            new Response(JSON.stringify({ error: "method_not_allowed" }), {
              status: 405,
              headers: { "content-type": "application/json", allow: "POST" },
            }),
          );
        }

        // Caught here rather than falling through to the page-level handler
        // below: a payment gateway is not a browser, and answering it with an
        // HTML error page gives whoever reads the gateway's delivery log
        // nothing to work with. A 500 is right -- a failure here is usually
        // transient or a missing environment variable, and Paymob retrying is
        // what we want -- but it has to be a 500 it can parse.
        try {
          return withSecurityHeaders(await handlePaymobWebhook(request));
        } catch (error) {
          console.error("[taher-caps] Paymob webhook threw", error);
          return withSecurityHeaders(
            new Response(JSON.stringify({ error: "webhook_failed" }), {
              status: 500,
              headers: { "content-type": "application/json" },
            }),
          );
        }
      }

      const handler = await getServerEntry();
      return withSecurityHeaders(await handler.fetch(request, env, ctx));
    } catch (error) {
      // Nothing about the failure reaches the customer; it goes to the log.
      console.error(error);
      return withSecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },
};
