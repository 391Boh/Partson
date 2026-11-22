"use client";

import Image from "next/image";
import DirectoryCollection from "app/components/DirectoryCollection";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";

import CatalogPrefetchLink from "app/components/CatalogPrefetchLink";
import { directoryPrimaryButtonClass } from "app/components/catalog-directory-styles";
import { pluralizeProducts } from "app/lib/pluralize-uk";

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

  // Cards in the language of the /groups system cards: name and count on
  // the left, the brand's logo on a soft halo on the right, a short note and
  // two clear actions at the foot. Colours follow the page's system hue.
  return (
    <DirectoryCollection labels={items.map(producer => producer.label)} className="gprod-grid" placeholder="Знайти виробника в категорії" pageSize={12}>
      {items.map((producer) => {
        const shortDescription = producer.description
          ? stripLeadingBrandName(producer.label, producer.description)
          : `${producer.label} — запчастини у категорії ${categoryLabel}.`;

        return (
          <article
            key={producer.slug || producer.label}
            className="gprod-card"
            itemScope
            itemType="https://schema.org/Brand"
          >
            {producer.logoPath ? <meta itemProp="logo" content={producer.logoPath} /> : null}
            <div className="gprod-card__main">
              <div className="gprod-card__text">
                <Link href={producer.manufacturerPath} itemProp="url" className="gprod-card__name">
                  <span itemProp="name">{producer.label}</span>
                </Link>
                {producer.productCount > 0 ? (
                  <span className="gprod-card__meta">
                    <b>{formatCount(producer.productCount)}</b> {pluralizeProducts(producer.productCount)}
                  </span>
                ) : null}
              </div>
              <span className="gprod-card__logo" aria-hidden={producer.logoPath ? undefined : true}>
                {producer.logoPath ? (
                  <Image
                    src={producer.logoPath}
                    alt={`Логотип виробника автозапчастин ${producer.label}`}
                    width={112}
                    height={72}
                    sizes="88px"
                    quality={85}
                    loading="lazy"
                    unoptimized={producer.logoPath.endsWith(".svg")}
                  />
                ) : (
                  <span className="gprod-card__initials">{producer.initials}</span>
                )}
              </span>
            </div>
            <p itemProp="description" className="gprod-card__desc">{shortDescription}</p>
            <div className="gprod-card__actions">
              <CatalogPrefetchLink href={producer.catalogPath} prefetchCatalogOnViewport className="gprod-card__primary" aria-label={`Товари ${producer.label} у каталозі`}>
                У каталог
                <ArrowRight size={16} strokeWidth={2.4} aria-hidden="true" />
              </CatalogPrefetchLink>
              <Link href={producer.manufacturerPath} className="gprod-card__secondary" aria-label={`Сторінка виробника ${producer.label}`}>
                Про бренд
              </Link>
            </div>
          </article>
        );
      })}
    </DirectoryCollection>
  );
}
