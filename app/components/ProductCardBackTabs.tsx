"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUpRight } from "lucide-react";
import SmartLink from "app/components/SmartLink";
import { buildCatalogCategoryPath } from "app/lib/catalog-links";
import { parseProductDescription } from "app/lib/product-description-format";
import { formatFitmentPeriod, formatFitmentVolume } from "app/lib/product-fitment-format";
import { buildVisibleProductName } from "app/lib/product-url";

const tabs = [
  { id: "fitment", label: "Застосування" },
  { id: "specs", label: "Характеристики" },
  { id: "category", label: "Категорія" },
] as const;
type TabId = (typeof tabs)[number]["id"];

type Props = {
  item: { code: string; article: string; producer: string; category?: string; group?: string; subGroup?: string };
  description: string | null;
  loading: boolean;
  hasError: boolean;
  onRetry: () => void;
};

export default function ProductCardBackTabs({ item, description, loading, hasError, onRetry }: Props) {
  const instanceId = useId();
  const [activeTab, setActiveTab] = useState<TabId>("fitment");
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const parsed = useMemo(() => parseProductDescription(description), [description]);
  const categoryLevels = useMemo(() => {
    const values = [
      { label: "Категорія", value: item.category?.trim() || "" },
      { label: "Група", value: item.group?.trim() || "" },
      { label: "Підгрупа", value: item.subGroup?.trim() || "" },
    ];
    return values.filter((entry, index) => entry.value && !values.slice(0, index).some(
      (previous) => previous.value.toLocaleLowerCase("uk") === entry.value.toLocaleLowerCase("uk")
    ));
  }, [item.category, item.group, item.subGroup]);
  const basicSpecs = [
    { label: "Код", value: item.code },
    { label: "Артикул", value: item.article },
    { label: "Виробник", value: item.producer },
  ].filter((entry) => entry.value && entry.value !== "-");

  const handleTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    switch (event.key) {
      case "ArrowRight": next = (index + 1) % tabs.length; break;
      case "ArrowLeft": next = (index + tabs.length - 1) % tabs.length; break;
      case "Home": next = 0; break;
      case "End": next = tabs.length - 1; break;
      default: return;
    }
    event.preventDefault();
    event.stopPropagation();
    setActiveTab(tabs[next].id);
    buttons.current[next]?.focus({ preventScroll: true });
  };

  const descriptionState = loading ? (
    <div role="status" className="catalog-back-state">
      <span className="catalog-back-loading" aria-hidden="true" />
      Завантажуємо дані…
    </div>
  ) : hasError ? (
    <div className="catalog-back-state">
      <p>Не вдалося завантажити дані.</p>
      <button type="button" onClick={onRetry} className="catalog-back-retry">Спробувати ще раз</button>
    </div>
  ) : null;

  return (
    <div className="catalog-back-tabs" onClick={(event) => event.stopPropagation()}>
      <div role="tablist" aria-label="Інформація про товар" className="catalog-back-tablist">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(node) => { buttons.current[index] = node; }}
            type="button"
            role="tab"
            id={`${instanceId}-tab-${tab.id}`}
            aria-controls={`${instanceId}-panel-${tab.id}`}
            aria-selected={activeTab === tab.id}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => handleTabKey(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`${instanceId}-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`${instanceId}-tab-${tab.id}`}
          hidden={activeTab !== tab.id}
          tabIndex={0}
          className="catalog-back-panel"
        >
          {activeTab === tab.id && (tab.id === "category" ? (
            categoryLevels.length > 0 ? (
              <>
                <dl className="catalog-back-specs catalog-back-category">
                  {categoryLevels.map((level) => (
                    <div key={level.label}><dt>{level.label}</dt><dd>{buildVisibleProductName(level.value)}</dd></div>
                  ))}
                </dl>
                <SmartLink
                  href={buildCatalogCategoryPath(item.group || item.category || item.subGroup, item.subGroup)}
                  prefetchOnIntent
                  className="catalog-back-category-link"
                >
                  Товари цієї категорії <ArrowUpRight size={15} aria-hidden="true" />
                </SmartLink>
              </>
            ) : <p className="catalog-back-state">Категорію товару поки не вказано.</p>
          ) : descriptionState || (tab.id === "fitment" ? (
            parsed.fitment?.length ? (
              <ul className="catalog-back-fitment">
                {parsed.fitment.map((group, index) => (
                  <li key={`${index}:${group.brand}`}>
                    <strong>{group.brand}</strong>
                    <p>{group.models.join(", ")}</p>
                    {(group.volume || group.period) && (
                      <p className="catalog-back-fitment-range">
                        {[formatFitmentVolume(group.volume), group.period ? formatFitmentPeriod(group.period) : ""].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : parsed.fitmentText ? <p>{parsed.fitmentText}</p> : (
              <p className="catalog-back-state">Дані про застосування поки не вказані.</p>
            )
          ) : (
            <>
              {parsed.paragraphs.map((paragraph, index) => <p className="catalog-back-description" key={index}>{paragraph}</p>)}
              <dl className="catalog-back-specs">
                {[...basicSpecs, ...parsed.specs].map((spec, index) => (
                  <div key={`${index}:${spec.label}`}><dt>{spec.label}</dt><dd>{spec.value}</dd></div>
                ))}
              </dl>
              {!parsed.specs.length && !parsed.paragraphs.length && (
                <p className="catalog-back-state">Додаткові характеристики уточнюються.</p>
              )}
            </>
          )))}
        </div>
      ))}
    </div>
  );
}
