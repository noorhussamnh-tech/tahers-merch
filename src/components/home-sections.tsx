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
import { Link } from "@tanstack/react-router";

import { ABOUT, BRAND, FAQ, HERO, SHOP, UI } from "@/lib/catalog/copy";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/product-image";
import { mainImage } from "@/lib/catalog/products";

/**
 * The hero: text on the left, photograph on the right, roughly 40/60, filling
 * the screen below the header.
 *
 * On a phone it stacks, and the photograph comes first -- somebody arriving
 * from a link should see the cap before they read about it.
 */
export function Hero() {
  return (
    <section className="border-b border-line">
      <div className="mx-auto grid max-w-page grid-cols-1 lg:grid-cols-[minmax(0,40fr)_minmax(0,60fr)]">
        {/* Photograph first on a phone, second on a desktop. */}
        <div className="order-1 bg-paper lg:order-2">
          <div className="flex h-full min-h-[58vh] items-center justify-center lg:min-h-[calc(100vh-100px)]">
            <ProductImage
              image={mainImage("taiwan")}
              sizes="(min-width: 1024px) 60vw, 100vw"
              priority
              className="object-contain"
            />
          </div>
        </div>

        <div className="order-2 flex flex-col justify-center gap-7 px-5 py-14 md:px-10 md:py-20 lg:order-1 lg:px-16">
          <p dir="rtl" className="eyebrow-ar">
            {HERO.label}
          </p>

          <h1 dir="rtl" className="phrase text-display font-normal text-ink">
            {HERO.headline}
          </h1>

          <p dir="rtl" className="max-w-md font-arabic text-lg leading-loose text-muted md:text-xl">
            {HERO.supporting}
          </p>

          <div className="pt-2">
            <Button asChild size="lg">
              <Link to="/" hash="shop">
                {HERO.cta}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

/** The heading above the two product sections. */
export function ShopHeading() {
  return (
    <div className="mx-auto max-w-page px-5 pb-4 pt-20 md:px-10 md:pt-28 lg:px-16">
      <h2 dir="rtl" className="phrase text-headline font-normal text-ink">
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
    <section id="about" className="scroll-mt-28 border-t border-line">
      <div className="mx-auto max-w-page px-5 py-24 md:px-10 md:py-36 lg:px-16">
        <div dir="rtl" className="mx-auto flex max-w-3xl flex-col gap-10 text-right">
          <h2 className="phrase text-headline font-normal text-ink">{ABOUT.heading}</h2>
          <p className="font-arabic text-xl leading-loose text-muted md:text-2xl">{ABOUT.body}</p>
          <p className="font-arabic text-lg text-ink md:text-xl">{ABOUT.closing}</p>
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
    <section id="faq" className="scroll-mt-28 border-t border-line">
      <div className="mx-auto max-w-page px-5 py-24 md:px-10 md:py-32 lg:px-16">
        <h2 className="font-display text-headline text-ink">FAQ</h2>

        <div className="mt-12 border-t border-line">
          {FAQ.map((entry) => (
            <details key={entry.id} className="group border-b border-line">
              <summary className="flex cursor-pointer items-center justify-between gap-6 py-7 font-sans text-xs uppercase tracking-[0.14em] text-ink transition-colors hover:text-accent [&::-webkit-details-marker]:hidden">
                {entry.question}
                <span
                  className="shrink-0 font-sans text-lg leading-none text-muted transition-transform group-open:rotate-45"
                  aria-hidden
                >
                  +
                </span>
              </summary>
              <p dir="rtl" className="pb-8 font-arabic text-lg leading-loose text-muted">
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
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-page flex-col gap-6 px-5 py-10 md:flex-row md:items-center md:justify-between md:px-10 lg:px-16">
        <span className="font-display text-xl text-ink">{BRAND.name}</span>

        <nav aria-label="Footer">
          <ul className="flex flex-wrap items-center gap-6">
            <li>
              <Link to="/track" className="control text-muted transition-colors hover:text-accent">
                {UI.trackOrder}
              </Link>
            </li>
            <li>
              <Link
                to="/"
                hash="faq"
                className="control text-muted transition-colors hover:text-accent"
              >
                FAQ
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
