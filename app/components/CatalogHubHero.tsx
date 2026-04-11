import type { LucideIcon } from "lucide-react";
import { ArrowRight, Sparkles } from "lucide-react";

import CatalogSectionNav, {
  type CatalogSectionId,
} from "app/components/CatalogSectionNav";
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
    <section className="relative overflow-hidden rounded-[28px] border border-white/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.97),rgba(248,250,252,0.95),rgba(224,242,254,0.88))] shadow-[0_22px_54px_rgba(15,23,42,0.09)] backdrop-blur-xl select-none">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_12%,rgba(14,165,233,0.16),transparent_28%),radial-gradient(circle_at_90%_10%,rgba(34,211,238,0.14),transparent_24%),linear-gradient(130deg,rgba(255,255,255,0.08),transparent_64%)]" />
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-white/80" />

      <div className="relative px-4 py-4 sm:px-5 sm:py-5 lg:px-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start 2xl:grid-cols-[minmax(0,1fr)_460px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200/80 bg-cyan-50/92 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-800 shadow-[0_10px_20px_rgba(8,145,178,0.08)]">
                <Sparkles size={14} strokeWidth={2.1} />
                {badge}
              </span>
            </div>

            <div className="mt-3 flex min-w-0 items-start gap-3">
              <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] border border-cyan-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(224,242,254,0.88))] text-cyan-800 shadow-[0_14px_24px_rgba(8,145,178,0.12)] sm:h-12 sm:w-12">
                <Icon size={22} strokeWidth={2.15} />
              </div>

              <div className="min-w-0">
                <h1 className="font-display-italic text-[1.55rem] leading-[0.98] tracking-[-0.05em] text-slate-950 sm:text-[1.95rem] lg:text-[2.15rem]">
                  {title}
                </h1>
                <p className="mt-2.5 max-w-[760px] text-sm leading-5.5 text-slate-600 sm:text-[14px]">
                  {description}
                </p>
              </div>
            </div>

            {highlights.length > 0 && (
              <div className="mt-3.5 flex flex-wrap gap-2">
                {highlights.map((highlight) => (
                  <span
                    key={highlight}
                    className="inline-flex rounded-full border border-white/90 bg-white/84 px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-[0_10px_22px_rgba(15,23,42,0.05)]"
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
                      className={`inline-flex h-9 items-center gap-2 rounded-[14px] border px-3.5 text-[13px] font-semibold transition ${
                        link.accent
                          ? "border-cyan-300 bg-cyan-50 text-cyan-950 shadow-[0_12px_24px_rgba(8,145,178,0.12)] hover:bg-cyan-100"
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
            <div className="rounded-[22px] border border-white/80 bg-white/76 p-3 shadow-[0_14px_30px_rgba(15,23,42,0.06)]">
              <CatalogSectionNav current={current} />
              {stats.length > 0 && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  {stats.map((stat) => {
                    const StatIcon = stat.icon;

                    return (
                      <div
                        key={`${stat.label}:${stat.value}`}
                        className="rounded-[18px] border border-white/80 bg-white/88 px-3 py-2.5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]"
                      >
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                          <StatIcon size={14} className="text-cyan-700" strokeWidth={2.1} />
                          <span>{stat.label}</span>
                        </div>
                        <p className="mt-1.5 text-[14px] font-extrabold leading-5 text-slate-900 sm:text-[15px]">
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
