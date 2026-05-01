import "server-only";

import Link from "next/link";

import AnalogProductThumb from "app/components/AnalogProductThumb";
import { buildProductImagePath } from "app/lib/product-image-path";
import { getSimilarProducts } from "app/lib/product-related";
import { resolveWithTimeout } from "app/lib/resolve-with-timeout";
import { buildProductPath, buildVisibleProductName } from "app/lib/product-url";

const PRODUCT_SIMILAR_INITIAL_TIMEOUT_MS = 650;

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

const formatStockLabel = (quantity: number) =>
  quantity > 0 ? `В наявності ${quantity} шт.` : "Під замовлення";

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
  const visibleItems = items.slice(0, 8);

  const categoryLabel = buildVisibleProductName(
    product.subGroup || product.group || product.category || ""
  );
  const visibleProductName = buildVisibleProductName(product.name || "");
  const sectionTitle =
    categoryLabel && categoryLabel !== "Товар"
      ? `Схожі товари з розділу ${categoryLabel}`
      : "Схожі товари з цієї категорії";
  const sectionSummary =
    categoryLabel && categoryLabel !== "Товар"
      ? `Підібрали товари з тієї самої категорії ${categoryLabel}, щоб було легше порівняти доступні позиції, бренди та наявність.`
      : `Зібрали товари з цієї ж групи, щоб швидше знайти суміжні позиції для ${visibleProductName || "обраної запчастини"}.`;

  return (
    <section className="overflow-hidden rounded-[22px] border border-slate-900/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.99),rgba(242,247,252,0.96),rgba(255,255,255,0.97))] p-3 text-left shadow-[0_18px_36px_rgba(15,23,42,0.06)] sm:rounded-[24px] sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-900/8 pb-2">
        <div className="min-w-0 max-w-3xl">
          <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-700 mb-0.5">
            Та сама група або підгрупа
          </p>
          <h2 className="font-display-italic mt-0.5 break-words text-[0.98rem] font-black leading-tight tracking-[-0.035em] text-slate-950 sm:text-[1.08rem]">
            {sectionTitle}
          </h2>
          <p className="mt-1 max-w-2xl text-[12px] font-medium leading-5 text-slate-600 sm:text-xs sm:leading-5">
            {sectionSummary}
          </p>
        </div>
        <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.09em] text-slate-700 sm:text-[10px]">
          {items.length} позицій
        </span>
      </div>

      <div className="mt-2 grid gap-2 text-left lg:grid-cols-2 2xl:grid-cols-4">
        {visibleItems.map((item) => {
          const imageCode = item.code || item.article;
          const imageArticle = item.article || item.code;
          const imageSrc = buildProductImagePath(imageCode, imageArticle, {
            catalog: true,
          });
          const retryImageSrc = buildProductImagePath(imageCode, imageArticle, {
            catalog: true,
            retryToken: 1,
          });
          const finalRetryImageSrc = buildProductImagePath(imageCode, imageArticle, {
            catalog: true,
            retryToken: 2,
          });
          const itemName = buildVisibleProductName(item.name);
          const itemCategoryLabel = item.subGroup || item.group || item.category || "";
          const priceLabel = formatPriceLabel(item.priceEuro, euroRate);
          const hasPrice = priceLabel !== "Ціну уточнити";

          return (
            <Link
              key={`${item.code}-${item.article}-${item.name}`}
              href={buildDirectProductPath(item)}
              prefetch={false}
              className="group flex min-h-[174px] flex-col rounded-[16px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(247,250,253,1))] p-2.5 text-left shadow-[0_12px_24px_rgba(15,23,42,0.04)] transition-[transform,box-shadow,border-color,background-image] duration-300 hover:-translate-y-0.5 hover:border-sky-200 hover:bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(237,246,252,1))] hover:shadow-[0_16px_30px_rgba(14,165,233,0.1)] sm:rounded-[18px]"
            >
              <div className="flex items-start gap-2.5">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[14px] border border-slate-200 bg-gray-200 sm:h-16 sm:w-16">
                  <AnalogProductThumb
                    src={imageSrc}
                    alt={itemName}
                    disableDirectFetch
                    retrySrc={retryImageSrc}
                    finalRetrySrc={finalRetryImageSrc}
                    productCode={imageCode}
                    articleHint={imageArticle}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex min-w-0 max-w-full rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.07em] text-slate-500 [overflow-wrap:anywhere] sm:text-[10px]">
                      {item.producer || "Товар"}
                    </span>
                    <span
                      className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.07em] sm:text-[10px] ${
                        item.quantity > 0
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                      }`}
                    >
                      {formatStockLabel(item.quantity)}
                    </span>
                  </div>

                  <p className="mt-1.5 line-clamp-2 break-words text-[13px] font-extrabold leading-[1.25] text-slate-900 sm:text-[14px]">
                    {itemName}
                  </p>

                  {itemCategoryLabel ? (
                    <p className="mt-1 line-clamp-1 text-[11px] font-medium leading-4 text-slate-500 sm:text-[12px]">
                      {itemCategoryLabel}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="mt-auto grid gap-2 border-t border-slate-100 pt-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div className="min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-[0.11em] text-slate-500">
                    Артикул / код
                  </p>
                  <p className="mt-0.5 break-all text-[12px] font-bold leading-4 text-slate-700 sm:text-[13px]">
                    {item.article || item.code}
                  </p>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 sm:mt-0 sm:block sm:text-right">
                  <span
                    className={`inline-flex min-h-8 items-center rounded-[12px] border px-3 py-1.5 text-[13px] font-black leading-none tabular-nums shadow-[0_8px_18px_rgba(14,165,233,0.10)] ring-1 ring-white/80 ${
                      hasPrice
                        ? "border-sky-300 bg-[linear-gradient(180deg,#f0f9ff,#e0f2fe)] text-sky-900"
                        : "border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f8fafc)] text-slate-500"
                    }`}
                  >
                    {priceLabel}
                  </span>
                  <span className="inline-flex items-center text-[12px] font-extrabold text-sky-700 transition group-hover:translate-x-0.5 sm:mt-1">
                    Перейти →
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
