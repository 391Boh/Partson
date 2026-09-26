import AnalogProductThumb from "app/components/AnalogProductThumb";
import SmartLink from "app/components/SmartLink";
import { buildVisibleProductName, buildVisibleCategoryLabel } from "app/lib/product-url";

type ProductCompactRecommendationCardProps = {
  href: string;
  item: {
    code: string;
    article: string;
    name: string;
    producer: string;
    quantity: number;
    hasPhoto?: boolean;
    group?: string;
    subGroup?: string;
    category?: string;
  };
  priceLabel: string;
  sourceArticle?: string;
  imagePriority?: boolean;
  prefetchedImageSrc?: string;
};

// Text-led, not image-led: a small fixed thumbnail up top instead of a
// full-width square, so most of the card is name + category + price — the
// information that actually distinguishes one analog from another, which a
// bigger photo of a generic-looking part rarely does.
//
// Height is sized to exactly what the reserved slots below add up to
// (image row + the name/category slots' own min-heights + price row +
// padding/gaps) — not rounded up "for safety". A taller card than its
// content needs is exactly what turns a short name/missing category into a
// big, inconsistent blank patch instead of a clean, uniformly-shaped tile.
const cardClass =
  "group relative flex h-[166px] w-full min-w-0 shrink-0 snap-start flex-col overflow-hidden rounded-[16px] border border-slate-200/90 bg-white text-left shadow-[0_8px_18px_rgba(15,23,42,0.06)] ring-1 ring-white/80 transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-[0_16px_30px_rgba(14,165,233,0.16)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-200/80";

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
  const categoryLabel = buildVisibleCategoryLabel(item.subGroup || item.group || item.category || "");
  const imageCode = item.code || item.article || sourceArticle;
  const imageArticle = item.article || item.code || sourceArticle;
  // Wait for the batch lookup's confirmed src instead of guessing one via
  // buildProductImagePath: a guess for an item with no real photo used to
  // trigger a real request that 307-redirects to the fallback image, which
  // AnalogProductThumb then has to detect and retry through twice (strict,
  // then relaxed) before it settles on the "no photo" placeholder — visible
  // as the thumbnail flashing/loading for a while. Leaving this empty until
  // resolved renders the placeholder immediately with no wasted round trips,
  // and AnalogProductThumb's own success cache still shows an already-seen
  // image instantly regardless of this prop.
  const imageSrc = prefetchedImageSrc;
  const hasPrice = priceLabel !== "Ціну уточнити";

  return (
    <SmartLink
      href={href}
      prefetchOnIntent
      prefetchOnViewport={imagePriority}
      className={cardClass}
    >
      <div className="flex items-start gap-2 p-2.5 pb-0">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[12px] border border-slate-200 bg-slate-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
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
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 pt-0.5">
          <span className="max-w-full truncate rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.04em] text-slate-500">
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
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-2.5 pt-2">
        <div className="min-w-0">
          {/* min-h reserves exactly 2 lines regardless of whether this name
              actually wraps — a 1-line name still occupies the same slot a
              3-line one clamps into, so every card's next row lands at the
              same spot instead of drifting with content length. */}
          <p className="line-clamp-2 min-h-[2.56em] break-words text-[13px] font-extrabold leading-[1.28] text-slate-800">
            {visibleName}
          </p>
          {/* Always rendered (even empty) for the same reason — a missing
              category collapses to blank space of the same reserved size
              instead of pulling the price row up and leaving an uneven gap
              elsewhere in the card. */}
          <p className="mt-1 line-clamp-1 min-h-[1.4em] text-[11px] font-medium leading-[1.4] text-slate-500">
            {categoryLabel}
          </p>
        </div>

        <div className="mt-auto flex items-end justify-between gap-1.5">
          <p className="min-w-0 truncate text-[10.5px] font-bold leading-4 text-slate-500">
            {item.article || item.code}
          </p>
          <span
            className={`inline-flex shrink-0 items-center rounded-[9px] border px-1.5 py-1 text-[11px] font-black leading-none shadow-[0_6px_12px_rgba(14,165,233,0.1)] ${
              hasPrice
                ? "border-sky-300 bg-[linear-gradient(180deg,#eff9ff,#dff4ff)] text-sky-900"
                : "border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f1f5f9)] text-slate-500"
            }`}
          >
            <span className="truncate tabular-nums">{priceLabel}</span>
          </span>
        </div>
      </div>
    </SmartLink>
  );
}
