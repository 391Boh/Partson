"use client";

import AnalogProductThumb from "app/components/AnalogProductThumb";
import SmartLink from "app/components/SmartLink";
import { buildProductImagePath } from "app/lib/product-image-path";
import { buildVisibleProductName } from "app/lib/product-url";

type ProductCompactRecommendationCardProps = {
  href: string;
  item: {
    code: string;
    article: string;
    name: string;
    producer: string;
    quantity: number;
    hasPhoto?: boolean;
  };
  priceLabel: string;
  sourceArticle?: string;
  imagePriority?: boolean;
  prefetchedImageSrc?: string;
};

const cardClass =
  "group relative grid h-[112px] min-w-0 snap-start grid-cols-[48px_minmax(0,1fr)] items-center gap-2 overflow-hidden rounded-[15px] border border-slate-200/90 bg-[linear-gradient(145deg,#ffffff,#f8fbff_62%,#eef8ff)] p-2 pb-8 text-left shadow-[0_8px_18px_rgba(15,23,42,0.055)] ring-1 ring-white/80 transition-[box-shadow,border-color] duration-200 hover:border-sky-300 hover:shadow-[0_12px_24px_rgba(14,165,233,0.12)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-200/80 sm:h-[86px] sm:grid-cols-[48px_minmax(0,1fr)_auto] sm:p-2 lg:h-[88px]";

const stockLabel = (quantity: number) =>
  quantity > 0 ? `${quantity} шт.` : "Під замовлення";

export default function ProductCompactRecommendationCard({
  href,
  item,
  priceLabel,
  sourceArticle = "",
  imagePriority = false,
  prefetchedImageSrc = "",
}: ProductCompactRecommendationCardProps) {
  const visibleName = buildVisibleProductName(item.name);
  const imageCode = item.code || item.article || sourceArticle;
  const imageArticle = item.article || item.code || sourceArticle;
  const imageSrc =
    prefetchedImageSrc || buildProductImagePath(imageCode, imageArticle, { catalog: true });
  const hasPrice = priceLabel !== "Ціну уточнити";

  return (
    <SmartLink
      href={href}
      prefetchOnIntent
      prefetchOnViewport={imagePriority}
      className={cardClass}
    >
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[13px] border border-slate-200 bg-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_7px_14px_rgba(15,23,42,0.055)]">
        <AnalogProductThumb
          src={imageSrc}
          alt={visibleName}
          productCode={imageCode}
          articleHint={imageArticle}
          pending={false}
          loading={imagePriority ? "eager" : "lazy"}
          fetchPriority={imagePriority ? "high" : "auto"}
        />
      </div>

      <div className="min-w-0 self-center">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <span className="max-w-full truncate rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-[0.04em] text-slate-500">
            {item.producer || "Товар"}
          </span>
          <span
            className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.03em] ${
              item.quantity > 0
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-amber-200 bg-amber-50 text-amber-700"
            }`}
          >
            {stockLabel(item.quantity)}
          </span>
        </div>

        <p className="mt-1 line-clamp-3 break-words text-[11.5px] font-extrabold leading-[1.12] text-slate-950 sm:line-clamp-2 sm:text-[11.5px] lg:text-[12px]">
          {visibleName}
        </p>

        <p className="mt-0.5 truncate text-[10px] font-bold leading-4 text-slate-600">
          {item.article || item.code}
        </p>
      </div>

      <span
        className={`absolute bottom-2 right-2 inline-flex max-w-[54%] items-center rounded-[10px] border px-2 py-1 text-[10px] font-black leading-none shadow-[0_7px_14px_rgba(14,165,233,0.1)] sm:hidden ${
          hasPrice
            ? "border-sky-300 bg-[linear-gradient(180deg,#eff9ff,#dff4ff)] text-sky-900"
            : "border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f1f5f9)] text-slate-500"
        }`}
      >
        <span className="truncate tabular-nums">{priceLabel}</span>
      </span>

      <span
        className={`hidden min-h-[46px] w-[78px] shrink-0 flex-col items-center justify-center rounded-[12px] border px-1.5 py-1 text-center shadow-[0_6px_12px_rgba(14,165,233,0.09)] ring-1 ring-white/80 sm:inline-flex ${
          hasPrice
            ? "border-sky-300 bg-[linear-gradient(180deg,#f0f9ff,#dff4ff)] text-sky-900"
            : "border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f8fafc)] text-slate-500"
        }`}
      >
        <span className="text-[8px] font-black uppercase tracking-[0.1em] text-slate-500">
          Ціна
        </span>
        <span className="mt-0.5 max-w-full truncate text-[10.5px] font-black leading-none tabular-nums sm:text-[11.5px]">
          {priceLabel}
        </span>
      </span>
    </SmartLink>
  );
}
