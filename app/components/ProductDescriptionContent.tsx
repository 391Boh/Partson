import { parseProductDescription } from "app/lib/product-description-format";
import { formatFitmentPeriod, formatFitmentVolume } from "app/lib/product-fitment-format";

type ProductDescriptionContentProps = {
  text: string;
  // "page" for the product page card, "compact" for the catalog card's back
  // face and the list-view row.
  variant?: "page" | "compact";
};

// One rendering of the 1C description for every place that shows it: the
// brand/model fitment line as a grouped list (plain text on the compact
// cards), free-text lines as paragraphs, "Назва\tЗначення" rows as a
// characteristics list.
export default function ProductDescriptionContent({
  text,
  variant = "page",
}: ProductDescriptionContentProps) {
  const { fitment, fitmentText, paragraphs, specs } = parseProductDescription(text);
  const compact = variant === "compact";

  return (
    <div className={compact ? "space-y-1.5" : "product-description-content space-y-3"}>
      {fitment && !compact ? (
        <div className="rounded-[14px] border border-slate-200/80 bg-white/80 px-3 py-2.5">
          <h3 className="text-[13px] font-bold uppercase tracking-[0.04em] text-slate-500">
            Застосовність
          </h3>
          <ul className="mt-2 space-y-2.5">
            {fitment.map((group, index) => {
              const tail = [formatFitmentVolume(group.volume), group.period ? formatFitmentPeriod(group.period) : ""]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={`${index}:${group.brand}`} className="min-w-0">
                  <p className="font-semibold text-slate-900">
                    {group.brand}
                    {tail ? <span className="font-medium text-slate-500"> · {tail}</span> : null}
                  </p>
                  <p className="mt-0.5 break-words text-slate-700">{group.models.join(", ")}</p>
                </li>
              );
            })}
          </ul>
        </div>
      ) : fitmentText ? (
        <p className="break-words">{fitmentText}</p>
      ) : null}
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
