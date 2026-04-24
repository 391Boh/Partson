import type { Metadata } from "next";

import { buildPageMetadata } from "app/lib/seo-metadata";
import HomePageContent from "./components/HomePageContent";

const homeTitle = "Інтернет-магазин автозапчастин у Львові";
const homeDescription =
  "Купити автозапчастини у Львові в PartsON (вул. Перфецького, 8): каталог деталей за кодом, артикулом, VIN і виробником з доставкою по Львову та Україні.";

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
