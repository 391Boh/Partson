"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import SmartLink from "app/components/SmartLink";
import ProductCardImage from "app/components/ProductCardImage";
import { buildProductPath, buildVisibleProductName, parseAnalogCodesFromName } from "app/lib/product-url";

type AnalogItem = {
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

type Props = {
  item: { code: string; article: string; name: string; producer: string; category?: string; group?: string; subGroup?: string };
};

type State = { status: "loading" } | { status: "error" } | { status: "ready"; items: AnalogItem[] };

const compactCode = (value: string) => value.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();

// Flipping the same card back and forth must not refetch.
const analogsCache = new Map<string, AnalogItem[]>();

const loadAnalogs = async (item: Props["item"]): Promise<AnalogItem[]> => {
  const params = new URLSearchParams({
    article: item.article,
    code: item.code,
    name: item.name,
    producer: item.producer,
    group: item.group || "",
    subGroup: item.subGroup || "",
    category: item.category || "",
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`/api/product-analogs?${params}`);
    const data = (await response.json().catch(() => null)) as { items?: AnalogItem[]; retryable?: boolean } | null;
    if (response.ok && Array.isArray(data?.items)) return data.items;
    if (!data?.retryable) break;
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  throw new Error("analogs unavailable");
};

export default function ProductCardBackAnalogs({ item }: Props) {
  const cacheKey = `${item.code}|${item.article}`;
  const [state, setState] = useState<State>(() => {
    const cached = analogsCache.get(cacheKey);
    return cached ? { status: "ready", items: cached } : { status: "loading" };
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (analogsCache.has(cacheKey)) return;
    if (!item.article.trim()) {
      setState({ status: "ready", items: [] });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    loadAnalogs(item)
      .then((items) => {
        const own = item.code.trim().toLowerCase();
        const visible = items.filter((analog) => analog.code.trim().toLowerCase() !== own);
        analogsCache.set(cacheKey, visible);
        if (!cancelled) setState({ status: "ready", items: visible });
      })
      .catch(() => { if (!cancelled) setState({ status: "error" }); });
    return () => { cancelled = true; };
    // `item` fields are captured through cacheKey; attempt drives the retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  // Same cross-number list as the product page: codes written in the name,
  // then the articles of the analogs found, without the product's own article.
  const analogItems = state.status === "ready" ? state.items : null;
  const crossNumbers = useMemo(() => {
    const own = compactCode(item.article || item.code);
    // A stocked analog already has its own row below; don't repeat its number.
    const seen = new Set<string>(
      (analogItems ?? []).filter((analog) => analog.quantity > 0).map((analog) => compactCode(analog.article))
    );
    return [...parseAnalogCodesFromName(item.name), ...(analogItems ?? []).map((analog) => analog.article)]
      .map((number) => number.trim())
      .filter((number) => {
        const key = compactCode(number);
        if (!key || key === own || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [item.name, item.article, item.code, analogItems]);

  return (
    <div className="catalog-back-analogs" onClick={(event) => event.stopPropagation()}>
      <p className="catalog-back-analogs-title">
        Аналоги до <span>{item.article || item.code}</span>
      </p>
      <div className="catalog-back-panel" tabIndex={0} aria-busy={state.status === "loading"}>
        {crossNumbers.length > 0 && (
          <div className="catalog-back-cross">
            <p className="catalog-back-cross-label">Крос-номери</p>
            <ul className="catalog-back-cross-list">
              {crossNumbers.map((number) => (
                <li key={number}>
                  <span>{number}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {state.status === "loading" ? (
          <ul className="catalog-back-analogs-list" aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <li key={index} className="catalog-back-analog catalog-back-analog--skeleton">
                <span /><span />
              </li>
            ))}
          </ul>
        ) : state.status === "error" ? (
          <div className="catalog-back-state">
            <p>Не вдалося завантажити аналоги.</p>
            <button type="button" onClick={retry} className="catalog-back-retry">Спробувати ще раз</button>
          </div>
        ) : state.items.length === 0 ? (
          <p className="catalog-back-state">{crossNumbers.length ? "Товарів-аналогів у наявності поки не знайдено — напишіть нам у чат, підберемо за крос-номером." : "Аналогів для цього товару поки не знайдено. Напишіть нам у чат — підберемо заміну."}</p>
        ) : (
          <ul className="catalog-back-analogs-list">
            {state.items.map((analog) => {
              const inStock = analog.quantity > 0;
              const number = analog.article || analog.code;
              // Only stocked analogs lead somewhere; the rest are reference rows.
              const content = (
                <>
                  <span className="catalog-back-analog-thumb">
                    <ProductCardImage
                      productCode={analog.code || analog.article}
                      articleHint={analog.article || analog.code}
                      hasKnownPhoto={analog.hasPhoto !== false}
                      alt={buildVisibleProductName(analog.name)}
                      loadingMode="lazy"
                      sizes="40px"
                    />
                  </span>
                  <span className="catalog-back-analog-info">
                    <span className="catalog-back-analog-number">{number}</span>
                    {analog.producer && <span className="catalog-back-analog-producer">{analog.producer}</span>}
                  </span>
                  <span
                    className={inStock ? "catalog-back-analog-stock" : "catalog-back-analog-stock catalog-back-analog-stock--order"}
                    title={inStock ? "В наявності" : "Під замовлення"}
                  >
                    {inStock ? "В наявності" : "Під замовлення"}
                  </span>
                </>
              );
              return (
                <li key={`${analog.code}:${analog.article}`}>
                  {inStock ? (
                    <SmartLink
                      href={buildProductPath({ ...analog, code: analog.code || analog.article })}
                      prefetchOnIntent
                      className="catalog-back-analog catalog-back-analog--link"
                    >
                      {content}
                    </SmartLink>
                  ) : (
                    <div className="catalog-back-analog">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
