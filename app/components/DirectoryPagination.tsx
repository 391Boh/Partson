"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const subscribeWidth = (notify: () => void) => {
  const queries = [matchMedia("(min-width:768px)"), matchMedia("(min-width:1024px)")];
  queries.forEach(query => query.addEventListener("change", notify));
  return () => queries.forEach(query => query.removeEventListener("change", notify));
};
const readColumns = () => matchMedia("(min-width:1024px)").matches ? 4 : matchMedia("(min-width:768px)").matches ? 3 : 2;

export function useDirectoryPagination<T>(items: T[], resetKey: string, maxPageSize = 12) {
  const columns = useSyncExternalStore(subscribeWidth, readColumns, () => 4);
  // Three rows per page, including narrow screens; categories need wider cards.
  const pageSize = maxPageSize === 6 ? (columns === 2 ? 3 : 6) : columns * 3;
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
    onPageChange: (next: number) => setSelection({ key: resetKey, page: Math.max(1, Math.min(next, pageCount)) }),
  };
}

type Props = {
  page: number; pageCount: number; total: number; pageSize: number;
  onPageChange: (page: number) => void;
};

export default function DirectoryPagination({ page, pageCount, total, pageSize, onPageChange }: Props) {
  const footer = useRef<HTMLDivElement>(null);
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const windowStart = Math.max(1, Math.min(page - 1, pageCount - 2));
  const pages = [...new Set([1, windowStart, windowStart + 1, windowStart + 2, pageCount])].filter(n => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  const change = (next: number) => {
    onPageChange(next);
    // Return to the search and list heading rather than the top of the page.
    const panel = footer.current?.closest<HTMLElement>(".directory-panel");
    if (!panel) return;
    const header = document.querySelector("header");
    const inset = header?.getBoundingClientRect().height ?? 64;
    const top = Math.max(0, panel.getBoundingClientRect().top + window.scrollY - inset - 16);
    window.scrollTo({ top, behavior: "instant" });
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
    </div>
  );
}
