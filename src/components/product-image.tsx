/**
 * A product photograph.
 *
 * Emits a `<picture>` offering AVIF, then WebP, then the original, each with a
 * srcset across the widths the optimiser produces. The browser picks the
 * smallest file that will look right on the screen it has, which on an
 * Egyptian phone on mobile data is the difference between a shop that loads
 * and one that does not.
 *
 * Three things are deliberate:
 *
 *   - `width` and `height` are always set, so the page reserves the right box
 *     and the editorial layout does not jump as photographs arrive.
 *   - Everything below the fold is lazy and `decoding="async"`; the hero and
 *     the first product's main image are eager, because they are the page.
 *   - The alt text is Arabic and describes the photograph. It comes from the
 *     catalogue, never from a filename.
 *
 * While a photograph is still a placeholder, this renders a flat panel that
 * says so rather than a broken image or an invented cap.
 */
import { IMAGE_WIDTHS, type ProductImage as ProductImageData } from "@/lib/catalog/products";
import { cn } from "@/lib/utils";

interface ProductImageProps {
  readonly image: ProductImageData;
  /**
   * How wide the image will be rendered, as a `sizes` attribute. Getting this
   * wrong costs bandwidth, so each caller states what its layout actually
   * does rather than relying on a default.
   */
  readonly sizes: string;
  readonly priority?: boolean;
  readonly className?: string;
  /**
   * Drops the placeholder's descriptive text. Set it wherever the image box is
   * too small to hold a sentence -- a cart thumbnail, a gallery chip -- where
   * the text would otherwise spill out and read as a broken component.
   * Has no effect once a real photograph is in place.
   */
  readonly compact?: boolean;
}

/**
 * The srcset, limited to variants that exist on disk.
 *
 * The optimiser never upscales: a 1024px original produces no 1200px or
 * 1800px variant. Offering those anyway makes the browser request a file that
 * 404s and render a broken image -- which is exactly what happened the first
 * time a real photograph went in. So the list is filtered by the original's
 * own width, keeping the smallest entry regardless so there is always at
 * least one candidate.
 */
function srcSet(basePath: string, extension: string, intrinsicWidth: number): string {
  const [smallest] = IMAGE_WIDTHS;
  return IMAGE_WIDTHS.filter((width) => width <= intrinsicWidth || width === smallest)
    .map((width) => `${basePath}-${width}.${extension} ${width}w`)
    .join(", ");
}

export function ProductImage({
  image,
  sizes,
  priority = false,
  className,
  compact = false,
}: ProductImageProps) {
  if (image.placeholder) {
    return <PlaceholderPanel image={image} className={className} compact={compact} />;
  }

  return (
    <picture>
      <source
        type="image/avif"
        srcSet={srcSet(image.basePath, "avif", image.width)}
        sizes={sizes}
      />
      <source
        type="image/webp"
        srcSet={srcSet(image.basePath, "webp", image.width)}
        sizes={sizes}
      />
      <img
        src={`${image.basePath}.jpg`}
        alt={image.alt}
        width={image.width}
        height={image.height}
        sizes={sizes}
        // The hero photograph is the largest thing on the page and the thing
        // the page is about; anything else can wait until it is scrolled to.
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        className={cn("h-full w-full object-cover", className)}
      />
    </picture>
  );
}

/**
 * Stands in for a photograph that has not been supplied yet.
 *
 * Says so plainly, in Arabic, rather than showing a generated cap: the brief
 * forbids replacement imagery, and a convincing fake is worse than an obvious
 * gap -- somebody would ship it.
 */
function PlaceholderPanel({
  image,
  className,
  compact,
}: {
  image: ProductImageData;
  // Explicitly `| undefined` rather than optional: `exactOptionalPropertyTypes`
  // distinguishes "absent" from "present and undefined", and the caller passes
  // the latter.
  className: string | undefined;
  compact: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-2 overflow-hidden bg-card",
        "border border-dashed border-border text-center",
        compact ? "px-1" : "gap-3 px-6",
        className,
      )}
      style={{ aspectRatio: `${image.width} / ${image.height}` }}
      role="img"
      // The full description still reaches a screen reader either way.
      aria-label={`${image.alt} — الصورة لم تُضف بعد`}
    >
      <span className={cn("eyebrow", compact && "text-[8px] tracking-[0.1em]")}>
        {compact ? "Photo" : "Photo pending"}
      </span>
      {!compact && (
        <span dir="rtl" className="font-arabic text-sm text-muted">
          {image.alt}
        </span>
      )}
    </div>
  );
}
