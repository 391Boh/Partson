"use client";

import type { ReactNode } from "react";
import { ChevronDown, SearchCode } from "lucide-react";

interface SeoDisclosureProps {
  title: string;
  children: ReactNode;
  summaryLabel?: string;
  className?: string;
  bodyClassName?: string;
  titleClassName?: string;
}

const joinClasses = (...values: Array<string | undefined>) =>
  values.filter(Boolean).join(" ");

export default function SeoDisclosure({
  title,
  children,
  summaryLabel = "Пошукові запити",
  className,
  bodyClassName,
  titleClassName,
}: SeoDisclosureProps) {
  return (
    <details
      className={joinClasses(
        "group rounded-[18px] border border-white/75 bg-white/72 px-4 py-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)] backdrop-blur-sm select-none sm:px-5",
        className
      )}
    >
      <summary className="details-summary-reset flex cursor-pointer list-none items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-800">
          <SearchCode size={14} strokeWidth={2.1} />
          {summaryLabel}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
          <span>Натисніть, щоб розгорнути</span>
          <ChevronDown
            size={14}
            className="transition-transform duration-200 group-open:rotate-180"
          />
        </span>
      </summary>

      <div className="mt-4 border-t border-slate-200/70 pt-4">
        <h2
          className={joinClasses(
            "text-lg font-semibold tracking-tight text-slate-900 sm:text-xl",
            titleClassName
          )}
        >
          {title}
        </h2>
        <div
          className={joinClasses(
            "mt-3 text-[12px] leading-6 text-slate-600 sm:text-[13px]",
            bodyClassName
          )}
        >
          {children}
        </div>
      </div>
    </details>
  );
}
