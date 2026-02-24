import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Каталог автозапчастин",
  description:
    "Пошук і підбір автозапчастин за назвою, кодом, артикулом, групою товарів та виробником.",
  alternates: {
    canonical: "/katalog",
  },
  openGraph: {
    type: "website",
    url: "/katalog",
    title: "Каталог автозапчастин | PartsON",
    description:
      "Підбір запчастин з актуальною наявністю, цінами та фільтрами за групами і виробниками.",
  },
};

export default function KatalogLayout({ children }: { children: ReactNode }) {
  return children;
}
