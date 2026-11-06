"use client";

import { Children, cloneElement, isValidElement, useDeferredValue, useId, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import DirectoryPagination, { useDirectoryPagination } from "./DirectoryPagination";

/** Keeps server-rendered cards and their destinations intact while paging locally. */
export default function DirectoryCollection({ children, labels, className, as = "div", placeholder = "Пошук у списку", pageSize = 6 }: {
  children: ReactNode;
  labels: string[];
  className: string;
  as?: "div" | "ul";
  placeholder?: string;
  pageSize?: number;
}) {
  const [query, setQuery] = useState("");
  const inputId = useId();
  const normalized = useDeferredValue(query).trim().toLocaleLowerCase("uk");
  const cards = useMemo(() => Children.toArray(children), [children]);
  const matches = useMemo(() => cards.map((card, index) => ({ card, index, label: labels[index] || "" })).filter(
    (entry) => !normalized || entry.label.toLocaleLowerCase("uk").includes(normalized)
  ), [cards, labels, normalized]);
  // Server and client show the same cards before hydration, at every width.
  const pagination = useDirectoryPagination(matches, normalized, pageSize, "fixed");
  const List = as;
  const visible = useMemo(() => new Set(pagination.items.map((entry) => entry.index)), [pagination.items]);
  return (
    <div className="directory-collection">
      {/* A list that fits on one page needs neither search nor pages. */}
      {cards.length > pageSize ? <div className="directory-collection-toolbar">
        <label htmlFor={inputId}>Знайдіть потрібний розділ <span>{matches.length} із {cards.length}</span></label>
        <div className="directory-collection-search">
          <Search size={17} aria-hidden="true" />
          <input id={inputId} type="search" placeholder={placeholder} value={query} onChange={(event) => setQuery(event.target.value)} />
          {query && <button type="button" aria-label="Очистити пошук у списку" onClick={() => setQuery("")}><X size={16} aria-hidden="true" /></button>}
        </div>
      </div> : null}
      {/* Every card stays in the HTML so crawlers reach each section's link;
          cards outside the current page or search are only hidden. */}
      <List className={className} hidden={!matches.length}>
        {cards.map((card, index) => visible.has(index) || !isValidElement(card)
          ? card
          : cloneElement(card as ReactElement<{ hidden?: boolean }>, { hidden: true }))}
      </List>
      {matches.length ? null : (
        <div className="directory-collection-empty" role="status"><p>За запитом «{query}» розділів не знайдено.</p><button type="button" onClick={() => setQuery("")}>Показати всі розділи</button></div>
      )}
      {pagination.pageCount > 1 ? <DirectoryPagination {...pagination} /> : null}
    </div>
  );
}
