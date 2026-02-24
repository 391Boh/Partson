import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import { getSiteUrl } from "app/lib/site-url";

export const metadata: Metadata = {
  title: "Інформація про магазин",
  description:
    "Інформація про магазин автозапчастин PartsON: доставка, оплата, контакти та локація.",
  alternates: {
    canonical: "/Inform",
  },
  openGraph: {
    type: "website",
    url: "/Inform",
    title: "Інформація про магазин | PartsON",
    description: "Доставка, оплата, контакти і локація PartsON.",
  },
};

export default async function InformLayout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  const siteUrl = getSiteUrl({ headers: requestHeaders });

  const infoPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: "Інформація про магазин PartsON",
    url: `${siteUrl}/Inform`,
    description:
      "Доставка, оплата, контакти та локація магазину автозапчастин PartsON.",
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
