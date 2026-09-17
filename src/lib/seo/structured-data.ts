/**
 * Structured data.
 *
 * Only what exists: two products. No BreadcrumbList for a hierarchy the site
 * does not have, no ItemList of collections, no Organization block claiming
 * things about a business that has not supplied them. Marking up pages that
 * do not exist is how a site earns a manual action, and it helps nobody.
 *
 * The canonical domain is a placeholder until one is registered -- see
 * docs/MISSING-INFORMATION.md.
 */
import { piastresToPounds } from "@/lib/domain/money";
import { productContent } from "@/lib/catalog/products";
import type { Product } from "@/lib/domain/types";

/** Replace once a domain is registered. Also update public/robots.txt. */
export const SITE_ORIGIN = "https://REPLACE-WITH-DOMAIN";

export function productJsonLd(product: Product) {
  const content = productContent(product.slug);

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: content.name,
    description: content.description,
    sku: product.slug,
    url: `${SITE_ORIGIN}/product/${product.slug}`,
    image: [`${SITE_ORIGIN}/images/products/${product.slug}/main.jpg`],
    offers: {
      "@type": "Offer",
      priceCurrency: "EGP",
      // Schema.org wants a decimal string; the store works in piastres.
      price: piastresToPounds(product.price).toFixed(2),
      availability:
        product.available > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: `${SITE_ORIGIN}/product/${product.slug}`,
    },
  };
}
