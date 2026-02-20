import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Каталог автозапчастин",
  description:
    "Пошук і підбір автозапчастин за назвою, кодом або артикулом. Актуальна наявність і ціни.",
  alternates: {
    canonical: "/katalog",
  },
};

export default function KatalogLayout({ children }: { children: ReactNode }) {
  return children;
}
