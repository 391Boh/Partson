"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, Search, X } from "lucide-react";

interface ProducerTopGroupItem {
  label: string;
  slug: string;
  productCount: number;
}

export interface ManufacturerListItem {
  label: string;
  slug: string;
  productCount: number;
  topGroups: ProducerTopGroupItem[];
  logoPath: string | null;
  initials: string;
}

interface ManufacturersCatalogClientProps {
  producers: ManufacturerListItem[];
  initialQuery?: string;
}

export default function ManufacturersCatalogClient({
  producers,
  initialQuery = "",
}: ManufacturersCatalogClientProps) {
  const [search, setSearch] = useState(initialQuery);
  const normalizedQuery = search.trim().toLowerCase();

  const filteredProducers = useMemo(() => {
    if (!normalizedQuery) return producers;
    return producers.filter((producer) => {
      const groupTrail = producer.topGroups.map((group) => group.label).join(" ");
      const haystack = `${producer.label} ${groupTrail}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery, producers]);

  return (
    <section className="mt-2.5 flex min-h-0 flex-1">
      <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-cyan-100/80 bg-white/92 p-2.5 shadow-[0_14px_30px_rgba(8,145,178,0.12)] sm:p-3">
        <div className="pointer-events-none absolute inset-0 opacity-80 bg-[radial-gradient(circle_at_10%_10%,rgba(34,211,238,0.1),transparent_35%),radial-gradient(circle_at_88%_12%,rgba(14,165,233,0.09),transparent_34%)]" />

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700 shadow-inner">
              <Search size={14} />
            </span>
            <div>
              <h2 className="text-[13px] font-semibold italic text-slate-900 sm:text-sm">
                Швидкий пошук виробників
              </h2>
            </div>
          </div>

          <label className="relative mt-2.5 block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-500" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Пошук бренда..."
              className="h-9 w-full rounded-xl border border-slate-300 bg-white/95 px-9 text-[13px] text-slate-900 outline-none placeholder:text-slate-500 focus:border-cyan-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Очистити пошук"
                className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-cyan-200 bg-cyan-50 text-cyan-700 transition hover:bg-cyan-100"
              >
                <X size={14} />
              </button>
            )}
          </label>

          {filteredProducers.length > 0 ? (
            <div className="mt-2 grid min-h-0 flex-1 grid-cols-1 gap-1.5 overflow-y-auto pr-1 xl:grid-cols-3">
              {filteredProducers.map((producer) => {
                const params = new URLSearchParams({
                  tab: "producer",
                  producer: producer.label,
                });
                const href = `/katalog?${params.toString()}`;
                const groupsPreview = producer.topGroups
                  .slice(0, 2)
                  .map((group) => group.label)
                  .join(", ");

                return (
                  <Link
                    key={producer.slug}
                    href={href}
                    prefetch={false}
                    className="group/item relative flex items-center gap-2 rounded-xl border border-cyan-100/90 bg-[linear-gradient(120deg,rgba(255,255,255,0.95)_0%,rgba(236,254,255,0.92)_56%,rgba(224,242,254,0.9)_100%)] px-2.5 py-1.5 text-left shadow-[0_8px_16px_rgba(8,145,178,0.12)] transition hover:border-cyan-300 hover:shadow-[0_14px_28px_rgba(6,182,212,0.18)]"
                  >
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-cyan-200 bg-white text-cyan-700">
                      {producer.logoPath ? (
                        <Image
                          src={producer.logoPath}
                          alt={producer.label}
                          width={20}
                          height={20}
                          sizes="20px"
                          className="h-5 w-5 object-contain"
                        />
                      ) : (
                        <span className="text-[10px] font-semibold text-slate-600">
                          {producer.initials}
                        </span>
                      )}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-slate-800">
                        {producer.label}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {groupsPreview || "Каталог бренду"}
                      </span>
                    </span>

                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-sky-200/70 bg-white/80 text-sky-500 transition group-hover/item:border-cyan-200 group-hover/item:bg-cyan-50/90 group-hover/item:text-cyan-700">
                      <ChevronRight size={14} />
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="mt-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
              За вашим запитом брендів не знайдено.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
