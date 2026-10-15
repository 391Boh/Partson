import Link from "next/link";
import { Tags } from "lucide-react";

import type { RelatedProductCardItem } from "app/lib/product-related";
import { buildProductPath, buildVisibleProductName } from "app/lib/product-url";

// People search parts by number: the maker's article, a cross-reference code,
// or another brand's equivalent. Search Console showed product pages already
// listed for such numbers but rarely clicked, and the numbers themselves were
// scattered (chips by the title, cards rendered on the client). This block
// states them as plain, server-rendered text in one place.

const MAX_ANALOGS = 10;

const compactCode = (value: string) => value.replace(/[\s.\-/]+/g, "");

// Bosch prints its 10-character numbers grouped "1 987 945 328", and buyers
// type them either way.
const boschSpaced = (value: string) =>
  /^[0-9A-Z]{10}$/i.test(value)
    ? `${value.slice(0, 1)} ${value.slice(1, 4)} ${value.slice(4, 7)} ${value.slice(7)}`
    : "";

const articleSpellings = (article: string, producer: string) => {
  const spellings = new Set<string>();
  const compact = compactCode(article);
  if (compact && compact !== article) spellings.add(compact);
  if (/^bosch$/i.test(producer.trim())) {
    const spaced = boschSpaced(compact);
    if (spaced) spellings.add(spaced);
  }
  spellings.delete(article);
  return Array.from(spellings);
};

type ProductCrossReferencesProps = {
  article: string;
  code: string;
  producer: string;
  crossReferenceCodes: string[];
  analogs: RelatedProductCardItem[];
};

export default function ProductCrossReferences({
  article,
  code,
  producer,
  crossReferenceCodes,
  analogs,
}: ProductCrossReferencesProps) {
  const ownKey = compactCode(article).toLowerCase();
  const analogItems = analogs
    .filter((item) => item.article && compactCode(item.article).toLowerCase() !== ownKey)
    .filter(
      (item, index, list) =>
        list.findIndex(
          (other) =>
            compactCode(other.article).toLowerCase() === compactCode(item.article).toLowerCase() &&
            other.producer === item.producer
        ) === index
    )
    .slice(0, MAX_ANALOGS);
  const spellings = article ? articleSpellings(article, producer) : [];

  if (!article && crossReferenceCodes.length === 0 && analogItems.length === 0) return null;

  const heading = article ? `Номери та аналоги ${article}` : "Номери та аналоги";

  return (
    <section
      aria-labelledby="product-cross-references-title"
      className="relative overflow-hidden rounded-[22px] border border-sky-100 bg-[linear-gradient(145deg,rgba(255,255,255,0.99),rgba(240,249,255,0.94),rgba(248,250,252,0.98))] p-3 text-left shadow-[0_18px_42px_rgba(15,23,42,0.075)] ring-1 ring-white/80 sm:rounded-[24px] sm:p-4"
    >
      <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/70 to-transparent" />
      <p className="mb-0.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-sky-800">
        <Tags size={13} aria-hidden="true" />
        Пошук за номером
      </p>
      <h2
        id="product-cross-references-title"
        className="font-display mt-0.5 break-words text-[1.05rem] font-extrabold leading-tight tracking-[-0.015em] text-slate-800 sm:text-[1.18rem]"
      >
        {heading}
      </h2>

      <dl className="mt-3 grid gap-x-4 gap-y-0.5 text-[13px] sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-y-2.5">
        {article ? (
          <>
            <dt className="mt-2 font-semibold text-slate-500 first:mt-0 sm:mt-0">
              Артикул{producer ? ` ${producer}` : ""}
            </dt>
            <dd className="min-w-0 break-words font-mono font-bold text-slate-900">
              {article}
              {spellings.length > 0 ? (
                <span className="ml-2 font-sans font-medium text-slate-500">
                  (також пишуть: {spellings.join(", ")})
                </span>
              ) : null}
            </dd>
          </>
        ) : null}
        {code && code !== article ? (
          <>
            <dt className="mt-2 font-semibold text-slate-500 first:mt-0 sm:mt-0">Код PartsON</dt>
            <dd className="min-w-0 break-words font-mono font-bold text-slate-900">{code}</dd>
          </>
        ) : null}
        {crossReferenceCodes.length > 0 ? (
          <>
            <dt className="mt-2 font-semibold text-slate-500 first:mt-0 sm:mt-0">Крос-номери</dt>
            <dd className="flex min-w-0 flex-wrap gap-1.5">
              {crossReferenceCodes.map((crossCode) => (
                <span
                  key={crossCode}
                  className="inline-flex items-center rounded-[10px] border border-sky-200 bg-sky-50 px-2 py-0.5 font-mono text-[12px] font-bold text-sky-800"
                >
                  {crossCode}
                </span>
              ))}
            </dd>
          </>
        ) : null}
      </dl>

      {analogItems.length > 0 ? (
        <div className="mt-4 border-t border-slate-900/8 pt-3">
          <h3 className="text-[12px] font-extrabold text-slate-800">
            Аналоги інших виробників
          </h3>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {analogItems.map((item) => (
              <li key={`${item.producer}:${item.article}`} className="min-w-0">
                <Link
                  href={buildProductPath({
                    code: item.code || item.article,
                    article: item.article,
                    name: item.name,
                    producer: item.producer,
                    group: item.group,
                    subGroup: item.subGroup,
                    category: item.category,
                  })}
                  prefetch={false}
                  className="flex min-h-11 min-w-0 items-baseline gap-2 rounded-[12px] border border-slate-200/80 bg-white/85 px-3 py-2 text-[12.5px] transition-colors hover:border-sky-300 hover:bg-sky-50/70"
                >
                  <span className="shrink-0 font-bold text-slate-900">
                    {item.producer} <span className="font-mono">{item.article}</span>
                  </span>
                  <span className="min-w-0 truncate text-slate-500">
                    {buildVisibleProductName(item.name)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-3 text-[11.5px] leading-relaxed text-slate-500">
        Перед заміною звірте номер зі старою деталлю або надішліть VIN — менеджер перевірить сумісність.
      </p>
    </section>
  );
}
