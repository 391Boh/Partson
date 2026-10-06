import type { Metadata } from "next";

import { CRITICAL_CSS_PRECEDENCE, resolveCriticalCssHref } from "app/lib/critical-css";
import { buildPageMetadata } from "app/lib/seo-metadata";
import HomePageContent from "./components/HomePageContent";
import AdvantagesSection from "./components/AdvantagesSection";
import HomeDeferredStack from "./components/HomeDeferredStack";

// The root page shares the root layout's segment, so the layout's
// "%s | PartsON" title template doesn't apply here — name the brand directly.
const homeTitle = "Автозапчастини у Львові — каталог і підбір за VIN | PartsON";
const homeDescription = "Купити автозапчастини у PartsON: підбір за VIN та артикулом, оригінали й аналоги для ТО та ремонту. Самовивіз на Перфецького, 8 у Львові, доставка по Україні.";

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
  openGraphTitle: homeTitle,
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
  // Above-the-fold styles only (~27 KB gzip instead of the full ~90 KB):
  // React hoists this render-blocking <link> into <head>, and the root
  // layout's stylesheet loader sees it and fetches the full stylesheet
  // without blocking first paint. Without the file the full stylesheet stays
  // render-blocking, as on every other page.
  const criticalCssHref = resolveCriticalCssHref("home");

  return (
    <HomePageContent>
      {criticalCssHref ? (
        <link rel="stylesheet" href={criticalCssHref} precedence={CRITICAL_CSS_PRECEDENCE} />
      ) : null}
      <HomeDeferredStack />
      <div className="home-section-stage home-section-stage-static">
        <AdvantagesSection />
      </div>
    </HomePageContent>
  );
}
