/**
 * The homepage: hero, the two caps, about, FAQ.
 *
 * One page, because there is one thing to say. The two products each get a
 * full editorial section rather than a grid cell, and they alternate which
 * side the photography sits on.
 */
import { createFileRoute } from "@tanstack/react-router";

import {
  AboutSection,
  FaqSection,
  Hero,
  ShopHeading,
  SiteFooter,
} from "@/components/home-sections";
import { PRODUCT_CONTENT } from "@/lib/catalog/products";
import { ProductSection } from "@/components/product-section";
import { Route as RootRoute } from "./__root";
import { productJsonLd } from "@/lib/seo/structured-data";

export const Route = createFileRoute("/")({
  head: () => ({
    links: [{ rel: "canonical", href: "https://REPLACE-WITH-DOMAIN/" }],
  }),
  component: HomePage,
});

function HomePage() {
  const { products, configured } = RootRoute.useLoaderData();

  return (
    <>
      <Hero />

      <section id="shop" className="scroll-mt-28">
        <ShopHeading />

        {PRODUCT_CONTENT.map((content, index) => (
          <ProductSection
            key={content.slug}
            slug={content.slug}
            product={products.find((product) => product.slug === content.slug)}
            index={index}
            // The first product's photography is near the top of the page on
            // a phone; the second can wait until it is scrolled to.
            priority={index === 0}
          />
        ))}
      </section>

      <AboutSection />
      <FaqSection />
      <SiteFooter />

      {!configured && <SetupNotice />}

      {/* Structured data for the two products, so a search result can show a
          price and whether the cap is in stock. Emitted only for products the
          database actually returned -- never invented. */}
      {products.map((product) => (
        <script
          key={product.slug}
          type="application/ld+json"
          // The payload is built from our own data, not from user input.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd(product)) }}
        />
      ))}
    </>
  );
}

/**
 * Shown when the app is running without Supabase credentials.
 *
 * The storefront still renders -- the copy and the photography are static --
 * so this says plainly why nothing can be bought, rather than leaving a
 * developer to wonder why both caps read as unavailable.
 */
function SetupNotice() {
  return (
    <div className="fixed bottom-4 left-4 z-30 max-w-sm border border-line bg-paper p-4">
      <p className="eyebrow">Setup</p>
      <p className="mt-2 font-sans text-sm text-muted">
        Supabase is not configured, so prices and stock cannot be loaded. Set VITE_SUPABASE_URL and
        VITE_SUPABASE_PUBLISHABLE_KEY.
      </p>
    </div>
  );
}
