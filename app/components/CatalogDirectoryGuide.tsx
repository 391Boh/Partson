import { ArrowRight, Check, type LucideIcon } from "lucide-react";

interface CatalogDirectoryGuideStep {
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

interface CatalogDirectoryGuideProps {
  badge: string;
  title: string;
  paragraphs: string[];
  steps: CatalogDirectoryGuideStep[];
}

export default function CatalogDirectoryGuide({
  badge,
  title,
  paragraphs,
  steps,
}: CatalogDirectoryGuideProps) {
  return (
    <section className="relative pb-3 pt-0 sm:pb-4">
      <div className="page-shell-inline">
        <div className="relative overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/94 shadow-[0_18px_44px_rgba(15,23,42,0.07)] ring-1 ring-white/85">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_5%_-4%,rgba(20,184,166,0.13),transparent_35%),radial-gradient(circle_at_96%_4%,rgba(14,165,233,0.12),transparent_37%),linear-gradient(125deg,rgba(255,255,255,0.26)_0%,transparent_54%,rgba(241,248,255,0.44)_100%)]" />

          <div className="relative grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)] lg:items-center lg:p-6">
            <div className="min-w-0">
              <span className="directory-kicker inline-flex items-center gap-2 rounded-[10px] border border-teal-200/80 bg-teal-50/90 px-2.5 py-1 text-[10px] uppercase text-teal-900">
                <Check size={13} strokeWidth={2.4} />
                {badge}
              </span>
              <h2 className="directory-heading mt-3 max-w-[640px] text-[22px] leading-[1.16] text-slate-950 sm:text-[26px]">
                {title}
              </h2>
              <div className="mt-3 max-w-[680px] space-y-2.5 text-[14px] leading-6 text-slate-600 sm:text-[15px]">
                {paragraphs.map((paragraph, index) => (
                  <p
                    key={paragraph}
                    className={index === 0 ? "font-semibold text-slate-700" : undefined}
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>

            <ol className="grid gap-2.5 sm:grid-cols-3">
              {steps.map((step, index) => {
                const StepIcon = step.icon;

                return (
                  <li
                    key={`${step.label}:${step.title}`}
                    className="group/step relative min-w-0 overflow-hidden rounded-[18px] border border-slate-200/80 bg-[radial-gradient(circle_at_100%_0%,rgba(186,230,253,0.21),transparent_42%),linear-gradient(145deg,rgba(255,255,255,0.995)_0%,rgba(247,251,254,0.96)_55%,rgba(241,249,247,0.92)_100%)] p-3.5 shadow-[0_11px_26px_rgba(15,23,42,0.05)] transition-[border-color,box-shadow,background-color] duration-300 before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_16%_8%,rgba(45,212,191,0.14),transparent_38%),radial-gradient(circle_at_92%_92%,rgba(56,189,248,0.10),transparent_42%)] before:opacity-0 before:transition-opacity before:duration-300 hover:border-teal-300/80 hover:shadow-[0_17px_36px_rgba(13,148,136,0.11)] hover:before:opacity-100"
                  >
                    <div className="relative flex items-center justify-between gap-3">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] border border-cyan-200/80 bg-[linear-gradient(145deg,#ffffff_0%,#e5f6fa_52%,#dcf7ef_100%)] text-teal-700 shadow-[0_8px_20px_rgba(13,148,136,0.09),inset_0_1px_0_white] transition-[border-color,box-shadow,color] duration-300 group-hover/step:border-teal-300 group-hover/step:text-teal-800 group-hover/step:shadow-[0_11px_24px_rgba(13,148,136,0.14)]">
                        <StepIcon size={17} strokeWidth={2.1} />
                      </span>
                      <span className="directory-counter-label text-[9px] uppercase text-slate-400">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <p className="directory-kicker relative mt-3 text-[9px] uppercase text-teal-700">
                      {step.label}
                    </p>
                    <h3 className="directory-card-title relative mt-1 text-[15px] leading-5 text-slate-900">
                      {step.title}
                    </h3>
                    <p className="relative mt-1.5 text-[12px] leading-5 text-slate-600">
                      {step.description}
                    </p>
                    {index < steps.length - 1 ? (
                      <ArrowRight
                        size={14}
                        className="absolute bottom-3 right-3 hidden text-teal-500/70 lg:block"
                        aria-hidden="true"
                      />
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
