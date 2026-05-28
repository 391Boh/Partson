"use client";

import Link from "next/link";

import AnalogProductThumb from "app/components/AnalogProductThumb";
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
  };
  priceLabel: string;
  sourceArticle?: string;
};

const cardClass =
  "group grid h-[92px] min-w-0 grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2 overflow-hidden rounded-[14px] border border-slate-200/90 bg-[linear-gradient(180deg,#ffffff,#f8fbff)] p-2 text-left shadow-[0_8px_18px_rgba(15,23,42,0.05)] ring-1 ring-white/80 transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-[0_14px_26px_rgba(14,165,233,0.11)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-200/80 sm:h-[88px] sm:grid-cols-[48px_minmax(0,1fr)_auto]";

const stockLabel = (quantity: number) =>
  quantity > 0 ? `${quantity} шт.` : "Під замовлення";

export default function ProductCompactRecommendationCard({
  href,
  item,
  priceLabel,
  sourceArticle = "",
}: ProductCompactRecommendationCardProps) {
  const visibleName = buildVisibleProductName(item.name);
  const imageCode = item.code || item.article || sourceArticle;
  const imageArticle = item.article || item.code || sourceArticle;
  const imageSrc = buildProductImagePath(imageCode, imageArticle, { catalog: true });
  const retryImageSrc = buildProductImagePath(imageCode, imageArticle, {
    catalog: true,
    retryToken: 1,
  });
  const finalRetryImageSrc = buildProductImagePath(imageCode, imageArticle, {
    catalog: true,
    retryToken: 2,
  });
  const hasPrice = priceLabel !== "Ціну уточнити";

  return (
    <Link href={href} prefetch={false} className={cardClass}>
      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[12px] border border-slate-200 bg-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] sm:h-12 sm:w-12">
        <AnalogProductThumb
          src={imageSrc}
          alt={visibleName}
          disableDirectFetch
          retrySrc={retryImageSrc}
          finalRetrySrc={finalRetryImageSrc}
          productCode={imageCode}
          articleHint={imageArticle}
        />
      </div>

      <div className="min-w-0 self-center">
        <div className="flex min-w-0 items-center gap-1">
          <span className="truncate rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.04em] text-slate-500">
            {item.producer || "Товар"}
          </span>
          <span
            className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.03em] ${
              item.quantity > 0
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-amber-200 bg-amber-50 text-amber-700"
            }`}
          >
            {stockLabel(item.quantity)}
          </span>
        </div>

        <p className="mt-1 line-clamp-2 break-words text-[11.5px] font-extrabold leading-[1.15] text-slate-950 sm:text-[12px]">
          {visibleName}
        </p>

        <p className="mt-0.5 truncate text-[10.5px] font-bold leading-4 text-slate-600">
          {item.article || item.code}
        </p>
      </div>

      <span
        className={`inline-flex min-h-[50px] w-[72px] shrink-0 flex-col items-center justify-center rounded-[12px] border px-1.5 py-1 text-center shadow-[0_6px_12px_rgba(14,165,233,0.09)] ring-1 ring-white/80 sm:w-[82px] ${
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
    </Link>
  );
}
