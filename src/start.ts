import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    // Redirects and other framework control-flow throws carry a status code
    // and must pass through untouched.
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    // An ApiError is a message we wrote for the customer; let it through so
    // the form can render it. Anything else becomes the generic page.
    if (error instanceof Error && error.name === "ApiError") {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

/**
 * Start installs CSRF protection automatically when src/start.ts is absent;
 * defining this file opts out, so it is re-added explicitly. It applies to
 * server functions only -- the Paymob webhook is not one, and is mounted in
 * src/server.ts precisely so it never meets this middleware.
 */
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
