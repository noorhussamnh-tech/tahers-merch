/**
 * A product, as an editorial section.
 *
 * Not a card in a grid. Each cap gets a full-width section, and the two
 * alternate which side the photography sits on, so the page reads as a spread
 * rather than as a catalogue.
 *
 * Every line of copy below the product name is optional, and both caps
 * currently run with almost none: the phrase is embroidered on the cap and
 * visible in the photograph, so repeating it three times underneath adds
 * nothing. Where a phrase does appear, the order is name, then the red line,
 * then the muted line, then the aside as a caption on the photograph -- the
 * aside is never a headline.
 */
import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ProductGallery } from "@/components/product-gallery";
import { UI } from "@/lib/catalog/copy";
import { formatEGP } from "@/lib/domain/money";
import { productContent, type ProductSlug } from "@/lib/catalog/products";
import { useCart } from "@/lib/cart/store";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/domain/types";

interface ProductSectionProps {
  readonly slug: ProductSlug;
  /** Absent when Supabase is unconfigured or the cap is deactivated. */
  readonly product: Product | undefined;
  /** Photography on the left on an even index, the right on an odd one. */
  readonly index: number;
  readonly priority?: boolean;
  /**
   * Adds the sticky mobile add-to-cart bar. Only the product detail view sets
   * it: the homepage renders both caps, and two sticky bars would stack on
   * top of each other at the bottom of a phone screen.
   */
  readonly sticky?: boolean;
}

export function ProductSection({
  slug,
  product,
  index,
  priority = false,
  sticky = false,
}: ProductSectionProps) {
  const content = productContent(slug);
  const imageFirst = index % 2 === 0;

  return (
    <section
      id={slug}
      className="scroll-mt-28 border-t border-border"
      aria-labelledby={`${slug}-name`}
    >
      <div className="mx-auto grid max-w-page grid-cols-1 items-start gap-8 px-5 py-14 sm:px-8 lg:grid-cols-2 lg:gap-14 lg:py-20">
        <div className={cn("relative order-1", imageFirst ? "lg:order-1" : "lg:order-2")}>
          {/* The colour chip the design puts in the corner of a product photo. */}
          <span className="label-sm pointer-events-none absolute left-4 top-4 z-10 bg-background/90 px-2.5 py-1.5">
            {slug === "taiwan" ? "Green" : "Burgundy"}
          </span>

          <ProductGallery product={content} priority={priority} />

          {/* The aside lives here, attached to the photography, tiny, once.
              It is a caption on a picture -- not a second headline. */}
          {content.accentPhrase && (
            <p dir="rtl" className="mt-4 font-arabic text-xs leading-relaxed text-muted">
              {content.accentPhrase}
            </p>
          )}
        </div>

        <div
          className={cn("order-2 flex flex-col gap-7", imageFirst ? "lg:order-2" : "lg:order-1")}
        >
          <div dir="rtl" className="flex flex-col gap-5 text-right">
            <h3 id={`${slug}-name`} className="phrase font-arabic text-title font-semibold">
              {content.name}
            </h3>

            {content.primaryPhrase && (
              <p className="phrase font-arabic text-[1.5rem] leading-[1.6] text-signal sm:text-[1.875rem]">
                {content.primaryPhrase}
              </p>
            )}

            {content.secondaryPhrase && (
              <p className="font-arabic text-lg leading-8 text-muted">{content.secondaryPhrase}</p>
            )}

            {/* Product two only: the two lines written out together, once. */}
            {content.fullPhrase && (
              <p className="border-t border-border pt-5 font-arabic text-base leading-8">
                {content.fullPhrase}
              </p>
            )}

            <p className="font-arabic text-base leading-8 text-muted">{content.description}</p>

            {/* Colour and thread. A real product detail, kept small: it sits
                with the description rather than competing with the phrase. */}
            <p className="font-arabic text-sm leading-7 text-muted">اللون: {content.colour}</p>
          </div>

          <BuyPanel slug={slug} product={product} name={content.name} sticky={sticky} />
        </div>
      </div>
    </section>
  );
}

/**
 * Price, availability and the add-to-cart control.
 *
 * Every state a customer can meet is handled explicitly: not configured, not
 * for sale yet, sold out, only a few left, and available. Silence in any of
 * them reads as a broken shop.
 */
function BuyPanel({
  slug,
  product,
  name,
  sticky,
}: {
  slug: ProductSlug;
  product: Product | undefined;
  name: string;
  sticky: boolean;
}) {
  const cart = useCart();
  const [added, setAdded] = useState(false);

  if (!product) {
    return (
      <div className="border-t border-border pt-6">
        <p dir="rtl" className="font-arabic text-base text-muted">
          هذا التصميم غير متاح حاليًا.
        </p>
      </div>
    );
  }

  const soldOut = product.available <= 0;
  // A price of zero means nobody has set one yet -- the seed ships that way
  // on purpose. Better to say so than to offer a free cap.
  const priceUnset = product.price <= 0;

  const handleAdd = () => {
    // One at a time. More than one is a change the customer makes in the cart,
    // where they can see what they are committing to.
    cart.add(slug, 1);
    cart.open();
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div className="flex flex-col gap-6 border-t border-border pt-6">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-mono text-base tracking-[0.12em]">
          {priceUnset ? "—" : formatEGP(product.price)}
        </span>
        <Availability available={product.available} soldOut={soldOut} />
      </div>

      {priceUnset ? (
        <p dir="rtl" className="font-arabic text-sm text-muted">
          سيتم الإعلان عن السعر قريبًا.
        </p>
      ) : (
        <>
          {/*
           * Quick add: a black square with a white plus, as the design has it.
           * One tap puts a cap in the cart and opens the drawer, where the
           * quantity can be changed -- which is why there is no stepper here.
           * Wider than a bare icon so the label reads on a desktop and the tap
           * target stays comfortable on a phone.
           */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleAdd}
              disabled={soldOut}
              aria-label={`${UI.addToCart}: ${name}`}
              className={cn(
                "group flex h-12 items-center gap-3 bg-foreground px-4 text-background",
                "transition-colors hover:bg-signal",
                "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-foreground",
              )}
            >
              <Plus className="h-5 w-5 shrink-0" strokeWidth={2.5} aria-hidden />
              <span className="label">{soldOut ? UI.soldOut : added ? "Added" : UI.addToCart}</span>
            </button>
          </div>

          {/* The sticky bar a phone gets on the product detail view, so the
              action stays reachable while scrolling a long section. */}
          {sticky && !soldOut && (
            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background px-5 py-3 lg:hidden">
              <Button size="lg" variant="signal" onClick={handleAdd} className="w-full">
                {added ? "Added" : `${UI.addToCart} — ${formatEGP(product.price)}`}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Availability({ available, soldOut }: { available: number; soldOut: boolean }) {
  if (soldOut) {
    return (
      <span dir="rtl" className="font-arabic text-sm text-error">
        نفدت الكمية.
      </span>
    );
  }

  // A specific number is only useful when it is small enough to matter; above
  // that it is just a stock figure the shop has no reason to publish.
  if (available <= 5) {
    return (
      <span dir="rtl" className="font-arabic text-sm text-signal">
        {available === 1 ? "بقيت قطعة واحدة." : `بقي ${available} قطع فقط.`}
      </span>
    );
  }

  return (
    <span dir="rtl" className="font-arabic text-sm text-success">
      متاح.
    </span>
  );
}
