import "server-only";

import ProductCompactRecommendationCard from "app/components/ProductCompactRecommendationCard";
import { getSimilarProducts } from "app/lib/product-related";
import { resolveWithTimeout } from "app/lib/resolve-with-timeout";
import { buildProductPath, buildVisibleProductName } from "app/lib/product-url";

const PRODUCT_SIMILAR_INITIAL_TIMEOUT_MS = 220;

type ProductSimilarItemsSectionProps = {
  product: {
    code: string;
    article: string;
    name?: string;
    producer?: string;
    group?: string;
    subGroup?: string;
    category?: string;
  };
  euroRate?: number;
};

const formatPriceLabel = (priceEuro: number | null | undefined, euroRate: number) => {
  if (
    typeof priceEuro !== "number" ||
    !Number.isFinite(priceEuro) ||
    priceEuro <= 0 ||
    !Number.isFinite(euroRate) ||
    euroRate <= 0
  ) {
    return "Ціну уточнити";
  }

  return `${Math.round(priceEuro * euroRate).toLocaleString("uk-UA")} грн`;
};

const buildDirectProductPath = (item: ProductSimilarItemsAwaited[number]) =>
  buildProductPath({
    code: item.code,
    article: item.article,
    name: item.name,
    producer: item.producer,
    group: item.group,
    subGroup: item.subGroup,
    category: item.category,
  });

type ProductSimilarItemsAwaited = Awaited<ReturnType<typeof getSimilarProducts>>;

export default async function ProductSimilarItemsSection({
  product,
  euroRate = 50,
}: ProductSimilarItemsSectionProps) {
  const items = await resolveWithTimeout(
    () =>
      getSimilarProducts(
        product.article,
        product.code,
        product.name,
        product.producer,
        product.group,
        product.subGroup,
        product.category
      ),
    [] as ProductSimilarItemsAwaited,
    PRODUCT_SIMILAR_INITIAL_TIMEOUT_MS
  );

  if (!Array.isArray(items) || items.length === 0) return null;
  const visibleItems = items.slice(0, 6);
  const listClass =
    visibleItems.length > 2
      ? "mt-3 grid grid-rows-2 auto-cols-[minmax(260px,88%)] grid-flow-col gap-2 overflow-x-auto overscroll-x-contain pb-2 text-left snap-x snap-mandatory [scrollbar-width:thin] sm:auto-cols-[minmax(320px,72%)] sm:gap-2.5 lg:auto-cols-full"
      : "mt-3 grid grid-rows-1 auto-cols-[minmax(260px,88%)] grid-flow-col gap-2 overflow-x-auto overscroll-x-contain pb-1 text-left snap-x snap-mandatory [scrollbar-width:thin] sm:auto-cols-[minmax(320px,72%)] sm:gap-2.5 lg:auto-cols-full";

  const categoryLabel = buildVisibleProductName(
    product.subGroup || product.group || product.category || ""
  );
  const sectionTitle =
    categoryLabel && categoryLabel !== "Товар"
      ? `Схожі товари з розділу ${categoryLabel}`
      : "Схожі товари з цієї категорії";

  return (
    <section className="overflow-hidden rounded-[22px] border border-sky-100 bg-[linear-gradient(145deg,rgba(255,255,255,0.99),rgba(240,249,255,0.94),rgba(255,255,255,0.98))] p-3 text-left shadow-[0_18px_42px_rgba(15,23,42,0.07)] ring-1 ring-white/80 sm:rounded-[24px] sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-900/8 pb-3">
        <div className="min-w-0 max-w-3xl">
          <p className="mb-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-sky-800">
            Та сама група або підгрупа
          </p>
          <h2 className="font-display-italic mt-0.5 break-words text-[1.05rem] font-black leading-tight text-slate-950 sm:text-[1.2rem]">
            {sectionTitle}
          </h2>
        </div>
        <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.09em] text-sky-800">
          {items.length} позицій
        </span>
      </div>

      <div className={listClass}>
        {visibleItems.map((item) => {
          const priceLabel = formatPriceLabel(item.priceEuro, euroRate);

          return (
            <ProductCompactRecommendationCard
              key={`${item.code}-${item.article}-${item.name}`}
              href={buildDirectProductPath(item)}
              item={item}
              priceLabel={priceLabel}
            />
          );
        })}
      </div>
    </section>
  );
}
