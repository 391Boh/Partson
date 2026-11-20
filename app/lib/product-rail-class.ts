// One class list for every horizontal product strip on the product page
// (analogs, similar, recently viewed), so they swipe and look the same.
// Fixed pixel card widths: identical on every phone, and narrow enough that
// the next card peeks in at the edge, reinforced by the trailing fade.
// Swipe behaviour comes from the shared .swipe-rail standard (globals.css);
// the tablet+ column layout from `.product-page .product-rail`.
export const productRailClass = (count: number) =>
  `product-rail swipe-rail swipe-rail--fade mt-3 grid grid-flow-col grid-rows-1 auto-cols-[172px] gap-2.5 ${count > 2 ? "pb-2" : "pb-1"} text-left scroll-smooth sm:auto-cols-[176px] sm:gap-3 lg:auto-cols-[188px]`;
