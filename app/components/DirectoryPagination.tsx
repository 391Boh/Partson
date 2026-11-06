"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const subscribeWidth = (notify: () => void) => {
  const queries = [matchMedia("(min-width:768px)"), matchMedia("(min-width:1024px)"), matchMedia("(min-width:1800px)")];
  queries.forEach(query => query.addEventListener("change", notify));
  return () => queries.forEach(query => query.removeEventListener("change", notify));
};
const readColumns = () => matchMedia("(min-width:1800px)").matches ? 6 : matchMedia("(min-width:1024px)").matches ? 4 : matchMedia("(min-width:768px)").matches ? 3 : 2;

export function useDirectoryPagination<T>(items: T[], resetKey: string, maxPageSize = 12, sizing: "responsive" | "fixed" = "responsive") {
  const columns = useSyncExternalStore(subscribeWidth, readColumns, () => 4);
  const [expanded, setExpanded] = useState(false);
  // Three rows per page, including narrow screens; categories need wider cards.
  const basePageSize = sizing === "fixed" ? maxPageSize : maxPageSize === 6 ? (columns === 2 ? 3 : columns === 6 ? 9 : 6) : columns * 3;
  const pageSize = basePageSize * (expanded ? 2 : 1);
  const [selection, setSelection] = useState({ key: resetKey, page: 1 });
  // Persist the new key as well as deriving page 1, so clearing a search
  // cannot resurrect the page selected before that search began.
  if (selection.key !== resetKey) setSelection({ key: resetKey, page: 1 });
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = selection.key === resetKey ? Math.min(selection.page, pageCount) : 1;
  const offset = (page - 1) * pageSize;
  return {
    items: items.slice(offset, offset + pageSize), offset, page, pageCount,
    total: items.length, pageSize,
    pageSizeOptions: [basePageSize, basePageSize * 2],
    onPageSizeChange: (size: number) => {
      setExpanded(size > basePageSize);
      setSelection({ key: resetKey, page: 1 });
    },
    onPageChange: (next: number) => setSelection({ key: resetKey, page: Math.max(1, Math.min(next, pageCount)) }),
  };
}

type Props = {
  page: number; pageCount: number; total: number; pageSize: number;
  onPageChange: (page: number) => void;
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
};

export default function DirectoryPagination({ page, pageCount, total, pageSize, onPageChange, pageSizeOptions, onPageSizeChange }: Props) {
  const footer = useRef<HTMLDivElement>(null);
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const windowStart = Math.max(1, Math.min(page - 1, pageCount - 2));
  const pages = [...new Set([1, windowStart, windowStart + 1, windowStart + 2, pageCount])].filter(n => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  const scrollToList = () => {
    // Return to the search and list heading rather than the top of the page.
    const panel = footer.current?.closest<HTMLElement>(".directory-panel") || footer.current?.closest<HTMLElement>(".directory-collection");
    if (!panel) return;
    const header = document.querySelector("header");
    const inset = header?.getBoundingClientRect().height ?? 64;
    const top = Math.max(0, panel.getBoundingClientRect().top + window.scrollY - inset - 16);
    window.scrollTo({ top, behavior: "instant" });
  };
  const change = (next: number) => {
    onPageChange(next);
    scrollToList();
  };
  if (!total) return null;
  return (
    <div ref={footer} className="directory-pagination">
      <div className="directory-pagination-info">
        <p className="directory-pagination-summary" role="status" aria-live="polite">
          <strong>{start}–{end}</strong> із {total.toLocaleString("uk-UA")} <span>Сторінка {page} з {pageCount}</span>
        </p>
        <div className="directory-pagination-progress" aria-hidden="true"><span style={{ width: `${page / pageCount * 100}%` }} /></div>
      </div>
      {pageSizeOptions && onPageSizeChange && total > pageSizeOptions[0] && (
        <label className="directory-page-size">На сторінці
          <select aria-label="Кількість записів на сторінці" value={pageSize} onChange={(event) => {
            onPageSizeChange(Number(event.target.value));
            scrollToList();
          }}>
            {pageSizeOptions.map(size => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
      )}
      {pageCount > 1 && (
        <nav aria-label="Сторінки списку" className="directory-pagination-controls">
          <button type="button" onClick={() => change(page - 1)} disabled={page === 1} aria-label="Попередня сторінка"><ChevronLeft size={18} aria-hidden="true" /></button>
          {pages.map((number, index) => (
            <span key={number} className="directory-pagination-step">
              {index > 0 && number - pages[index - 1] > 1 && <span className="directory-pagination-gap" aria-hidden="true">…</span>}
              <button type="button" aria-label={`Сторінка ${number}`} aria-current={number === page ? "page" : undefined} data-edge={Math.abs(number - page) > 1 || undefined} onClick={() => change(number)}>{number}</button>
            </span>
          ))}
          <button type="button" onClick={() => change(page + 1)} disabled={page === pageCount} aria-label="Наступна сторінка"><ChevronRight size={18} aria-hidden="true" /></button>
        </nav>
      )}
      {pageCount > 7 && (
        <form key={page} className="directory-page-jump" onSubmit={(event) => {
          event.preventDefault();
          const value = Number(new FormData(event.currentTarget).get("page"));
          if (Number.isInteger(value) && value >= 1 && value <= pageCount) change(value);
        }}>
          <label>Сторінка <input aria-label="Номер сторінки" name="page" type="number" min={1} max={pageCount} defaultValue={page} required /></label>
          <button type="submit">Перейти</button>
        </form>
      )}
    </div>
  );
}
