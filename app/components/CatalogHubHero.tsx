import type { LucideIcon } from "lucide-react";
import { ArrowRight, Sparkles } from "lucide-react";

import CatalogSectionNav, {
  type CatalogSectionId,
} from "app/components/CatalogSectionNav";
import {
  directoryActionIconClass,
  directoryPanelClass,
} from "app/components/catalog-directory-styles";
import SmartLink from "app/components/SmartLink";

interface CatalogHubStat {
  label: string;
  value: string;
  icon: LucideIcon;
}

interface CatalogHubQuickLink {
  href: string;
  label: string;
  icon: LucideIcon;
  accent?: boolean;
  prefetchOnViewport?: boolean;
}

interface CatalogHubHeroProps {
  current: CatalogSectionId;
  badge: string;
  title: string;
  description: string;
  icon: LucideIcon;
  stats?: CatalogHubStat[];
  quickLinks?: CatalogHubQuickLink[];
  highlights?: string[];
}

export default function CatalogHubHero({
  current,
  badge,
  title,
  description,
  icon: Icon,
  stats = [],
  quickLinks = [],
  highlights = [],
}: CatalogHubHeroProps) {
  return (
    <section className={`${directoryPanelClass} relative overflow-hidden select-none`}>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(240,253,250,0.8),transparent_42%,rgba(239,246,255,0.9))]" />
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-teal-200/60" />

      <div className="relative px-4 py-4 sm:px-5 sm:py-5 lg:px-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start 2xl:grid-cols-[minmax(0,1fr)_460px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display inline-flex items-center gap-2 rounded-md border border-teal-200/80 bg-teal-50 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-teal-900 shadow-[0_8px_18px_rgba(13,148,136,0.06)]">
                <Sparkles size={14} strokeWidth={2.1} />
                {badge}
              </span>
            </div>

            <div className="mt-3 flex min-w-0 items-start gap-3">
              <div className={directoryActionIconClass}>
                <Icon size={22} strokeWidth={2.15} />
              </div>

              <div className="min-w-0">
                <h1 className="font-display text-[1.7rem] font-black italic leading-[1.02] tracking-[-0.025em] text-slate-950 sm:text-[2.08rem] lg:text-[2.3rem]">
                  {title}
                </h1>
                <p className="mt-2.5 max-w-[760px] text-[14px] font-bold leading-6 text-slate-700 sm:text-[15px]">
                  {description}
                </p>
              </div>
            </div>

            {highlights.length > 0 && (
              <div className="mt-3.5 flex flex-wrap gap-2">
                {highlights.map((highlight) => (
                  <span
                    key={highlight}
                    className="font-display inline-flex rounded-full border border-white/90 bg-white/84 px-3 py-1.5 text-[11px] font-extrabold text-slate-800 shadow-[0_10px_22px_rgba(15,23,42,0.05)]"
                  >
                    {highlight}
                  </span>
                ))}
              </div>
            )}

            {quickLinks.length > 0 && (
              <div className="mt-3.5 flex flex-wrap gap-2">
                {quickLinks.map((link) => {
                  const LinkIcon = link.icon;

                  return (
                    <SmartLink
                      key={`${link.href}:${link.label}`}
                      href={link.href}
                      prefetchOnViewport={link.prefetchOnViewport}
                      className={`font-display inline-flex h-9 items-center gap-2 rounded-lg border px-3.5 text-[13px] font-extrabold italic tracking-[0.01em] transition ${
                        link.accent
                          ? "border-teal-300 bg-teal-50 text-teal-950 shadow-[0_10px_22px_rgba(13,148,136,0.1)] hover:bg-teal-100"
                          : "border-slate-200 bg-white/90 text-slate-700 hover:border-slate-300 hover:bg-white"
                      }`}
                    >
                      <LinkIcon size={16} strokeWidth={2.1} />
                      <span>{link.label}</span>
                      <ArrowRight size={14} strokeWidth={2.2} />
                    </SmartLink>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-3 xl:w-full xl:max-w-[420px] xl:justify-self-end 2xl:max-w-[460px]">
            <div className="rounded-lg border border-slate-200/80 bg-white/82 p-3 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
              <CatalogSectionNav current={current} />
              {stats.length > 0 && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  {stats.map((stat) => {
                    const StatIcon = stat.icon;

                    return (
                      <div
                        key={`${stat.label}:${stat.value}`}
                        className="rounded-md border border-slate-200 bg-white/90 px-3 py-2.5 shadow-[0_8px_18px_rgba(15,23,42,0.04)]"
                      >
                        <div className="font-display flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600">
                          <StatIcon size={14} className="text-teal-700" strokeWidth={2.1} />
                          <span>{stat.label}</span>
                        </div>
                        <p className="mt-1.5 font-display text-[15px] font-black italic leading-5 text-slate-950 sm:text-[16px]">
                          {stat.value}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
