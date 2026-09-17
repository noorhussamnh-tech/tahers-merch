/**
 * The homepage's editorial sections: hero, about, FAQ, footer.
 *
 * The Arabic in here is fixed by the brief and comes from `copy.ts`. Nothing
 * in this file may invent a line, a tagline, or a phrase attributed to Taher.
 *
 * RTL is applied per section rather than to the page, so English navigation
 * and English buttons keep their direction while the editorial copy reads
 * right to left around them.
 */
import { ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { ABOUT, BRAND, FAQ, HERO, SHOP, UI } from "@/lib/catalog/copy";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/product-image";
import { PRODUCT_CONTENT, mainImage, productContent } from "@/lib/catalog/products";

/**
 * The hero: text on the left, photograph on the right, roughly 40/60, filling
 * the screen below the header.
 *
 * On a phone it stacks, and the photograph comes first -- somebody arriving
 * from a link should see the cap before they read about it.
 */
export function Hero() {
  /*
   * The burgundy cap leads, because its photograph is the one that exists.
   * The design's own hero used the green cap, but that file did not survive
   * the export -- it came through as a Lovable asset pointer whose target is
   * gone -- and a hero built on a "photo pending" panel is worse than a hero
   * built on the other cap. Swap this back to "taiwan" when that photograph
   * is supplied.
   */
  const heroSlug = "al-adou" as const;
  const image = mainImage(heroSlug);

  return (
    <section className="px-5 pb-12 pt-10 sm:px-8 lg:pb-20">
      <div className="mx-auto grid max-w-page items-center gap-10 lg:grid-cols-[0.82fr_1.18fr]">
        {/* Text panel. RTL, right-aligned, and second on a desktop so the
            photograph leads -- but first in the source on a phone would put
            the words above the cap, so the order is flipped there. */}
        <div lang="ar" dir="rtl" className="order-2 text-right lg:order-1">
          <p className="eyebrow-ar">{HERO.label}</p>

          <h1 className="phrase mt-4 font-arabic text-display font-semibold">{HERO.headline}</h1>

          <p className="mt-5 font-arabic text-lg leading-8 text-muted sm:text-xl">
            {HERO.supporting}
          </p>

          {/* The control is LTR and English inside the RTL panel. */}
          <div dir="ltr" className="mt-8 flex justify-end">
            <Button asChild size="lg">
              <Link to="/" hash="shop">
                {HERO.cta}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
          </div>
        </div>

        {/* Photograph, with the caption bar the design puts across its foot. */}
        <div className="relative order-1 min-h-[420px] overflow-hidden bg-surface sm:min-h-[560px] lg:order-2 lg:min-h-[680px]">
          <div className="absolute inset-0">
            <ProductImage
              image={image}
              sizes="(min-width: 1024px) 60vw, 100vw"
              priority
              className="h-full w-full object-cover"
            />
          </div>

          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-4 bg-foreground/85 px-5 py-4 text-background">
            <span lang="ar" dir="rtl" className="font-arabic text-sm">
              {productContent(heroSlug).name}
            </span>
            <span dir="ltr" className="label-sm shrink-0">
              Burgundy cap
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

/** The heading above the two product sections. */
export function ShopHeading() {
  return (
    <div className="mx-auto max-w-page px-5 pb-8 pt-16 sm:px-8 lg:pt-20">
      <h2 dir="rtl" className="phrase text-right font-arabic text-headline font-semibold">
        {SHOP.heading}
      </h2>
    </div>
  );
}

/**
 * About. Short by instruction: no founder story, no brand philosophy, no
 * manifesto. Large type and a lot of room around very few words.
 */
export function AboutSection() {
  return (
    <section id="about" className="scroll-mt-28 border-y border-border">
      <div className="mx-auto max-w-page px-5 py-20 sm:px-8 lg:py-28">
        <div dir="rtl" className="mx-auto flex max-w-3xl flex-col gap-8 text-right">
          <h2 className="phrase font-arabic text-headline font-semibold">{ABOUT.heading}</h2>
          <p className="font-arabic text-xl leading-9 text-muted">{ABOUT.body}</p>
          <p className="font-arabic text-lg">{ABOUT.closing}</p>
        </div>
      </div>
    </section>
  );
}

/**
 * FAQ. Questions in English, answers in Arabic -- each answer gets its own
 * RTL block so the two directions do not fight inside one row.
 *
 * Built on <details> rather than a JavaScript accordion: it works before
 * hydration, it is keyboard accessible for free, and the answers are in the
 * document for a search engine to read.
 */
export function FaqSection() {
  return (
    <section id="faq" className="scroll-mt-28">
      <div className="mx-auto max-w-page px-5 py-20 sm:px-8 lg:py-28">
        <h2 className="font-display text-headline">FAQ</h2>

        <div className="mt-10 border-t border-border">
          {FAQ.map((entry) => (
            <details key={entry.id} className="group border-b border-border">
              <summary className="label flex cursor-pointer items-center justify-between gap-6 py-6 transition-colors hover:text-signal [&::-webkit-details-marker]:hidden">
                {entry.question}
                <span
                  className="shrink-0 font-mono text-lg leading-none text-muted transition-transform group-open:rotate-45"
                  aria-hidden
                >
                  +
                </span>
              </summary>
              <p dir="rtl" className="pb-7 text-right font-arabic text-lg leading-9 text-muted">
                {entry.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-foreground px-5 py-14 text-background sm:px-8">
      <div className="mx-auto grid max-w-page gap-10 md:grid-cols-3">
        <div>
          <p className="font-display text-2xl sm:text-3xl">{BRAND.name}</p>
        </div>

        <div className="font-mono text-xs text-background/55">
          <p className="label text-background">Shop</p>
          <ul className="mt-3 flex flex-col gap-1">
            {PRODUCT_CONTENT.map((product) => (
              <li key={product.slug}>
                <Link
                  to="/product/$slug"
                  params={{ slug: product.slug }}
                  lang="ar"
                  dir="rtl"
                  className="block text-right font-arabic text-sm transition-colors hover:text-background"
                >
                  {product.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-3 md:items-end">
          <nav aria-label="Footer">
            <ul className="flex flex-wrap items-center gap-5">
              <li>
                <Link
                  to="/track"
                  className="label text-background/55 transition-colors hover:text-background"
                >
                  {UI.trackOrder}
                </Link>
              </li>
              <li>
                <Link
                  to="/"
                  hash="faq"
                  className="label text-background/55 transition-colors hover:text-background"
                >
                  FAQ
                </Link>
              </li>
            </ul>
          </nav>
          <p className="label-sm text-background/55 md:text-end">
            © {new Date().getFullYear()} {BRAND.name}
          </p>
        </div>
      </div>
    </footer>
  );
}
