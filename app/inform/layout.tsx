import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getSiteUrl } from "app/lib/site-url";

const infoDescription =
  "Доставка, оплата, контакти та інформація про магазин автозапчастин PartsON.";

export const metadata: Metadata = {
  title: "Інформація для клієнтів",
  description: infoDescription,
  alternates: {
    canonical: "/inform",
  },
  openGraph: {
    type: "website",
    locale: "uk_UA",
    url: "/inform",
    title: "Інформація для клієнтів | PartsON",
    description: infoDescription,
    images: [{ url: "/Car-parts-fullwidth.png", alt: "Інформація PartsON" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Інформація для клієнтів | PartsON",
    description: infoDescription,
    images: ["/Car-parts-fullwidth.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

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
