import type { Metadata } from "next";
import type { ReactNode } from "react";

const katalogDescription =
  "Каталог автозапчастин PartsON з пошуком за кодом, артикулом, виробником та актуальною наявністю.";

export const metadata: Metadata = {
  title: "Каталог автозапчастин",
  description: katalogDescription,
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

