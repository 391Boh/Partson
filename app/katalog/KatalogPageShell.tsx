import KatalogClientPage from "app/katalog/KatalogClientPage";

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

export default function KatalogPageShell(props: {
  initialPagePayload?: InitialCatalogPagePayload | null;
  initialQuerySignature?: string | null;
}) {
  return <KatalogClientPage {...props} />;
}
