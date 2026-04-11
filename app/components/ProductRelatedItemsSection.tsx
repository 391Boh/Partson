import Link from "next/link";

import type { CatalogProduct } from "app/lib/catalog-server";
import { fetchCatalogProductsByHeaderSearchQuery } from "app/lib/catalog-server";
import { getProductImagePath } from "app/lib/product-image";
import AnalogProductThumb from "app/components/AnalogProductThumb";

type ProductRelatedItemsSectionProps = {
  product: CatalogProduct;
};

const formatStockLabel = (quantity: number) =>
  quantity > 0 ? `В наявності ${quantity} шт.` : "Під замовлення";

const buildVisibleProductName = (value: string) => {
  const source = (value || "").trim();
  if (!source) return "Товар";

  const cleaned = source.replace(/\s*\([^)]*\)/g, "").replace(/\s{2,}/g, " ").trim();
  return cleaned || source;
};

const buildDirectProductPath = (item: CatalogProduct) => {
  const productCode = (item.code || item.article || "").trim();
  if (!productCode) return "/katalog";
  return `/product/${encodeURIComponent(productCode)}`;
};

export default async function ProductRelatedItemsSection({
  product,
}: ProductRelatedItemsSectionProps) {
  const articleLabel = (product.article || "").trim();
  if (!articleLabel) return null;
  const targetCode = (product.code || "").trim().toLowerCase();
  const targetArticle = articleLabel.toLowerCase();
  const fetchedBySearch = await fetchCatalogProductsByHeaderSearchQuery(articleLabel, {
    limit: 36,
  });
  const analogProducts = fetchedBySearch
    .filter((item) => {
      const itemCode = (item.code || "").trim().toLowerCase();
      const itemArticle = (item.article || "").trim().toLowerCase();
      if (itemCode && targetCode && itemCode === targetCode) return false;
      if (itemArticle && targetArticle && itemArticle === targetArticle) return false;
      return true;
    })
    .slice(0, 6);

  if (analogProducts.length === 0) return null;

  return (
    <section className="rounded-[22px] border border-slate-200 bg-white p-3.5 shadow-[0_18px_36px_rgba(15,23,42,0.06)] sm:rounded-[26px] sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-2.5 border-b border-slate-100 pb-3 sm:gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-sky-700">
            Аналоги
          </p>
          <h2 className="font-display-italic mt-1 break-words text-lg font-black leading-tight tracking-[-0.04em] text-slate-900 sm:text-xl">
            Аналоги за запитом “{articleLabel}”
          </h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            Пошук виконано тією ж логікою, що і в полі пошуку в шапці: спочатку по назві, далі fallback по артикулу/коду.
          </p>
        </div>
        <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-sky-700 sm:px-3 sm:text-[11px]">
          {analogProducts.length} варіантів
        </span>
      </div>

      <div className="mt-4 grid gap-2.5 md:grid-cols-2 xl:grid-cols-3 sm:gap-3">
        {analogProducts.map((item) => {
          const visibleItemName = buildVisibleProductName(item.name);
          return (
            <Link
              key={`${item.code}-${item.article}-${item.name}`}
              href={buildDirectProductPath(item)}
              className="group rounded-[20px] border border-slate-200 bg-[image:linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-3.5 shadow-[0_14px_26px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-[0_18px_34px_rgba(14,165,233,0.12)] sm:rounded-[22px] sm:p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex min-w-0 max-w-[48%] rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500 [overflow-wrap:anywhere]">
                  {item.producer || "Товар"}
                </span>
                <span
                  className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${
                    item.quantity > 0
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                  }`}
                >
                  {formatStockLabel(item.quantity)}
                </span>
              </div>

              <div className="mt-3 flex items-start gap-3 sm:mt-4">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 sm:h-16 sm:w-16">
                  <AnalogProductThumb
                    src={getProductImagePath(item.code, item.article || articleLabel)}
                    alt={visibleItemName}
                  />
                </div>
                <p className="min-h-[60px] break-words text-[15px] font-extrabold leading-5 text-slate-900 sm:min-h-[72px] sm:text-[16px] sm:leading-6">
                  {visibleItemName}
                </p>
              </div>

              <div className="mt-3 flex items-end justify-between gap-3 sm:mt-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                    Артикул / код
                  </p>
                  <p className="mt-1 truncate text-sm font-bold text-slate-700">
                    {item.article || item.code}
                  </p>
                </div>
                <span className="text-sm font-extrabold text-sky-700 transition group-hover:translate-x-0.5">
                  Переглянути →
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
