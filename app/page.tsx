import type { Metadata } from "next";

import { appendSeoContact, buildPageMetadata } from "app/lib/seo-metadata";
import HomePageContent from "./components/HomePageContent";

const homeTitle = "Інтернет-магазин автозапчастин у Львові";
const homeDescription = appendSeoContact(
  "PartsON - автозапчастини у Львові з онлайн-каталогом, цінами й наявністю. Підбір за VIN, кодом, артикулом і виробником, самовивіз та доставка по Україні."
);

export const revalidate = 86400;

export const metadata: Metadata = buildPageMetadata({
  title: homeTitle,
  description: homeDescription,
  canonicalPath: "/",
  keywords: [
    "автозапчастини львів",
    "купити автозапчастини у львові",
    "магазин запчастин",
    "магазин зачастин",
    "магазин автозапчастин львів",
    "магазин автозапчастин перфецького",
    "доставка автозапчастин львів",
    "каталог автозапчастин",
    "каталог запчастин онлайн",
    "купити автозапчастини",
    "підбір автозапчастин за кодом",
    "підбір запчастин за vin",
    "автозапчастини за артикулом",
    "оригінальні автозапчастини",
    "аналоги автозапчастин",
    "автозапчастини з доставкою",
    "автозапчастини україна",
  ],
  openGraphTitle: `${homeTitle} | PartsON`,
  image: {
    url: "/Car-parts-fullwidth.png",
    alt: "Інтернет-магазин автозапчастин у Львові PartsON",
  },
});

export default function HomePage() {
  return <HomePageContent />;
}
