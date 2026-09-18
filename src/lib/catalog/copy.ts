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

/**
 * FAQ. Two questions, English throughout, so the section reads left to right.
 *
 * Both answers are operational commitments rather than descriptions, and both
 * are things a customer will hold the shop to. Change either only alongside
 * the thing it promises:
 *
 *   · `delivery` says Cairo and Giza only. The shipping zones are what
 *     actually enforce that -- a governorate with a row in tc_shipping_zones
 *     can be ordered to, whatever this answer says. If the two disagree, the
 *     zones win and this becomes a lie.
 *   · `returns` says at-the-door only, delivery paid either way. That is the
 *     policy, and it is the one customers argue about.
 *
 * Questions about the cap itself -- whether it adjusts, what it is made of --
 * were removed deliberately. Nothing here should exist that the business
 * cannot yet answer honestly.
 */
export const FAQ = [
  {
    id: "delivery",
    question: "HOW LONG DOES DELIVERY TAKE?",
    answer:
      "We currently ship to Cairo and Giza only. The expected delivery time is shown at checkout before you place your order.",
  },
  {
    id: "returns",
    question: "CAN I EXCHANGE OR RETURN IT?",
    answer:
      "Exchanges and returns are only possible while the courier is still at your door. Delivery fees apply in all cases.",
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
