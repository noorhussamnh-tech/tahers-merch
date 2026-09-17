/**
 * The document shell.
 *
 * Holds the fonts, the base SEO tags, the cart provider and the header and
 * cart that every page shares.
 *
 * The page's own `lang`/`dir` is `en`/`ltr`, not Arabic, and that is
 * deliberate: the navigation, the buttons and the whole checkout are English,
 * and each Arabic block declares `dir="rtl"` for itself. Setting the document
 * to RTL would flip the form layouts and the English controls with it.
 */
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { Toaster } from "sonner";

import { CartDrawer } from "@/components/cart-drawer";
import { CartProvider } from "@/lib/cart/store";
import { SiteHeader } from "@/components/site-header";
import { loadCatalog } from "@/lib/api/catalog";
import appCss from "@/styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#F4EFE6" },
      // The default title and description are Arabic: the shop's audience
      // reads Arabic, and this is what a share card shows.
      { title: "كابات طاهر | Taher Caps" },
      {
        name: "description",
        content: "تصميمان من أشهر عبارات طاهر، متاحان بكمية محدودة.",
      },
      { property: "og:site_name", content: "Taher Caps" },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "ar_EG" },
      { property: "og:title", content: "كابات طاهر | Taher Caps" },
      {
        property: "og:description",
        content: "تصميمان من أشهر عبارات طاهر، متاحان بكمية محدودة.",
      },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      // Preconnect before the stylesheet request goes out, so the font files
      // are not waiting on a fresh TLS handshake on a slow mobile connection.
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        // Three families, only the weights actually used, `display=swap` so
        // the Arabic renders in a fallback rather than not at all while the
        // serif loads.
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=IBM+Plex+Sans+Arabic:wght@400;500;600&family=Noto+Serif+Arabic:wght@400;500;600&display=swap",
      },
    ],
  }),

  // Loaded once at the root so the header's cart, the cart drawer and the
  // homepage all price from the same fetch.
  loader: () => loadCatalog(),

  component: RootDocument,
});

function RootDocument() {
  const { products } = Route.useLoaderData();

  return (
    <html lang="en" dir="ltr">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-cream font-sans text-ink antialiased">
        <CartProvider>
          <a
            href="#main"
            className="sr-only-focusable focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-accent focus:px-4 focus:py-2 focus:text-paper"
          >
            Skip to content
          </a>

          <SiteHeader />
          <main id="main">
            <Outlet />
          </main>
          <CartDrawer products={products} />
        </CartProvider>

        <Toaster
          position="bottom-center"
          toastOptions={{
            style: {
              background: "#FFFDF8",
              color: "#17130F",
              border: "1px solid #CFC6B9",
              borderRadius: "0",
              fontFamily: "'IBM Plex Sans Arabic', sans-serif",
            },
          }}
        />
        <Scripts />
      </body>
    </html>
  );
}
