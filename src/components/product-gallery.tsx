/**
 * The product gallery.
 *
 * One large photograph with the other views as thumbnails beneath it, and a
 * click to enlarge. Deliberately not a carousel: there are five photographs
 * of one cap, and a customer wants to compare the embroidery detail against
 * the front view, which a carousel makes harder rather than easier.
 *
 * Nothing crops the embroidery. The main frame is `object-contain` on the
 * paper colour rather than `object-cover`, so a photograph whose aspect ratio
 * differs from the frame is letterboxed instead of having the phrase -- the
 * entire point of the product -- sliced off at the edge.
 */
import { X, ZoomIn } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  IMAGE_VIEW_ORDER,
  type ProductContent,
  type ProductImage as ProductImageData,
} from "@/lib/catalog/products";
import { ProductImage } from "@/components/product-image";
import { cn } from "@/lib/utils";

/** English labels for the views; these are controls, so they stay English. */
const VIEW_LABEL: Record<ProductImageData["view"], string> = {
  main: "Main",
  front: "Front",
  side: "Side",
  back: "Back",
  detail: "Detail",
};

export function ProductGallery({
  product,
  priority = false,
}: {
  product: ProductContent;
  priority?: boolean;
}) {
  const images = [...product.images].sort(
    (a, b) => IMAGE_VIEW_ORDER.indexOf(a.view) - IMAGE_VIEW_ORDER.indexOf(b.view),
  );

  const [selectedId, setSelectedId] = useState(images[0]?.id ?? "");
  const [zoomed, setZoomed] = useState(false);

  const selected = images.find((image) => image.id === selectedId) ?? images[0];

  const closeZoom = useCallback(() => setZoomed(false), []);

  useEffect(() => {
    if (!zoomed) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeZoom();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed, closeZoom]);

  if (!selected) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="group relative overflow-hidden bg-paper">
        <button
          type="button"
          onClick={() => setZoomed(true)}
          className="block w-full cursor-zoom-in"
          aria-label="Enlarge photograph"
        >
          <div className="flex aspect-square w-full items-center justify-center">
            <ProductImage
              image={selected}
              // The panel is ~60% of a 1440px page on a desktop and the full
              // column on a phone. Stated, not guessed: a wrong `sizes` is
              // how a phone ends up downloading a 1800px file.
              sizes="(min-width: 1024px) 55vw, 100vw"
              priority={priority}
              className="object-contain"
            />
          </div>
        </button>

        <span
          className="pointer-events-none absolute bottom-4 right-4 flex h-9 w-9 items-center justify-center bg-cream/90 text-ink opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden
        >
          <ZoomIn className="h-4 w-4" strokeWidth={1.5} />
        </span>
      </div>

      {images.length > 1 && (
        <ul className="grid grid-cols-5 gap-2">
          {images.map((image) => (
            <li key={image.id}>
              <button
                type="button"
                onClick={() => setSelectedId(image.id)}
                aria-label={VIEW_LABEL[image.view]}
                aria-current={image.id === selected.id}
                className={cn(
                  "block w-full overflow-hidden border bg-paper transition-colors",
                  image.id === selected.id ? "border-accent" : "border-line hover:border-ink",
                )}
              >
                <div className="flex aspect-square items-center justify-center">
                  <ProductImage
                    image={image}
                    sizes="(min-width: 1024px) 110px, 20vw"
                    className="object-contain"
                  />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {zoomed && <ZoomOverlay image={selected} onClose={closeZoom} />}
    </div>
  );
}

function ZoomOverlay({ image, onClose }: { image: ProductImageData; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-cream/98 p-4 md:p-12"
      role="dialog"
      aria-modal="true"
      aria-label={image.alt}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-zoom-out"
        onClick={onClose}
        aria-label="Close"
      />
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center border border-line bg-cream text-ink transition-colors hover:text-accent md:right-8 md:top-8"
        aria-label="Close"
      >
        <X className="h-5 w-5" strokeWidth={1.5} aria-hidden />
      </button>

      <div className="pointer-events-none relative max-h-full max-w-5xl">
        <ProductImage image={image} sizes="100vw" priority className="object-contain" />
      </div>
    </div>
  );
}
