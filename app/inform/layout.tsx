import type { Metadata } from "next";
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

export default function InformLayout({ children }: { children: ReactNode }) {
  return children;
}
