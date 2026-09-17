/**
 * The catalogue: product copy and photography, in one place.
 *
 * What lives here is everything the *design* owns -- Taher's phrases, the
 * Arabic descriptions, and which photograph goes where. What deliberately
 * does NOT live here is price, stock and active status: those come from the
 * database, because a price in a bundle is a price a customer can edit.
 *
 * The two slugs below are the only products this store will ever have. If a
 * third appears in the database it will not render, and that is intended --
 * the brief fixes the catalogue at two caps.
 */

export const PRODUCT_SLUGS = ["taiwan", "al-adou"] as const;

export type ProductSlug = (typeof PRODUCT_SLUGS)[number];

export function isProductSlug(value: string): value is ProductSlug {
  return (PRODUCT_SLUGS as readonly string[]).includes(value);
}

/** Which photograph this is. The gallery orders itself by this sequence. */
export type ImageView = "main" | "front" | "side" | "back" | "detail";

export const IMAGE_VIEW_ORDER: readonly ImageView[] = [
  "main",
  "front",
  "side",
  "back",
  "detail",
] as const;

export interface ProductImage {
  /** Stable id, used as a React key and as the gallery's selected value. */
  readonly id: string;
  readonly view: ImageView;
  /**
   * Path without extension, relative to /public.
   * `scripts/optimize-images.mjs` writes `<basePath>-<width>.avif|webp` beside
   * the original it was given, and the gallery builds its srcset from that.
   */
  readonly basePath: string;
  /** Arabic alt text. Describes the photograph, not the product name again. */
  readonly alt: string;
  /** Intrinsic size of the original, so the layout reserves the right box. */
  readonly width: number;
  readonly height: number;
  /**
   * True until a real photograph replaces it. A placeholder renders as a flat
   * SVG with no srcset, and the production checklist fails while any remain.
   */
  readonly placeholder: boolean;
}

export interface ProductContent {
  readonly slug: ProductSlug;
  /** Arabic product name. Also the <h*> for the product's section. */
  readonly name: string;
  /**
   * The phrase that carries the product. Set in the editorial serif at the
   * largest size the section allows.
   */
  readonly primaryPhrase: string;
  /** The line under it. Smaller, same face. */
  readonly secondaryPhrase: string;
  /**
   * Shown once, small, as a photographic annotation -- never at the weight of
   * the two lines above. Absent on a product that has no third line.
   */
  readonly accentPhrase?: string;
  /**
   * The two lines written out as Taher says them, displayed once per page.
   * Only set where the brief asks for the complete phrase.
   */
  readonly fullPhrase?: string;
  /** One sentence. Appears beside the buy controls. */
  readonly description: string;
  readonly images: readonly ProductImage[];
}

/**
 * Widths the optimiser emits and the gallery offers. Chosen for the two places
 * a product photograph is shown: a ~60vw editorial panel on a desktop, and a
 * full-bleed column on a phone at up to 3x density.
 */
export const IMAGE_WIDTHS = [480, 768, 1200, 1800] as const;

function placeholderImage(
  slug: ProductSlug,
  view: ImageView,
  alt: string,
  size: { width: number; height: number },
): ProductImage {
  return {
    id: `${slug}-${view}`,
    view,
    basePath: `/images/products/${slug}/${view}`,
    alt,
    width: size.width,
    height: size.height,
    placeholder: true,
  };
}

/* Square for the catalogue views, 4:5 for the detail crop. */
const SQUARE = { width: 1600, height: 1600 };
const PORTRAIT = { width: 1600, height: 2000 };

/**
 * PRODUCT ONE -- تايوان يا ريس
 *
 * Hierarchy, in the order the brief sets it: the product name, then the
 * question, then the waiting line, then -- small, once -- the aside.
 */
const TAIWAN: ProductContent = {
  slug: "taiwan",
  name: "تايوان يا ريس",
  primaryPhrase: "مش هنصيف في تايوان يا ريس؟",
  secondaryPhrase: "لأجل مصيف أفضل سأنتظر.",
  accentPhrase: "اغضب يا شي جين بينج.",
  description: "كاب مطرّز بعبارة «تايوان يا ريس».",
  images: [
    placeholderImage("taiwan", "main", "كاب «تايوان يا ريس» من الأمام", SQUARE),
    placeholderImage("taiwan", "front", "واجهة الكاب والتطريز كاملًا", SQUARE),
    placeholderImage("taiwan", "side", "الكاب من الجانب", SQUARE),
    placeholderImage("taiwan", "back", "الكاب من الخلف مع فتحة المقاس", SQUARE),
    placeholderImage("taiwan", "detail", "تفصيلة قريبة لتطريز العبارة", PORTRAIT),
  ],
};

/**
 * PRODUCT TWO -- العدو ليس بهذه القوة
 *
 * The complete sentence appears once, under the two lines, and nowhere else.
 */
const AL_ADOU: ProductContent = {
  slug: "al-adou",
  name: "العدو ليس بهذه القوة",
  primaryPhrase: "العدو ليس بهذه القوة",
  secondaryPhrase: "ونحن لسنا بهذا الضعف.",
  fullPhrase: "العدو ليس بهذه القوة، ونحن لسنا بهذا الضعف.",
  description: "كاب مطرّز بإحدى أشهر عبارات طاهر.",
  images: [
    placeholderImage("al-adou", "main", "كاب «العدو ليس بهذه القوة» من الأمام", SQUARE),
    placeholderImage("al-adou", "front", "واجهة الكاب والتطريز كاملًا", SQUARE),
    placeholderImage("al-adou", "side", "الكاب من الجانب", SQUARE),
    placeholderImage("al-adou", "back", "الكاب من الخلف مع فتحة المقاس", SQUARE),
    placeholderImage("al-adou", "detail", "تفصيلة قريبة لتطريز العبارة", PORTRAIT),
  ],
};

/** Display order on the homepage. The shop section alternates their layout. */
export const PRODUCT_CONTENT: readonly ProductContent[] = [TAIWAN, AL_ADOU];

const BY_SLUG = new Map<ProductSlug, ProductContent>(PRODUCT_CONTENT.map((p) => [p.slug, p]));

export function productContent(slug: ProductSlug): ProductContent {
  const content = BY_SLUG.get(slug);
  // Unreachable while the slug type holds, but a missing entry would otherwise
  // render an empty section rather than fail a test.
  if (!content) throw new Error(`No catalogue content for slug "${slug}"`);
  return content;
}

/** The photograph a listing or a cart line should use. */
export function mainImage(slug: ProductSlug): ProductImage {
  const [first] = productContent(slug).images;
  if (!first) throw new Error(`No images configured for "${slug}"`);
  return first;
}

/** True once every photograph on both products is real. Gates the checklist. */
export function allPhotographySupplied(): boolean {
  return PRODUCT_CONTENT.every((p) => p.images.every((i) => !i.placeholder));
}
