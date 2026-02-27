import type { Metadata } from "next";

import HomePageClient from "./home-page-client";

export const metadata: Metadata = {
  title: "PartsON - Магазин автозапчастин",
  description:
    "Онлайн-каталог автозапчастин з актуальною наявністю, пошуком за кодом, артикулом і виробником.",
  alternates: {
    canonical: "/",
  },
  keywords: [
    "автозапчастини",
    "каталог автозапчастин",
    "купити запчастини",
    "пошук запчастин за кодом",
    "PartsON",
  ],
  openGraph: {
    type: "website",
    url: "/",
    title: "PartsON - Магазин автозапчастин",
    description:
      "Каталог автозапчастин з актуальною наявністю, цінами та швидким пошуком деталей.",
    images: [
      {
        url: "/Car-parts-fullwidth.png",
        alt: "PartsON автозапчастини",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PartsON - Магазин автозапчастин",
    description: "Каталог автозапчастин з наявністю та швидким підбором деталей.",
    images: ["/Car-parts-fullwidth.png"],
  },
};

export default function HomePage() {
  return <HomePageClient />;
}
