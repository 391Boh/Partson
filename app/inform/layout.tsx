import type { Metadata } from "next";
import { Onest } from "next/font/google";
import type { ReactNode } from "react";

import { appendSeoContact, buildPageMetadata } from "app/lib/seo-metadata";

const infoDescription = appendSeoContact(
  "Інформація PartsON: доставка, оплата, контакти, повернення, гарантія, локація магазину та комп'ютерна діагностика авто у Львові."
);

const baseMetadata = buildPageMetadata({
  title: "Інформація для клієнтів",
  description: infoDescription,
  canonicalPath: "/inform",
  keywords: [
    "доставка автозапчастин",
    "доставка автозапчастин львів",
    "оплата автозапчастин",
    "контакти магазину автозапчастин",
    "комп'ютерна діагностика авто львів",
    "діагностика авто львів",
    "OBD діагностика Львів",
    "політика конфіденційності",
    "захист персональних даних",
    "магазин автозапчастин перфецького",
    "інформація для клієнтів",
  ],
  openGraphTitle: "Інформація для клієнтів | PartsON",
  image: {
    url: "/opengraph-partson-v3.png",
    alt: "Інформація PartsON",
  },
});

// A plain-string title here would replace the root "%s | PartsON" template
// for every /inform/* page, leaving their titles without the brand.
export const metadata: Metadata = {
  ...baseMetadata,
  title: { default: "Інформація для клієнтів", template: "%s | PartsON" },
};

// Reading face for the info pages' long-form text (headings stay in the
// site's Exo 2). Onest is drawn for Cyrillic body copy; next/font self-hosts
// it at build time, so the browser never contacts Google (CSP font-src
// 'self' still holds).
const readingFont = Onest({
  subsets: ["cyrillic", "latin"],
  display: "swap",
  variable: "--font-reading",
});

export default function InformLayout({ children }: { children: ReactNode }) {
  return <div className={readingFont.variable}>{children}</div>;
}
