import Link from "next/link";
import { CarFront, ListChecks } from "lucide-react";
import { parseProductDescription } from "app/lib/product-description-format";
import {
  formatFitmentPeriod,
  formatFitmentVolume,
  type ProductFitmentGroup,
} from "app/lib/product-fitment-format";

type ProductDescriptionContentProps = {
  text: string;
  // "page" for the product page card, "compact" for the catalog card's back
  // face and the list-view row.
  variant?: "page" | "compact";
  // Model pages for the fitment chips, keyed "brand::model" as the chips
  // render them (see app/lib/product-fitment-links.ts).
  modelLinks?: Record<string, string>;
};

// Models shown per make before the rest folds behind "Ще N" — only when at
// least a few would fold; hiding one or two models saves nothing.
const VISIBLE_MODELS_PER_MAKE = 10;
const MIN_FOLDED_MODELS = 3;

const plural = (count: number, one: string, few: string, many: string) => {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
};

const MODEL_CHIP_CLASS =
  "block min-w-0 max-w-full break-words rounded-[9px] border bg-white px-2.5 py-1 text-[13px] font-semibold leading-5 shadow-[0_1px_0_rgba(15,23,42,0.03)]";

const ModelChips = ({
  brand,
  models,
  modelLinks,
}: {
  brand: string;
  models: string[];
  modelLinks?: Record<string, string>;
}) => (
  <>
    {models.map((model, index) => {
      const href = modelLinks?.[`${brand}::${model}`];
      return (
        <li key={`${index}:${model}`} className="min-w-0 max-w-full">
          {href ? (
            <Link
              href={href}
              prefetch={false}
              title={`Запчастини для ${brand} ${model}`}
              className={`${MODEL_CHIP_CLASS} border-sky-200 text-sky-800 underline decoration-sky-300 underline-offset-2 transition-colors hover:border-sky-300 hover:bg-sky-50 hover:decoration-sky-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60`}
            >
              {model}
            </Link>
          ) : (
            <span className={`${MODEL_CHIP_CLASS} border-slate-200 text-slate-700`}>{model}</span>
          )}
        </li>
      );
    })}
  </>
);

const FitmentRange = ({ volume, period }: { volume: string; period: string }) => (
  <>
    {volume ? (
      <span className="rounded-full bg-sky-100/80 px-2 py-0.5 text-[12px] font-bold text-sky-800 tabular-nums">{volume}</span>
    ) : null}
    {period ? (
      <span className="rounded-full bg-emerald-100/80 px-2 py-0.5 text-[12px] font-bold text-emerald-800 tabular-nums">{period}</span>
    ) : null}
  </>
);

const FitmentMake = ({
  group,
  modelLinks,
  showRange,
}: {
  group: ProductFitmentGroup;
  modelLinks?: Record<string, string>;
  showRange: boolean;
}) => {
  const volume = showRange ? formatFitmentVolume(group.volume) : "";
  const period = showRange && group.period ? formatFitmentPeriod(group.period) : "";
  const folds = group.models.length - VISIBLE_MODELS_PER_MAKE >= MIN_FOLDED_MODELS;
  const visible = folds ? group.models.slice(0, VISIBLE_MODELS_PER_MAKE) : group.models;
  const hidden = folds ? group.models.slice(VISIBLE_MODELS_PER_MAKE) : [];
  return (
    <li className="min-w-0 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="text-[13.5px] font-extrabold uppercase tracking-[0.03em] text-slate-900">{group.brand}</span>
        <FitmentRange volume={volume} period={period} />
      </div>
      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`Моделі ${group.brand}`}>
        <ModelChips brand={group.brand} models={visible} modelLinks={modelLinks} />
      </ul>
      {hidden.length > 0 ? (
        // Native disclosure: works in the server-rendered card before (and
        // without) hydration.
        <details className="group/more mt-1.5">
          <summary className="inline-flex min-h-9 cursor-pointer list-none items-center rounded-[9px] px-1 text-[13px] font-bold text-sky-700 hover:text-sky-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60 [&::-webkit-details-marker]:hidden">
            <span className="group-open/more:hidden">
              Ще {hidden.length} {plural(hidden.length, "модель", "моделі", "моделей")}
            </span>
            <span className="hidden group-open/more:inline">Згорнути</span>
          </summary>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            <ModelChips brand={group.brand} models={hidden} modelLinks={modelLinks} />
          </ul>
        </details>
      ) : null}
    </li>
  );
};

