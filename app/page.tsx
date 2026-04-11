import type { Metadata } from "next";

import { buildPageMetadata } from "app/lib/seo-metadata";
import HomePageContent from "./components/HomePageContent";

const homeTitle = "Магазин і каталог автозапчастин у Львові";
const homeDescription =
  "Купити автозапчастини в PartsON: каталог деталей за кодом, артикулом, VIN і виробником з доставкою по Львову та Україні.";

export const metadata: Metadata = buildPageMetadata({
  title: homeTitle,
  description: homeDescription,
  canonicalPath: "/",
  keywords: [
    "магазин автозапчастин львів",
    "каталог автозапчастин",
    "купити автозапчастини",
    "підбір автозапчастин за кодом",
    "автозапчастини з доставкою",
  ],
  openGraphTitle: `${homeTitle} | PartsON`,
  image: {
    url: "/Car-parts-fullwidth.png",
    alt: "Магазин і каталог автозапчастин PartsON",
  },
});

export default function HomePage() {
  return <HomePageContent />;
}
