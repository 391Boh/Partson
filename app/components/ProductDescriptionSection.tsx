import "server-only";

import { fetchProductDescription } from "app/lib/catalog-server";
import { resolveWithTimeout } from "app/lib/resolve-with-timeout";

const PRODUCT_DESCRIPTION_TIMEOUT_MS = 900;

type ProductDescriptionSectionProps = {
  fallbackText: string;
  lookupKeys: string[];
  descriptionTextClass: string;
};

const resolveInitialDescription = async (lookupKeys: string[]) => {
  const normalizedKeys = Array.from(
    new Set(
      lookupKeys
        .map((lookupKey) => (lookupKey || "").trim())
        .filter(Boolean)
        .slice(0, 3)
    )
  );

  if (normalizedKeys.length === 0) return null;

  const tasks = normalizedKeys.map((lookupKey) =>
    fetchProductDescription(lookupKey, {
      timeoutMs: PRODUCT_DESCRIPTION_TIMEOUT_MS,
      retries: 0,
      retryDelayMs: 100,
      cacheTtlMs: 1000 * 60 * 30,
    }).then((value) => {
      const normalizedValue = typeof value === "string" ? value.trim() : "";
      if (!normalizedValue) {
        throw new Error("EMPTY_DESCRIPTION");
      }
      return normalizedValue;
    })
  );

  try {
    return await Promise.any(tasks);
  } catch {
    return null;
  }
};

export default async function ProductDescriptionSection({
  fallbackText,
  lookupKeys,
  descriptionTextClass,
}: ProductDescriptionSectionProps) {
  const descriptionText =
    (await resolveWithTimeout(
      () => resolveInitialDescription(lookupKeys),
      null,
      PRODUCT_DESCRIPTION_TIMEOUT_MS
    )) || fallbackText;
  const hasCatalogDescription = descriptionText !== fallbackText;

  return (
    <section className="rounded-[22px] border border-slate-200 bg-white p-3 shadow-[0_14px_28px_rgba(15,23,42,0.05)] sm:rounded-[24px] sm:p-4">
      <div className="flex flex-wrap items-end justify-between gap-2.5 border-b border-slate-100 pb-2.5">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-sky-700">
            Опис
          </p>
          <h2 className="font-display-italic mt-1 text-[1.02rem] font-black tracking-[-0.04em] text-slate-900 sm:text-[1.14rem]">
            Що варто знати про товар
          </h2>
        </div>
        <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-600">
          {hasCatalogDescription ? "Оригінальний опис" : "Каталожна довідка"}
        </span>
      </div>
      <p className="mt-2 text-[13px] font-medium leading-5 text-slate-600 sm:text-sm sm:leading-6">
        Коротка інформація про призначення, позицію в каталозі та спосіб замовлення.
      </p>
      <p className={descriptionTextClass}>{descriptionText}</p>
    </section>
  );
}