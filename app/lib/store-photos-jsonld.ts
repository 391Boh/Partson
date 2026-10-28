// Real photos of the Lviv store (facade first): Google recommends actual
// business photos for a LocalBusiness `image`. They belong to the pages about
// the store only — in the site-wide AutoPartsStore block they sat on every
// product page, and Google Images showed a wiper-blade shelf or the shop
// window as the picture of a brake disc. The root layout's block (same @id)
// keeps the logo; Google merges the two by @id.
export const buildStorePhotosJsonLd = (siteUrl: string) => ({
  "@context": "https://schema.org",
  "@type": "AutoPartsStore",
  "@id": `${siteUrl}#local-business`,
  image: [1, 4, 6, 2, 3, 5, 7].map((index) => `${siteUrl}/storefront/photos/partson-store-${index}.jpg`),
});
