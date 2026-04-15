"use client";

import dynamic from "next/dynamic";

import PageLoadingShell from "app/components/PageLoadingShell";

type InitialCatalogPagePayload = {
  items: Array<{
    code: string;
    article: string;
    name: string;
    producer: string;
    quantity: number;
    priceEuro?: number | null;
    group?: string;
    subGroup?: string;
    category?: string;
    hasPhoto?: boolean;
  }>;
  prices?: Record<string, number | null>;
  images?: Record<string, string>;
  hasMore?: boolean;
  nextCursor?: string;
  serviceUnavailable?: boolean;
  message?: string;
};

const KatalogClientPage = dynamic(() => import("app/katalog/KatalogClientPage"), {
  ssr: false,
  loading: () => (
    <PageLoadingShell label="Завантаження каталогу..." cardsCount={6} />
  ),
});

export default function KatalogPageShell(props: {
  initialPagePayload?: InitialCatalogPagePayload | null;
  initialQuerySignature?: string | null;
}) {
  return <KatalogClientPage {...props} />;
}
