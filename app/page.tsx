import type { Metadata } from "next";

import { buildPageMetadata } from "app/lib/seo-metadata";
import HomePageContent from "./components/HomePageContent";
import AdvantagesSection from "./components/AdvantagesSection";
import HomeDeferredStack from "./components/HomeDeferredStack";

const homeTitle = "Інтернет-магазин автозапчастин у Львові";
const homeDescription = "PartsON — автозапчастини у Львові: великий асортимент, підбір за VIN, кодом чи артикулом, оригінали та аналоги, доставка по Україні.";

export const revalidate = 86400;

export const metadata: Metadata = {
  ...buildPageMetadata({
  title: homeTitle,
  description: homeDescription,
  canonicalPath: "/",
  keywords: [
    "автозапчастини львів",
    "купити автозапчастини у львові",
    "магазин запчастин",
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
    url: "/opengraph-partson-v3.png",
    alt: "Інтернет-магазин автозапчастин у Львові PartsON",
  },
  }),
};

export default function HomePage() {
  // The interactive catalogue modules are intentionally not hydrated from a
  // page-sized server payload. HomeDeferredStack reserves their responsive
  // geometry and loads each module shortly before it reaches the viewport.
  // This keeps the hero response small and removes catalogue/brand lookups
  // from the homepage's critical rendering path.
  return (
    <HomePageContent>
      <HomeDeferredStack />
      <div className="home-section-stage home-section-stage-static">
        <AdvantagesSection />
      </div>
    </HomePageContent>
  );
}
