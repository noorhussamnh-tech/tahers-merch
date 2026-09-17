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

/** English navigation. Never translated. */
export const NAV = [
  { label: "SHOP", to: "/", hash: "shop" },
  { label: "ABOUT", to: "/", hash: "about" },
  { label: "FAQ", to: "/", hash: "faq" },
  { label: "TRACK ORDER", to: "/track" },
] as const;

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

/** The homepage hero. */
export const HERO = {
  label: "الإصدار الأول",
  headline: "كابات طاهر",
  supporting: "تصميمان من أشهر عبارات طاهر، متاحان بكمية محدودة.",
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

/** Questions in English, answers in Arabic, exactly as specified. */
export const FAQ = [
  {
    id: "adjustable",
    question: "IS THE CAP ADJUSTABLE?",
    answer: "نعم، الكاب بمقاس قابل للتعديل.",
  },
  {
    id: "material",
    question: "WHAT MATERIAL IS IT MADE FROM?",
    // Placeholder by instruction. Replace only once the manufacturer confirms
    // the material -- see docs/MISSING-INFORMATION.md.
    answer: "سيتم إضافة تفاصيل الخامة بعد تأكيدها.",
  },
  {
    id: "delivery",
    question: "HOW LONG DOES DELIVERY TAKE?",
    answer: "تختلف مدة التوصيل حسب المحافظة، وستظهر المدة المتوقعة عند إتمام الطلب.",
  },
  {
    id: "returns",
    question: "CAN I EXCHANGE OR RETURN IT?",
    answer: "يمكن طلب الاستبدال أو الاسترجاع وفقًا للشروط الموضحة في سياسة المتجر.",
  },
  {
    id: "quantity",
    question: "IS THE QUANTITY LIMITED?",
    answer: "نعم، يتوفر كل تصميم بكمية محدودة.",
  },
] as const;

/** Cart empty state. English, because the cart is a control surface. */
export const CART_EMPTY = {
  heading: "Your cart is empty.",
  action: UI.continueShopping,
} as const;

export const BRAND = {
  /** Stays in English everywhere, including inside RTL sections. */
  name: "Taher Caps",
} as const;
