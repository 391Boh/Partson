import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Sparkles } from "lucide-react";

import CatalogSectionNav, {
  type CatalogSectionId,
} from "app/components/CatalogSectionNav";

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
}

interface CatalogHubHeroProps {
  current: CatalogSectionId;
  badge: string;
  title: string;
  description: string;
  icon: LucideIcon;
  stats?: CatalogHubStat[];
  quickLinks?: CatalogHubQuickLink[];
}

export default function CatalogHubHero({
  current,
  badge,
  title,
  description,
  icon: Icon,
  stats = [],
  quickLinks = [],
}: CatalogHubHeroProps) {
  return (
    <section className="relative overflow-hidden rounded-[24px] border border-white/75 bg-[image:linear-gradient(180deg,rgba(255,255,255,0.88)_0%,rgba(240,249,255,0.8)_100%)] shadow-[0_22px_54px_rgba(15,23,42,0.08)] backdrop-blur-xl select-none">
      <div className="pointer-events-none absolute inset-0 bg-[image:radial-gradient(circle_at_12%_16%,rgba(34,211,238,0.18),transparent_28%),radial-gradient(circle_at_88%_12%,rgba(14,165,233,0.14),transparent_26%),linear-gradient(135deg,rgba(255,255,255,0.12),transparent_62%)]" />
      <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-white/70" />

      <div className="relative px-5 py-5 sm:px-6 lg:px-7 lg:py-6">
        <div className="flex flex-wrap items-start justify-between gap-4 lg:grid lg:grid-cols-3 lg:justify-normal lg:gap-4">
          <div className="flex min-w-0 items-start gap-4 lg:col-span-2">
            <div className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] border border-cyan-200/80 bg-[image:linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(224,242,254,0.88)_100%)] text-cyan-800 shadow-[0_18px_30px_rgba(8,145,178,0.16)]">
              <Icon size={26} strokeWidth={2.2} />
            </div>

            <div className="min-w-0">
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200/80 bg-cyan-50/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-800">
                <Sparkles size={14} strokeWidth={2.1} />
                {badge}
              </span>
              <h1 className="font-display-italic mt-3 text-2xl tracking-[-0.048em] text-slate-900 sm:text-3xl lg:text-[2rem]">
                {title}
              </h1>
              <p className="mt-3 max-w-[860px] text-sm leading-6 text-slate-600 sm:text-[15px]">
                {description}
              </p>
            </div>
          </div>

          <div className="lg:col-start-3 lg:flex lg:justify-end">
            <CatalogSectionNav current={current} />
          </div>
        </div>

        {stats.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {stats.map((stat) => {
              const StatIcon = stat.icon;

              return (
                <span
                  key={`${stat.label}:${stat.value}`}
                  className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.05)]"
                >
                  <StatIcon size={14} className="text-cyan-700" strokeWidth={2.1} />
                  <span>{stat.label}: {stat.value}</span>
                </span>
              );
            })}
          </div>
        )}

        {quickLinks.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {quickLinks.map((link) => {
              const LinkIcon = link.icon;

              return (
                <Link
                  key={`${link.href}:${link.label}`}
                  href={link.href}
                  className={`inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition ${
                    link.accent
                      ? "border-cyan-300 bg-cyan-50 text-cyan-900 shadow-[0_12px_24px_rgba(8,145,178,0.12)] hover:bg-cyan-100"
                      : "border-slate-200 bg-white/88 text-slate-700 hover:border-slate-300 hover:bg-white"
                  }`}
                >
                  <LinkIcon size={16} strokeWidth={2.1} />
                  <span>{link.label}</span>
                  <ArrowRight size={14} strokeWidth={2.2} />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
