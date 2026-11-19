"use client";

import { useDeferredValue, useEffect, useId, useState } from "react";
import { Search, X } from "lucide-react";

import { pluralizeUk } from "app/lib/pluralize-uk";

const normalize = (value: string) => value.replace(/\s+/g, " ").trim().toLocaleLowerCase("uk");

/** Filters the server-rendered product index in place: the links stay in the
 *  HTML for crawlers and none of them is serialized a second time as props. */
export default function ManufacturerProductIndexFilter({
  listId,
  total,
  label,
}: {
  listId: string;
  total: number;
  label: string;
}) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [matches, setMatches] = useState(total);

  useEffect(() => {
    const list = document.getElementById(listId);
    if (!list) return;
    const needle = normalize(deferredQuery);
    let count = 0;
    for (const item of list.children as HTMLCollectionOf<HTMLElement>) {
      const visible = !needle || normalize(item.textContent || "").includes(needle);
      item.hidden = !visible;
      if (visible) count += 1;
    }
    setMatches(count);
  }, [deferredQuery, listId]);

  return (
    <div className="mfr-index-filter">
      <label htmlFor={inputId} className="sr-only">{label}</label>
      <span className="mfr-index-filter-field">
        <Search size={16} strokeWidth={2.3} aria-hidden />
        <input
          id={inputId}
          type="search"
          value={query}
          autoComplete="off"
          enterKeyHint="search"
          placeholder="Фільтр за назвою чи артикулом"
          onChange={(event) => setQuery(event.target.value)}
        />
        {query ? (
          <button type="button" onClick={() => setQuery("")} aria-label="Очистити фільтр">
            <X size={16} aria-hidden />
          </button>
        ) : null}
      </span>
      <p role="status" aria-live="polite">
        {matches === 0
          ? "Нічого не знайдено — спробуйте частину артикула"
          : `${matches.toLocaleString("uk-UA")} ${pluralizeUk(matches, "товар", "товари", "товарів")}`}
      </p>
    </div>
  );
}
