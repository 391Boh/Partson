"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import CatalogPrefetchLink from "app/components/CatalogPrefetchLink";
import { directoryPrimaryButtonClass } from "app/components/catalog-directory-styles";

const getProducerInitials = (label: string) => {
  const letters = (label || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("");
  return letters.toUpperCase() || "BR";
};

type ProducerEntry = {
  label: string;
  slug: string;
  productCount: number;
  catalogPath: string;
  manufacturerPath: string;
  logoPath?: string | null;
  initials?: string;
  description?: string | null;
};

type GroupItemProducerListProps = {
  initialItems: ProducerEntry[];
  groupLabel: string;
  catalogGroupLabel: string;
  categoryLabel: string;
  catalogPath: string;
};

const formatCount = (value: number) =>
  Number.isFinite(value) && value > 0 ? value.toLocaleString("uk-UA") : "0";

const stripLeadingBrandName = (label: string, description: string) => {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return description.replace(new RegExp(`^\\s*${escaped}\\s*[-–—]?\\s*`, "i"), "").trim();
};

const normalizeProducerItems = (value: unknown): ProducerEntry[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const label = typeof record.label === "string" ? record.label.trim() : "";
      const slug = typeof record.slug === "string" ? record.slug.trim() : "";
      const catalogPath =
        typeof record.catalogPath === "string" ? record.catalogPath.trim() : "";
      const manufacturerPath =
        typeof record.manufacturerPath === "string" ? record.manufacturerPath.trim() : "";
      const productCount = Number(record.productCount);
      const logoPath =
        typeof record.logoPath === "string" ? record.logoPath : null;
      const initials =
        typeof record.initials === "string" ? record.initials : getProducerInitials(label);
      const description =
        typeof record.description === "string" ? record.description : null;

      if (!label || !catalogPath || !manufacturerPath) return null;

      return {
        label,
        slug,
        catalogPath,
        manufacturerPath,
        productCount:
          Number.isFinite(productCount) && productCount > 0
            ? Math.floor(productCount)
            : 0,
        logoPath,
        initials,
        description,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 24);
};

export default function GroupItemProducerList({
  initialItems,
  catalogGroupLabel,
  categoryLabel,
  catalogPath,
}: GroupItemProducerListProps) {
  const normalizedInitialItems = useMemo(
    () => normalizeProducerItems(initialItems),
    [initialItems]
  );
  const [items, setItems] = useState<ProducerEntry[]>(normalizedInitialItems);
  const [isLoading, setIsLoading] = useState(normalizedInitialItems.length === 0);

  useEffect(() => {
    setItems(normalizedInitialItems);
    setIsLoading(normalizedInitialItems.length === 0);
  }, [normalizedInitialItems]);

  useEffect(() => {
    if (normalizedInitialItems.length > 0) return;

    const params = new URLSearchParams();
    if (catalogGroupLabel) params.set("group", catalogGroupLabel);
    if (categoryLabel) params.set("subcategory", categoryLabel);
    if (!params.has("subcategory")) return;

    let cancelled = false;

    const loadProducers = async () => {
      try {
        const response = await fetch(`/api/group-item-producers?${params.toString()}`, {
          headers: { Accept: "application/json" },
        });
        const payload = (await response.json()) as { items?: unknown };
        const nextItems = normalizeProducerItems(payload.items);
        if (cancelled) return;
        setItems(nextItems);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadProducers();

    return () => {
      cancelled = true;
    };
  }, [catalogGroupLabel, categoryLabel, normalizedInitialItems.length]);

  if (items.length === 0) {
    return (
      <div className="p-4 sm:p-5">
        <div className="rounded-lg border border-dashed border-slate-300 bg-white/80 px-4 py-5 text-sm leading-6 text-slate-600">
          {isLoading
            ? "Завантажуємо виробників для цієї категорії..."
            : "Для цієї категорії ще немає готового розподілу за виробниками. Перейдіть у каталог, щоб побачити актуальні товари і фільтри."}
          <div className="mt-3">
            <CatalogPrefetchLink
              href={catalogPath}
              prefetchCatalogOnViewport
              className={directoryPrimaryButtonClass}
            >
              Перейти в каталог
            </CatalogPrefetchLink>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-4">
      {items.map((producer) => {
        const shortDescription = producer.description
          ? stripLeadingBrandName(producer.label, producer.description)
          : null;

        return (
          <article
            key={producer.slug || producer.label}
            className="group relative flex flex-col overflow-hidden rounded-[16px] border border-slate-200 bg-[linear-gradient(160deg,rgba(255,255,255,1)_0%,rgba(248,250,252,0.98)_55%,rgba(240,249,255,0.95)_100%)] shadow-[0_1px_3px_rgba(15,23,42,0.04),0_6px_16px_rgba(15,23,42,0.07),0_16px_32px_rgba(15,23,42,0.05),inset_0_1px_0_rgba(255,255,255,1)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-sky-200/80 hover:shadow-[0_2px_6px_rgba(14,165,233,0.05),0_10px_24px_rgba(14,165,233,0.10),0_24px_44px_rgba(15,23,42,0.07),inset_0_1px_0_rgba(255,255,255,1)]"
            itemScope
            itemType="https://schema.org/Brand"
          >
            {producer.logoPath ? (
              <meta itemProp="logo" content={producer.logoPath} />
            ) : null}

            {/* Header: logo + name + count */}
            <div className="flex items-start gap-3 p-3.5 pb-2.5">
              {/* Logo tile */}
              <div className="relative inline-flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-slate-200/80 bg-[linear-gradient(145deg,rgba(255,255,255,1),rgba(241,245,249,0.9))] shadow-[0_2px_6px_rgba(15,23,42,0.07),inset_0_1px_0_rgba(255,255,255,1)]">
                {producer.logoPath ? (
                  <Image
                    src={producer.logoPath}
                    alt={producer.label}
                    width={80}
                    height={48}
                    sizes="56px"
                    loading="lazy"
                    className="h-9 w-12 object-contain transition duration-200 group-hover:scale-[1.04]"
                  />
                ) : (
                  <span className="text-[15px] font-black text-slate-600">
                    {producer.initials}
                  </span>
                )}
              </div>

              {/* Name + badges */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1">
                  <span className="inline-flex rounded-[8px] border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.10em] text-teal-800">
                    Виробник
                  </span>
                  {producer.productCount > 0 && (
                    <span className="inline-flex rounded-[8px] border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-sky-800">
                      {formatCount(producer.productCount)} поз.
                    </span>
                  )}
                </div>
                <Link
                  href={producer.manufacturerPath}
                  itemProp="url"
                  className="mt-1.5 block text-[15px] font-extrabold leading-tight text-slate-900 transition-colors hover:text-teal-700"
                >
                  <span itemProp="name">{producer.label}</span>
                </Link>
              </div>
            </div>

            {/* Description */}
            {shortDescription ? (
              <div className="mx-3 mb-0 rounded-[12px] border border-slate-200/70 bg-[linear-gradient(135deg,rgba(248,250,252,0.9),rgba(255,255,255,0.96))] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                <p
                  itemProp="description"
                  className="line-clamp-3 text-[11.5px] leading-[1.55] text-slate-600"
                >
                  {shortDescription}
                </p>
              </div>
            ) : (
              <div className="mx-3 mb-0 rounded-[12px] border border-slate-200/70 bg-[linear-gradient(135deg,rgba(248,250,252,0.9),rgba(255,255,255,0.96))] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                <p className="line-clamp-3 text-[11.5px] leading-[1.55] text-slate-500 italic">
                  {`${producer.label} — запчастини у категорії ${categoryLabel}.`}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="mt-auto flex gap-2 border-t border-slate-100 p-3">
              <CatalogPrefetchLink
                href={producer.catalogPath}
                prefetchCatalogOnViewport
                className="flex-1 rounded-[12px] border border-teal-200 bg-[linear-gradient(145deg,rgba(240,253,250,1),rgba(204,251,241,0.7))] px-3 py-2 text-center text-[12px] font-bold text-teal-900 shadow-[0_2px_6px_rgba(20,184,166,0.10),inset_0_1px_0_rgba(255,255,255,0.8)] transition hover:border-teal-300 hover:shadow-[0_4px_10px_rgba(20,184,166,0.15)]"
              >
                В каталог
              </CatalogPrefetchLink>
              <Link
                href={producer.manufacturerPath}
                className="flex-1 rounded-[12px] border border-slate-200 bg-[linear-gradient(145deg,rgba(255,255,255,1),rgba(248,250,252,0.9))] px-3 py-2 text-center text-[12px] font-bold text-slate-700 shadow-[0_2px_6px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.9)] transition hover:border-sky-200 hover:text-sky-800"
              >
                Виробник
              </Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}
