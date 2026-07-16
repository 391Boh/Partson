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
    <section className={`${directoryPanelClass} group relative overflow-hidden select-none`}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_6%_0%,rgba(20,184,166,0.14),transparent_34%),radial-gradient(circle_at_94%_8%,rgba(14,165,233,0.13),transparent_36%),radial-gradient(circle_at_68%_108%,rgba(99,102,241,0.055),transparent_42%),linear-gradient(128deg,rgba(255,255,255,0.72)_0%,rgba(248,251,255,0.18)_48%,rgba(239,248,250,0.68)_100%)]" />
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-teal-300/80 to-transparent" />

      <div className="relative px-4 py-4 sm:px-5 sm:py-5 lg:px-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_480px] xl:items-start 2xl:grid-cols-[minmax(0,1fr)_520px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="directory-kicker inline-flex items-center gap-2 rounded-md border border-teal-200/80 bg-teal-50 px-3 py-1 text-[10px] uppercase text-teal-900 shadow-[0_8px_18px_rgba(13,148,136,0.06)]">
                <Sparkles size={14} strokeWidth={2.1} />
                {badge}
              </span>
            </div>

            <div className="mt-3 flex min-w-0 items-start gap-3">
              <div className={directoryActionIconClass}>
                <Icon size={22} strokeWidth={2.15} />
              </div>

              <div className="min-w-0">
                <h1 className="directory-heading-hero text-[1.65rem] leading-[1.1] text-slate-950 sm:text-[2rem] lg:text-[2.2rem]">
                  {title}
                </h1>
                <p className="mt-2.5 max-w-[760px] text-[14px] font-normal leading-6 text-slate-600 sm:text-[15px]">
                  {description}
                </p>
              </div>
            </div>

            {highlights.length > 0 && (
              <div className="mt-3.5 flex flex-wrap gap-2">
                {highlights.map((highlight) => (
                  <span
                    key={highlight}
                    className="inline-flex rounded-full border border-white/90 bg-white/84 px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-[0_10px_22px_rgba(15,23,42,0.05)]"
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
                      className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3.5 text-[13px] font-semibold tracking-[0.005em] transition ${
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

          <div className="space-y-3 xl:w-full xl:max-w-[480px] xl:justify-self-end 2xl:max-w-[520px]">
            <div className="rounded-lg border border-slate-200/80 bg-white/82 p-3 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
              <CatalogSectionNav current={current} />
              {stats.length > 0 && (
                <div className="mt-3 grid grid-cols-1 gap-2 min-[430px]:grid-cols-3">
                  {stats.map((stat) => {
                    const StatIcon = stat.icon;

                    return (
                      <div
                        key={`${stat.label}:${stat.value}`}
                        className="min-w-0 rounded-md border border-slate-200 bg-white/90 px-3 py-2.5 shadow-[0_8px_18px_rgba(15,23,42,0.04)]"
                      >
                        <div className="directory-counter-label flex min-w-0 flex-col items-start gap-1 text-[8px] uppercase text-slate-500 min-[430px]:flex-row min-[430px]:items-center min-[430px]:gap-2 min-[430px]:text-[10px]">
                          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[9px] border border-teal-200/80 bg-[linear-gradient(145deg,#ffffff,#ccfbf1)] text-teal-700 shadow-[0_6px_14px_rgba(13,148,136,0.10),inset_0_1px_0_white]">
                            <StatIcon size={13} strokeWidth={2.1} />
                          </span>
                          <span>{stat.label}</span>
                        </div>
                        <p className="directory-counter mt-1.5 break-words text-[12px] leading-4 text-slate-900 min-[430px]:text-[14px] min-[430px]:leading-5 sm:text-[15px]">
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
