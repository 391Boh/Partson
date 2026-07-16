import { ArrowRight, CheckCircle2, type LucideIcon } from "lucide-react";

import SmartLink from "app/components/SmartLink";

interface CatalogSeoTopic {
  title: string;
  text: string;
  icon: LucideIcon;
}

interface CatalogSeoLink {
  href: string;
  label: string;
}

interface CatalogSeoTextSectionProps {
  badge: string;
  title: string;
  lead: string;
  paragraphs: string[];
  topics: CatalogSeoTopic[];
  links: CatalogSeoLink[];
  contained?: boolean;
}

export default function CatalogSeoTextSection({
  badge,
  title,
  lead,
  paragraphs,
  topics,
  links,
  contained = true,
}: CatalogSeoTextSectionProps) {
  return (
    <section className="relative pb-6 pt-3 sm:pb-8 sm:pt-4" aria-labelledby="catalog-seo-heading">
      <div className={contained ? "page-shell-inline" : undefined}>
        <article className="relative overflow-hidden rounded-[24px] border border-white/90 bg-[radial-gradient(circle_at_5%_-4%,rgba(20,184,166,0.12),transparent_35%),radial-gradient(circle_at_96%_4%,rgba(14,165,233,0.12),transparent_37%),radial-gradient(circle_at_52%_110%,rgba(99,102,241,0.045),transparent_42%),linear-gradient(142deg,rgba(255,255,255,0.99)_0%,rgba(248,251,255,0.97)_55%,rgba(243,250,248,0.94)_100%)] p-4 shadow-[0_20px_48px_rgba(15,23,42,0.065)] ring-1 ring-slate-200/65 sm:p-5 lg:p-6">
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-teal-300/80 to-transparent" />

          <header className="max-w-4xl">
            <span className="directory-kicker inline-flex items-center gap-2 rounded-[10px] border border-teal-200/80 bg-teal-50/90 px-2.5 py-1 text-[10px] uppercase text-teal-900">
              <CheckCircle2 size={13} strokeWidth={2.3} />
              {badge}
            </span>
            <h2
              id="catalog-seo-heading"
              className="directory-heading mt-3 text-[23px] leading-[1.12] text-slate-950 sm:text-[28px]"
            >
              {title}
            </h2>
            <p className="mt-3 max-w-3xl text-[15px] font-semibold leading-7 text-slate-700">
              {lead}
            </p>
          </header>

          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            {topics.map((topic) => {
              const TopicIcon = topic.icon;

              return (
                <section
                  key={topic.title}
                  className="rounded-[18px] border border-slate-200/75 bg-[radial-gradient(circle_at_100%_0%,rgba(186,230,253,0.22),transparent_40%),linear-gradient(145deg,rgba(255,255,255,0.99)_0%,rgba(247,251,254,0.96)_58%,rgba(241,249,247,0.92)_100%)] p-4 shadow-[0_11px_26px_rgba(15,23,42,0.045)]"
                >
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-[13px] border border-cyan-200/75 bg-[linear-gradient(145deg,#ffffff_0%,#e7f5fb_52%,#def7f0_100%)] text-teal-700 shadow-[0_8px_20px_rgba(13,148,136,0.09),inset_0_1px_0_white]">
                    <TopicIcon size={18} strokeWidth={2.1} />
                  </span>
                  <h3 className="directory-card-title mt-3 text-[17px] leading-5 text-slate-900">
                    {topic.title}
                  </h3>
                  <p className="mt-2 text-[13px] leading-6 text-slate-600">
                    {topic.text}
                  </p>
                </section>
              );
            })}
          </div>

          <div className="mt-5 grid gap-5 border-t border-slate-200/75 pt-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="max-w-4xl space-y-3 text-[14px] leading-7 text-slate-600 sm:text-[15px]">
              {paragraphs.map((paragraph, index) => (
                <p key={paragraph} className={index === 0 ? "font-medium text-slate-700" : undefined}>
                  {paragraph}
                </p>
              ))}
            </div>

            <nav aria-label="Корисні переходи" className="flex flex-wrap gap-2 lg:max-w-sm lg:justify-end">
              {links.map((link, index) => (
                <SmartLink
                  key={`${link.href}:${link.label}`}
                  href={link.href}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-[12px] border px-3.5 text-[13px] font-bold transition-[border-color,box-shadow,background-color,color] duration-300 ${
                    index === 0
                      ? "border-teal-300/75 bg-[linear-gradient(135deg,#f1fcfd_0%,#dff8f3_100%)] text-teal-900 shadow-[0_8px_20px_rgba(13,148,136,0.09)] hover:border-teal-400 hover:shadow-[0_11px_24px_rgba(13,148,136,0.14)]"
                      : "border-slate-200 bg-white/90 text-slate-700 hover:border-cyan-300 hover:bg-cyan-50/70 hover:text-sky-800"
                  }`}
                >
                  {link.label}
                  <ArrowRight size={14} strokeWidth={2.2} />
                </SmartLink>
              ))}
            </nav>
          </div>
        </article>
      </div>
    </section>
  );
}
