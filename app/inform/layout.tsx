import type { Metadata } from "next";
import type { ReactNode } from "react";

import { buildPageMetadata } from "app/lib/seo-metadata";
import { getSiteUrl } from "app/lib/site-url";

const infoDescription =
  "Доставка, оплата, контакти, політика конфіденційності та інформація про магазин автозапчастин PartsON у Львові (вул. Перфецького, 8).";

export const metadata: Metadata = buildPageMetadata({
  title: "Інформація для клієнтів",
  description: infoDescription,
  canonicalPath: "/inform",
  keywords: [
    "доставка автозапчастин",
    "доставка автозапчастин львів",
    "оплата автозапчастин",
    "контакти магазину автозапчастин",
    "політика конфіденційності",
    "захист персональних даних",
    "магазин автозапчастин перфецького",
    "інформація для клієнтів",
  ],
  openGraphTitle: "Інформація для клієнтів | PartsON",
  image: {
    url: "/Car-parts-fullwidth.png",
    alt: "Інформація PartsON",
  },
});

export default function InformLayout({ children }: { children: ReactNode }) {
  const siteUrl = getSiteUrl();
  const infoPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: "Інформація про магазин PartsON",
    url: `${siteUrl}/inform`,
    description: infoDescription,
    isPartOf: {
      "@type": "WebSite",
      name: "PartsON",
      url: siteUrl,
    },
    mainEntity: {
      "@type": "AutoPartsStore",
      name: "PartsON",
      telephone: "+380634211851",
      email: "romaniukbboogg@gmail.com",
      address: {
        "@type": "PostalAddress",
        streetAddress: "вул. Перфецького, 8",
        addressLocality: "Львів",
        addressCountry: "UA",
      },
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(infoPageJsonLd) }}
      />
      {children}
    </>
  );
}
