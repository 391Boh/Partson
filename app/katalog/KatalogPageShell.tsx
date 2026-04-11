"use client";

import dynamic from "next/dynamic";

import PageLoadingShell from "app/components/PageLoadingShell";

const KatalogClientPage = dynamic(() => import("app/katalog/KatalogClientPage"), {
  ssr: false,
  loading: () => (
    <PageLoadingShell label="Завантаження каталогу..." cardsCount={6} />
  ),
});

export default function KatalogPageShell() {
  return <KatalogClientPage />;
}
