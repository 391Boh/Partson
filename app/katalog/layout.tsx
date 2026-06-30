import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { appendSeoContact } from "app/lib/seo-metadata";

const katalogDescription = appendSeoContact(
  "Каталог PartsON: автозапчастини за кодом, артикулом, виробником і категорією, ціни та наявність онлайн. VIN-підбір, самовивіз і доставка по Україні."
);

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0ea5e9" },
    { media: "(prefers-color-scheme: dark)", color: "#0369a1" },
  ],
  colorScheme: "light dark",
};

export const metadata: Metadata = {
  title: "Каталог автозапчастин",
  description: katalogDescription,
  keywords: [
    "каталог автозапчастин",
    "автозапчастини львів",
    "магазин запчастин",
    "магазин автозапчастин перфецького",
    "доставка автозапчастин львів",
  ],
  alternates: {
    canonical: "/katalog",
  },
  openGraph: {
    type: "website",
    locale: "uk_UA",
    url: "/katalog",
    title: "Каталог автозапчастин | PartsON",
    description: katalogDescription,
    images: [{ url: "/Car-parts-fullwidth.png", alt: "Каталог автозапчастин PartsON" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Каталог автозапчастин | PartsON",
    description: katalogDescription,
    images: ["/Car-parts-fullwidth.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function KatalogLayout({ children }: { children: ReactNode }) {
  return children;
}
