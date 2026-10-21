import ProductCardImage from "app/components/ProductCardImage";
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

// Text-led, not image-led: a fixed thumbnail up top instead of a
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
  "product-compact-card group relative flex h-[184px] w-full min-w-0 shrink-0 snap-start flex-col overflow-hidden rounded-[14px] border border-[#dbe6ec] bg-white text-left shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_22px_-18px_rgba(15,23,42,0.35)] transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-[#7cc4d6] hover:shadow-[0_2px_4px_rgba(7,85,105,0.06),0_16px_28px_-18px_rgba(7,85,105,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2";

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
  // Batch URLs warm related items, but recently viewed items have no batch.
  // The shared catalog image component can resolve the direct route near
  // the viewport and recover from failed/stale URLs without changing layout.
  const hasPrice = priceLabel !== "Ціну уточнити";

  return (
    <SmartLink
      href={href}
      prefetchOnIntent
      prefetchOnViewport={imagePriority}
      className={cardClass}
    >
      <div className="flex items-center gap-2.5 p-2.5 pb-0">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[11px] border border-[#e2ebf0] bg-[#f6f9fb]">
          <ProductCardImage
            prefetchedSrc={prefetchedImageSrc}
            alt={visibleName}
            productCode={imageCode}
            articleHint={imageArticle}
            hasKnownPhoto={item.hasPhoto !== false || Boolean(prefetchedImageSrc)}
            deferDirectLoad
            loadingMode={imagePriority ? "eager" : "lazy"}
            fetchPriority={imagePriority ? "high" : "auto"}
            sizes="64px"
          />
        </div>
        <div className="min-w-0 flex-1">
          {/* A span, not a p: the page styles its section eyebrows as p.uppercase. */}
          <span className="block truncate text-[11px] font-extrabold uppercase leading-4 tracking-[0.06em] text-slate-500">
            {item.producer || "Товар"}
          </span>
          <p
            title={stockLabel(item.quantity)}
            className={`mt-1 flex min-w-0 items-center gap-1.5 text-[12px] font-semibold leading-4 ${
              item.quantity > 0 ? "text-emerald-700" : "text-amber-700"
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.quantity > 0 ? "bg-emerald-500" : "bg-amber-500"}`}
            />
            <span className="truncate">{stockLabel(item.quantity)}</span>
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-2.5 pt-2">
        <div className="min-w-0">
          {/* min-h reserves exactly 2 lines regardless of whether this name
              actually wraps — a 1-line name still occupies the same slot a
              3-line one clamps into, so every card's next row lands at the
              same spot instead of drifting with content length. */}
          <p className="line-clamp-2 min-h-[2.56em] break-words text-[14px] font-bold leading-[1.3] text-slate-900 transition-colors duration-200 group-hover:text-[#075569]">
            {visibleName}
          </p>
          {/* Always rendered (even empty) for the same reason — a missing
              category collapses to blank space of the same reserved size
              instead of pulling the price row up and leaving an uneven gap
              elsewhere in the card. */}
          <p className="mt-1 line-clamp-1 min-h-[1.4em] text-[12px] font-medium leading-[1.4] text-slate-500">
            {categoryLabel}
          </p>
        </div>

        <div className="mt-auto flex items-baseline justify-between gap-2 border-t border-[#edf2f5] pt-2">
          <p className="min-w-0 truncate text-[12px] font-semibold leading-4 text-slate-500">
            {item.article || item.code}
          </p>
          <span
            className={`shrink-0 truncate tabular-nums leading-none ${
              hasPrice
                ? "text-[15px] font-extrabold text-[#075569]"
                : "text-[12px] font-bold text-slate-500"
            }`}
          >
            {priceLabel}
          </span>
        </div>
      </div>
    </SmartLink>
  );
}