const FitmentCard = ({
  fitment,
  modelLinks,
}: {
  fitment: ProductFitmentGroup[];
  modelLinks?: Record<string, string>;
}) => {
  const modelCount = fitment.reduce((total, group) => total + group.models.length, 0);
  const makeCount = new Set(fitment.map((group) => group.brand)).size;
  // One engine/year range for the whole list (TecDoc's summary after the
  // last make) is shown once, not repeated beside every make.
  const [first] = fitment;
  const sharedRange =
    fitment.length > 1 &&
    Boolean(first.volume || first.period) &&
    fitment.every((group) => group.volume === first.volume && group.period === first.period);
  return (
    <section
      aria-label="Застосування"
      className="rounded-[16px] border border-sky-100 bg-[linear-gradient(180deg,#f3f9fc_0%,#ffffff_70%)] p-3.5 sm:p-4"
    >
      <header className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-[#075569] text-white shadow-[0_6px_14px_rgba(7,85,105,0.22)]" aria-hidden="true">
          <CarFront size={18} strokeWidth={2.1} />
        </span>
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold leading-5 text-slate-900">Застосування</h3>
          <p className="text-[12.5px] font-medium leading-5 text-slate-500">
            {modelCount} {plural(modelCount, "модель", "моделі", "моделей")}
            {makeCount > 1 ? ` · ${makeCount} ${plural(makeCount, "марка", "марки", "марок")}` : ""}
          </p>
        </div>
      </header>
      {sharedRange ? (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12.5px] font-semibold text-slate-600">
          <span>Для всіх марок:</span>
          <FitmentRange
            volume={formatFitmentVolume(first.volume)}
            period={first.period ? formatFitmentPeriod(first.period) : ""}
          />
        </p>
      ) : null}
      <ul className="mt-3.5 divide-y divide-sky-100/90">
        {fitment.map((group, index) => (
          <FitmentMake key={`${index}:${group.brand}`} group={group} modelLinks={modelLinks} showRange={!sharedRange} />
        ))}
      </ul>
    </section>
  );
};

// One rendering of the 1C description for every place that shows it: the
// brand/model fitment line as grouped models (plain text on the compact
// cards), free-text lines as paragraphs, "Назва\tЗначення" rows as a
// characteristics list.
export default function ProductDescriptionContent({
  text,
  variant = "page",
  modelLinks,
}: ProductDescriptionContentProps) {
  const { fitment, fitmentText, paragraphs, specs } = parseProductDescription(text);

  if (variant === "compact") {
    return (
      <div className="space-y-1.5">
        {fitmentText ? <p className="break-words">{fitmentText}</p> : null}
        {paragraphs.map((paragraph, index) => (
          <p key={`${index}:${paragraph}`} className="break-words">
            {paragraph}
          </p>
        ))}
        {specs.length > 0 ? (
          <dl className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200/80 bg-white/70">
            {specs.map((spec, index) => (
              <div key={`${index}:${spec.label}`} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 px-2 py-1">
                <dt className="min-w-0 break-words text-slate-500">{spec.label}</dt>
                <dd className="min-w-0 break-words font-semibold text-slate-800">{spec.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    );
  }

  return (
    <div className="product-description-content space-y-4">
      {paragraphs.map((paragraph, index) => (
        <p key={`${index}:${paragraph}`} className="break-words">
          {paragraph}
        </p>
      ))}
      {fitment ? (
        <FitmentCard fitment={fitment} modelLinks={modelLinks} />
      ) : fitmentText ? (
        <p className="break-words">{fitmentText}</p>
      ) : null}
      {specs.length > 0 ? (
        <section aria-label="Характеристики" className="overflow-hidden rounded-[16px] border border-slate-200/80 bg-white">
          <header className="flex items-center gap-3 border-b border-slate-100 px-3.5 py-3 sm:px-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-slate-100 text-slate-700" aria-hidden="true">
              <ListChecks size={18} strokeWidth={2.1} />
            </span>
            <h3 className="text-[15px] font-bold leading-5 text-slate-900">Характеристики</h3>
          </header>
          <dl className="product-description-specs">
            {specs.map((spec, index) => (
              <div
                key={`${index}:${spec.label}`}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
              >
                <dt className="min-w-0 break-words">{spec.label}</dt>
                <dd className="min-w-0 break-words">{spec.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </div>
  );
}
