import { parseProductDescription } from "app/lib/product-description-format";

type ProductDescriptionContentProps = {
  text: string;
  // "page" for the product page card, "compact" for the catalog card's back
  // face and the list-view row.
  variant?: "page" | "compact";
};

// One rendering of the 1C description for every place that shows it:
// fitment/free-text lines as paragraphs, "Назва\tЗначення" rows as a
// characteristics list.
export default function ProductDescriptionContent({
  text,
  variant = "page",
}: ProductDescriptionContentProps) {
  const { paragraphs, specs } = parseProductDescription(text);
  const compact = variant === "compact";

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2.5"}>
      {paragraphs.map((paragraph, index) => (
        <p key={`${index}:${paragraph}`} className="break-words">
          {paragraph}
        </p>
      ))}
      {specs.length > 0 ? (
        <dl
          className={
            compact
              ? "divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200/80 bg-white/70"
              : "divide-y divide-slate-100 overflow-hidden rounded-[14px] border border-slate-200/80 bg-white/80"
          }
        >
          {specs.map((spec, index) => (
            <div
              key={`${index}:${spec.label}`}
              className={
                compact
                  ? "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 px-2 py-1"
                  : "grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-3 px-3 py-2"
              }
            >
              <dt className="min-w-0 break-words text-slate-500">{spec.label}</dt>
              <dd className="min-w-0 break-words font-semibold text-slate-800">{spec.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
