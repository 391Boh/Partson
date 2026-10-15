// Delivery terms shared by the product structured data and the Google
// Merchant feed, so both state the same thing as /inform/delivery.
//
// The rate is Nova Poshta's own quote (getDocumentPrice, October 2026) for a
// parcel up to 2 kg from Lviv to a branch anywhere in Ukraine: 90 UAH (70 UAH
// within Lviv). Heavier parts cost more at NP's tariff, so this is the
// typical "from" price; update it when Nova Poshta changes its tariffs.
export const SHIPPING_COUNTRY = "UA";
export const SHIPPING_SERVICE = "Нова Пошта";
export const SHIPPING_RATE_UAH = 90;
// Dispatch "usually within 1-2 days", then 1-2 working days in transit.
export const SHIPPING_HANDLING_DAYS = { min: 0, max: 2 } as const;
export const SHIPPING_TRANSIT_DAYS = { min: 1, max: 2 } as const;

export const buildOfferShippingDetails = () => ({
  "@type": "OfferShippingDetails",
  shippingRate: {
    "@type": "MonetaryAmount",
    value: SHIPPING_RATE_UAH,
    currency: "UAH",
  },
  shippingDestination: {
    "@type": "DefinedRegion",
    addressCountry: SHIPPING_COUNTRY,
  },
  deliveryTime: {
    "@type": "ShippingDeliveryTime",
    handlingTime: {
      "@type": "QuantitativeValue",
      minValue: SHIPPING_HANDLING_DAYS.min,
      maxValue: SHIPPING_HANDLING_DAYS.max,
      unitCode: "DAY",
    },
    transitTime: {
      "@type": "QuantitativeValue",
      minValue: SHIPPING_TRANSIT_DAYS.min,
      maxValue: SHIPPING_TRANSIT_DAYS.max,
      unitCode: "DAY",
    },
  },
});
