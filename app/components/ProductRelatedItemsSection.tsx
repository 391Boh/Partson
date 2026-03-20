import Link from "next/link";

import type { CatalogProduct } from "app/lib/catalog-server";
import { findSimilarProductsBySubgroup } from "app/lib/catalog-server";

type ProductRelatedItemsSectionProps = {
  product: CatalogProduct;
};

const formatStockLabel = (quantity: number) =>
  quantity > 0 ? `В наявності ${quantity} шт.` : "Під замовлення";

export default async function ProductRelatedItemsSection({
  product,
}: ProductRelatedItemsSectionProps) {
  const similarProducts = await findSimilarProductsBySubgroup(product, {
    limit: 6,
    maxPages: 2,
    pageSize: 60,
  });

  if (similarProducts.length === 0) return null;

  const subgroupLabel =
    (product.subGroup || "").trim() ||
    (product.group || product.category || "").trim() ||
    "схожої групи";

  return (
    <section className="rounded-[22px] border border-slate-200 bg-white p-3.5 shadow-[0_18px_36px_rgba(15,23,42,0.06)] sm:rounded-[26px] sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-2.5 border-b border-slate-100 pb-3 sm:gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-sky-700">
            Схожі товари
          </p>
          <h2 className="font-display-italic mt-1 break-words text-lg font-black leading-tight tracking-[-0.04em] text-slate-900 sm:text-xl">
            Позиції з підгрупи “{subgroupLabel}”
          </h2>
        </div>
        <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-sky-700 sm:px-3 sm:text-[11px]">
          {similarProducts.length} варіантів
        </span>
      </div>

      <div className="mt-4 grid gap-2.5 md:grid-cols-2 xl:grid-cols-3 sm:gap-3">
        {similarProducts.map((item) => {
          const itemCode = encodeURIComponent(item.code || item.article || item.name);
          return (
            <Link
              key={`${item.code}-${item.article}-${item.name}`}
              href={`/product/${itemCode}`}
              className="group rounded-[20px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-3.5 shadow-[0_14px_26px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-[0_18px_34px_rgba(14,165,233,0.12)] sm:rounded-[22px] sm:p-4"
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

              <p className="mt-3 min-h-[60px] break-words text-[15px] font-extrabold leading-5 text-slate-900 sm:mt-4 sm:min-h-[72px] sm:text-[16px] sm:leading-6">
                {item.name}
              </p>

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
