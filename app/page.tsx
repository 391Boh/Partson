import type { Metadata } from "next";

import { getProductTreeNodes } from "app/lib/product-tree";
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
  // Seed the quick-search block from the server's six-hour product-tree cache.
  // Without this, reaching the section starts two sequential client requests
  // to 1C (version, then tree), so the block appears to stall during scroll.
  const resolvedProductTree = await getProductTreeNodes().catch(() => []);
  const initialProductTree = resolvedProductTree.length > 0
    ? resolvedProductTree
    : undefined;

  return <HomePageContent initialProductTree={initialProductTree} />;
}
