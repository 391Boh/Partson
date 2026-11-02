"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import type { useRowCappedList } from "app/lib/row-capped-list";

export default function FilterListNavigation({ navigation, label }: {
  navigation: ReturnType<typeof useRowCappedList>;
  label: string;
}) {
  if (!navigation.overflow) return null;
  return (
    <div className="filter-list-navigation" role="group" aria-label={`Навігація: ${label}`}>
      <button type="button" onClick={() => navigation.scrollList(-1)} disabled={!navigation.above} aria-label="Попередні пункти списку">
        <ChevronUp size={18} aria-hidden />
      </button>
      <span className="filter-list-navigation-count">
        <span>{navigation.start}–{navigation.end}</span>
        <span>із {navigation.total}</span>
      </span>
      <button type="button" onClick={() => navigation.scrollList(1)} disabled={!navigation.below} aria-label="Наступні пункти списку">
        <ChevronDown size={18} aria-hidden />
      </button>
    </div>
  );
}
