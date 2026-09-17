/**
 * A single cap.
 *
 * The same editorial section the homepage uses, on its own clean URL --
 * /product/taiwan, /product/al-adou -- so a link in a video description or a
 * story points straight at one cap, and so a search result has somewhere
 * specific to land.
 *
 * This is the view that gets the sticky add-to-cart bar on a phone.
 */
import { Link, createFileRoute, notFound } from "@tanstack/react-router";

import { PRODUCT_CONTENT, isProductSlug, productContent } from "@/lib/catalog/products";
import { ProductSection } from "@/components/product-section";
import { Route as RootRoute } from "./__root";
import { SITE_ORIGIN, productJsonLd } from "@/lib/seo/structured-data";
import { SiteFooter } from "@/components/home-sections";
import { UI } from "@/lib/catalog/copy";

export const Route = createFileRoute("/product/$slug")({
  loader: ({ params }) => {
    // A URL for a cap this shop does not sell is a 404, not an empty page.
    if (!isProductSlug(params.slug)) throw notFound();
    return { slug: params.slug };
  },

  head: ({ params }) => {
    if (!isProductSlug(params.slug)) return {};
    const content = productContent(params.slug);
    const title = `${content.name} | Taher Caps`;

    return {
      meta: [
        { title },
        { name: "description", content: content.description },
        { property: "og:title", content: title },
        { property: "og:description", content: content.description },
        { property: "og:type", content: "product" },
        { property: "og:url", content: `${SITE_ORIGIN}/product/${params.slug}` },
        {
          property: "og:image",
          content: `${SITE_ORIGIN}/images/products/${params.slug}/main.jpg`,
        },
      ],
      links: [{ rel: "canonical", href: `${SITE_ORIGIN}/product/${params.slug}` }],
    };
  },

  notFoundComponent: NotFound,
  component: ProductPage,
});

function ProductPage() {
  const { slug } = Route.useLoaderData();
  const { products } = RootRoute.useLoaderData();
  const product = products.find((entry) => entry.slug === slug);

  // Keeps the alternating layout consistent with the homepage: whichever side
  // this cap's photography sits on there, it sits on here too.
  const index = PRODUCT_CONTENT.findIndex((entry) => entry.slug === slug);

  return (
    <>
      <ProductSection slug={slug} product={product} index={index} priority sticky />

      <div className="mx-auto max-w-page px-5 pb-20 md:px-10 lg:px-16">
        <Link
          to="/"
          hash="shop"
          className="control text-muted underline underline-offset-4 transition-colors hover:text-accent"
        >
          {UI.continueShopping}
        </Link>
      </div>

      <SiteFooter />

      {product && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd(product)) }}
        />
      )}
    </>
  );
}

function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-page flex-col items-center justify-center gap-8 px-5 text-center">
      <p dir="rtl" className="phrase text-headline text-ink">
        هذا التصميم غير موجود.
      </p>
      <Link to="/" hash="shop" className="control text-accent underline underline-offset-4">
        {UI.continueShopping}
      </Link>
    </div>
  );
}
