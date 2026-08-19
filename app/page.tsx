import type { Metadata } from "next";

import { getFullManufacturersDirectoryData } from "app/lib/manufacturers-directory-data";
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

export default async function HomePage() {
  // Same cached lookup already used by /manufacturers and the
  // /api/manufacturer-counts route (unstable_cache-backed, reads the
  // pre-generated SEO snapshot — not a live 1C call), so this doesn't add a
  // slow request to the page. Feeding it in as initialSyncedBrands lets
  // Brands.tsx skip its own client-side fetch to that same endpoint, which
  // previously left every brand tile showing zero counts until that request
  // resolved after hydration — the "manufacturers load slowly the first
  // time" symptom.
  const { clientProducers } = await getFullManufacturersDirectoryData().catch(
    () => ({ clientProducers: [] })
  );
  const initialSyncedBrands = clientProducers.map((producer) => ({
    name: producer.label,
    logo: producer.logoPath,
    description: producer.description || `${producer.label} у каталозі PartsON.`,
    productCount: producer.productCount,
    groupsCount: producer.groupsCount,
  }));

  // Keep the complete page structure stable from the first HTML response.
  // A streamed, page-sized fallback previously got replaced after first paint;
  // its estimated heights diverged from the real responsive sections and was
  // the dominant source of homepage CLS. Lower interactive sections still
  // fetch their data lazily through their existing client caches.
  return (
    <HomePageContent>
      <HomeDeferredStack initialSyncedBrands={initialSyncedBrands} />
      <div className="home-section-stage">
        <AdvantagesSection />
      </div>
    </HomePageContent>
  );
}
