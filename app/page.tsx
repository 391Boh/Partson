import type { Metadata } from "next";

import HomePageClient from "./home-page-client";

export const metadata: Metadata = {
  title: "PartsON - Auto Parts Store",
  description:
    "Online auto parts catalog with stock status, code search, and fast ordering.",
  alternates: {
    canonical: "/",
  },
  keywords: [
    "auto parts",
    "auto parts catalog",
    "buy auto parts",
    "parts by code",
    "PartsON",
  ],
  openGraph: {
    type: "website",
    url: "/",
    title: "PartsON - Auto Parts Store",
    description:
      "Current auto parts catalog with search by code, article, and manufacturer.",
    images: [
      {
        url: "/Car-parts-fullwidth.png",
        alt: "PartsON auto parts",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PartsON - Auto Parts Store",
    description:
      "Auto parts catalog with availability and fast part lookup.",
    images: ["/Car-parts-fullwidth.png"],
  },
};

export default function HomePage() {
  return <HomePageClient />;
}
