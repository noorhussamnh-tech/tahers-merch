/**
 * Site copy.
 *
 * Two languages with one rule, from the brief: anything a customer *operates*
 * is English -- navigation, buttons, form labels, statuses -- and anything a
 * customer *reads* is Arabic. Keeping both here means the Arabic can be
 * proofread in one pass, and means no component invents a phrase of its own.
 *
 * Nothing in this file may be edited to add a joke, a tagline, or a line
 * attributed to Taher that he did not say.
 */

/**
 * Header navigation. English, never translated.
 *
 * Three links to the three sections of the one page. TRACK ORDER is
 * deliberately not here -- it lives in the footer and on the order
 * confirmation, which is where somebody chasing a parcel actually looks.
 */
export const NAV: readonly { label: string; to: "/" | "/track"; hash?: string }[] = [
  { label: "SHOP", to: "/", hash: "shop" },
  { label: "ABOUT", to: "/", hash: "about" },
  { label: "FAQ", to: "/", hash: "faq" },
];

/** English functional labels, fixed by the brief. */
export const UI = {
  addToCart: "ADD TO CART",
  buyNow: "BUY NOW",
  cart: "CART",
  checkout: "CHECKOUT",
  continueShopping: "CONTINUE SHOPPING",
  apply: "APPLY",
  placeOrder: "PLACE ORDER",
  tryAgain: "TRY AGAIN",
  trackOrder: "TRACK ORDER",
  shopTheCaps: "SHOP THE CAPS",
  soldOut: "SOLD OUT",
  remove: "REMOVE",
} as const;

/**
 * The homepage hero.
 *
 * `الإصدار الأول` is the headline itself, not a label above one -- so there is
 * no eyebrow here. The announcement strip above the header deliberately does
 * NOT repeat it, or the same three words would appear twice within 200px.
 */
export const HERO = {
  headline: "الإصدار الأول",
  supporting: "برضو مش عامله لأمي",
  cta: UI.shopTheCaps,
} as const;

export const SHOP = {
  heading: "التصميمان",
} as const;

/** The about section. Short by instruction: no founder story, no philosophy. */
export const ABOUT = {
  heading: "من كلام طاهر",
  body: "عبارات ارتبطت بمحتوى طاهر وبقيت مع جمهوره. تحوّلت هنا إلى تصميمين بسيطين، متاحين بكمية محدودة.",
  closing: "هذا كل شيء.",
} as const;

/**
 * FAQ. Questions and answers both in English.
 *
 * Answers were Arabic originally; they are English now at the client's
 * instruction, which also means this whole section reads left to right.
 *
 * Two answers carry real operational commitments. Change them only alongside
 * the thing they promise:
 *
 *   · `delivery` says Cairo only. If a shipping zone exists for anywhere else,
 *     checkout will happily take that order and this answer becomes a lie.
 *     The zones are the source of truth -- see docs/MISSING-INFORMATION.md.
 *   · `returns` says at-the-door only, delivery paid either way. That is a
 *     policy, not a description, and it is what a customer will hold you to.
 */
export const FAQ = [
  {
    id: "material",
    question: "WHAT MATERIAL IS IT MADE FROM?",
    // Still a placeholder: the manufacturer has not confirmed the composition.
    answer: "Material details will be added once confirmed by the manufacturer.",
  },
  {
    id: "delivery",
    question: "HOW LONG DOES DELIVERY TAKE?",
    answer:
      "We currently deliver within Cairo only. The expected delivery time is shown at checkout before you place your order.",
  },
  {
    id: "returns",
    question: "CAN I EXCHANGE OR RETURN IT?",
    answer:
      "Exchanges and returns are accepted while the courier is still at your door, and not after. Delivery fees are payable in all cases.",
  },
] as const;

/** Cart empty state. English, because the cart is a control surface. */
export const CART_EMPTY = {
  heading: "Your cart is empty.",
  action: UI.continueShopping,
} as const;

export const BRAND = {
  /**
   * Stays in English everywhere, including inside RTL sections, and is set in
   * the heavy italic display face -- the one piece of the page allowed real
   * flourish.
   */
  name: "Taher's Merch",
} as const;
