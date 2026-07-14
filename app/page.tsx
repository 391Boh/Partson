import type { Metadata } from "next";

import { getFullManufacturersDirectoryData } from "app/lib/manufacturers-directory-data";
import { STORE_PHONE_SEO_LABEL, buildPageMetadata } from "app/lib/seo-metadata";
import HomePageContent from "./components/HomePageContent";

const homeTitle = "Інтернет-магазин автозапчастин у Львові";
const homeDescription = `PartsON — автозапчастини у Львові: великий асортимент, підбір за VIN, кодом чи артикулом, оригінали та аналоги, доставка по Україні. ${STORE_PHONE_SEO_LABEL}.`;

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
    url: "/og-image.png",
    alt: "Інтернет-магазин автозапчастин у Львові PartsON",
  },
  }),
  title: { absolute: `${homeTitle} | PartsON` },
};

export default async function HomePage() {
  // Same reasoning as the katalog producer picker (app/katalog/page.tsx):
  // resolve the real, synced brand list server-side and seed the client
  // carousel with it directly, instead of showing a smaller static list
  // that then visibly swaps a moment later once a client fetch resolves.
  const manufacturersData = await getFullManufacturersDirectoryData().catch(() => null);
  const initialSyncedBrands = (manufacturersData?.clientProducers ?? []).map((producer) => ({
    name: producer.label,
    logo: producer.logoPath,
    description: producer.description || "",
    productCount: producer.productCount,
    groupsCount: producer.groupsCount,
  }));

  return <HomePageContent initialSyncedBrands={initialSyncedBrands} />;
}
