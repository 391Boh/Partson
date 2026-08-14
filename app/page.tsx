import type { Metadata } from "next";

import { buildSeoContactLine, buildPageMetadata } from "app/lib/seo-metadata";
import HomePageContent from "./components/HomePageContent";
import AdvantagesSection from "./components/AdvantagesSection";
import HomeDeferredStack from "./components/HomeDeferredStack";

const homeTitle = "Інтернет-магазин автозапчастин у Львові";
const homeDescription = `${buildSeoContactLine()} PartsON — автозапчастини у Львові: великий асортимент, підбір за VIN, кодом чи артикулом, оригінали та аналоги, доставка по Україні.`;

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
    url: "/opengraph-partson-v2.png",
    alt: "Інтернет-магазин автозапчастин у Львові PartsON",
  },
  }),
};

export default function HomePage() {
  // Keep the complete page structure stable from the first HTML response.
  // A streamed, page-sized fallback previously got replaced after first paint;
  // its estimated heights diverged from the real responsive sections and was
  // the dominant source of homepage CLS. Lower interactive sections still
  // fetch their data lazily through their existing client caches.
  return (
    <HomePageContent>
      <HomeDeferredStack />
      <div className="home-section-stage">
        <AdvantagesSection />
      </div>
    </HomePageContent>
  );
}
