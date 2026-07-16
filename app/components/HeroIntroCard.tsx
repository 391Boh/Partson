'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BookOpen, ChevronRight, Sparkles, Wrench, RotateCcw } from 'lucide-react';

const heroHeadingText =
  'font-display font-black italic leading-[0.98] tracking-[-0.06em] text-transparent bg-clip-text bg-gradient-to-r from-sky-100 via-white to-sky-200';
const heroQuickLinkText =
  'font-display text-[13px] font-extrabold italic leading-none tracking-[0.02em] sm:text-[14px]';
const cardGradientBase =
  'bg-gradient-to-b from-slate-950/44 via-slate-900/24 to-sky-200/12';

export default function HeroIntroCard() {
  const [flipped, setFlipped] = useState(false);

  return (
    <div
      className="h-full min-w-0 overflow-hidden rounded-2xl [perspective:1200px]"
      style={{ minHeight: 214 }}
    >
      {/* flip container */}
      <div
        onClick={() => setFlipped((v) => !v)}
        className={`relative h-full w-full cursor-pointer [transform-style:preserve-3d] [will-change:transform] transition-transform duration-[640ms] ease-[cubic-bezier(0.4,0.2,0.2,1)] ${
          flipped ? '[transform:rotateY(180deg)]' : '[transform:rotateY(0deg)]'
        }`}
        style={{ minHeight: 214 }}
        role="button"
        tabIndex={0}
        aria-expanded={flipped}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setFlipped((v) => !v)}
      >
        {/* ── FRONT ─────────────────────────────────────────────── */}
        <div
          className={`group/front absolute inset-0 flex flex-col justify-between gap-3 overflow-hidden rounded-2xl border border-sky-100/18 p-4 shadow-[0_12px_28px_rgba(2,6,23,0.28),0_4px_12px_rgba(56,189,248,0.18),inset_0_1px_0_rgba(255,255,255,0.10)] outline-none transition-[border-color,box-shadow] duration-400 ease-out hover:border-sky-200/38 hover:shadow-[0_22px_48px_rgba(14,116,144,0.28),0_8px_24px_rgba(56,189,248,0.28),inset_0_1px_0_rgba(255,255,255,0.18)] ${cardGradientBase} bg-white/10 sm:p-4.5 [backface-visibility:hidden] [transform:translateZ(1px)]`}
        >
          {/* static ambient radials */}
          <div className="pointer-events-none absolute inset-0 opacity-55 bg-[image:radial-gradient(circle_at_18%_18%,rgba(56,189,248,0.20),transparent_44%),radial-gradient(circle_at_88%_82%,rgba(37,99,235,0.14),transparent_48%),radial-gradient(ellipse_92%_54%_at_50%_108%,rgba(56,189,248,0.12)_0%,rgba(14,165,233,0.05)_38%,transparent_68%)]" />
          {/* hover shimmer sweep */}
          <span className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-500 group-hover/front:opacity-100 bg-[image:linear-gradient(125deg,rgba(255,255,255,0.05)_0%,rgba(56,189,248,0.10)_38%,rgba(125,211,252,0.06)_58%,transparent_78%)]" />
          {/* hover border glow ring */}
          <span className="pointer-events-none absolute inset-0 rounded-2xl border border-sky-300/0 transition-[border-color,box-shadow] duration-500 group-hover/front:border-sky-300/28 group-hover/front:shadow-[inset_0_0_28px_rgba(56,189,248,0.06)]" />

          {/* header row */}
          <div className="relative z-10 flex items-center gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-sky-200/34 bg-sky-100/10 text-sky-100 shadow-[0_0_18px_rgba(56,189,248,0.24)] transition-shadow duration-400 group-hover/front:shadow-[0_0_26px_rgba(56,189,248,0.40)]">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 9l2-5h14l2 5" />
                <path d="M3 9h18" />
                <path d="M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9" />
                <path d="M9 21v-6h6v6" />
              </svg>
            </span>
            <h1 className="font-display min-w-0 flex-1 text-[15px] font-extrabold italic leading-[1.12] tracking-[0.01em] text-sky-50 min-[380px]:text-[16px] sm:text-[18px] md:text-[19px]">
              <span className="block whitespace-nowrap">Інтернет-магазин</span>{" "}
              <span className="block whitespace-nowrap text-sky-100/92">автозапчастин у Львові</span>
            </h1>
          </div>

          {/* main text */}
          <div className="relative z-10 space-y-3">
            <div className="space-y-2">
              <p className={`${heroHeadingText} mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[18px] leading-tight sm:text-[20px] md:mb-2 md:flex-nowrap md:items-baseline md:text-[22px] lg:text-[24px]`}>
                <Link
                  href="/"
                  prefetch={false}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[20px] no-underline sm:text-[23px] md:text-[25px] lg:text-[27px]"
                >
                  PartsON
                </Link>
                <span className="text-[17px] sm:text-[19px] md:text-[21px] lg:text-[23px]">
                  — знайдеться все!
                </span>
              </p>
              <p className="font-display relative max-w-[34ch] text-left text-sm font-semibold italic leading-relaxed tracking-[0.04em] text-sky-100/90 sm:text-base md:text-[17px] after:mt-2 after:block after:h-0.5 after:w-20 after:bg-gradient-to-r after:from-sky-300/80 after:via-white/30 after:to-transparent">
                Кожна деталь важлива...
              </p>
            </div>

            {/* Новинки CTA */}
            <div className="group/news relative w-full overflow-hidden rounded-xl border border-sky-300/26 bg-gradient-to-r from-sky-500/16 via-blue-500/12 to-sky-500/16 px-4 py-2 shadow-[0_4px_18px_rgba(56,189,248,0.14),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-sm transition-[border-color,box-shadow,background] duration-300 ease-out hover:border-sky-300/52 hover:from-sky-500/26 hover:via-blue-500/22 hover:to-sky-500/26 hover:shadow-[0_8px_28px_rgba(56,189,248,0.28),0_0_0_1px_rgba(56,189,248,0.10),inset_0_1px_0_rgba(255,255,255,0.16)]">
              {/* sweep shine on hover */}
              <span className="pointer-events-none absolute inset-0 -translate-x-full skew-x-[-18deg] bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-500 ease-out group-hover/news:translate-x-full" />
              <span className="relative flex items-center justify-between">
                <span className="flex items-center gap-2 transition-transform duration-300 ease-out group-hover/news:scale-[1.07]">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-sky-300/32 bg-sky-400/16 shadow-[0_0_12px_rgba(56,189,248,0.20)] transition-shadow duration-300 group-hover/news:shadow-[0_0_20px_rgba(56,189,248,0.40)]">
                    <Sparkles className="animate-sparkle h-3 w-3 text-sky-100" strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <span className="font-display text-[13px] font-extrabold italic tracking-[0.05em] text-sky-50 sm:text-[14px]">
                    Новинки
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-sky-200/70 transition-transform duration-300 group-hover/news:translate-x-1" strokeWidth={2.2} aria-hidden="true" />
              </span>
            </div>
          </div>
        </div>

        {/* ── BACK ──────────────────────────────────────────────── */}
        <div
          className={`absolute inset-0 flex flex-col gap-3 overflow-hidden rounded-2xl border border-sky-100/22 p-4 shadow-[0_12px_28px_rgba(2,6,23,0.32),0_4px_12px_rgba(56,189,248,0.22),inset_0_1px_0_rgba(255,255,255,0.12)] outline-none bg-gradient-to-b from-slate-900/60 via-slate-950/50 to-sky-950/40 bg-white/10 sm:p-4.5 [backface-visibility:hidden] [transform:rotateY(180deg)_translateZ(1px)]`}
        >
          <span className="pointer-events-none absolute inset-0 rounded-2xl border border-sky-200/18" />
          <div className="pointer-events-none absolute inset-0 opacity-60 bg-[image:radial-gradient(ellipse_110%_70%_at_20%_10%,rgba(56,189,248,0.18)_0%,transparent_60%),radial-gradient(ellipse_80%_60%_at_80%_90%,rgba(37,99,235,0.14)_0%,transparent_58%)]" />

          {/* back label */}
          <div className="relative z-10 flex items-center gap-2">
            <span className="font-display text-[11px] font-extrabold italic tracking-[0.08em] text-sky-200/70 sm:text-[12px]">
              Новинки
            </span>
            <span className="h-px flex-1 bg-gradient-to-r from-sky-400/30 to-transparent" />
          </div>

          {/* buttons */}
          <div className="relative z-10 flex flex-1 flex-col justify-center gap-2.5">
            <Link
              href="/inform/diagnostics"
              prefetch={false}
              onClick={(e) => e.stopPropagation()}
              className={`group/diag inline-flex min-h-[44px] items-center justify-between rounded-xl border border-emerald-100/32 bg-emerald-300/14 px-4 py-2 text-emerald-50 shadow-[0_4px_14px_rgba(16,185,129,0.10)] transition-[border-color,box-shadow] duration-300 ease-out hover:border-emerald-50/55 hover:shadow-[0_10px_24px_rgba(16,185,129,0.18)] ${heroQuickLinkText}`}
            >
              <span className="inline-flex min-w-0 items-center gap-2.5 transition-transform duration-300 ease-out group-hover/diag:scale-[1.07]">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-emerald-200/30 bg-emerald-300/14">
                  <Wrench className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                </span>
                <span className="truncate">Комп&apos;ютерна діагностика</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 opacity-70 transition-transform duration-300 group-hover/diag:translate-x-1" strokeWidth={2.2} aria-hidden="true" />
            </Link>
            <Link
              href="/blog"
              prefetch={false}
              onClick={(e) => e.stopPropagation()}
              className={`group/blog inline-flex min-h-[44px] items-center justify-between rounded-xl border border-sky-100/28 bg-sky-300/14 px-4 py-2 text-sky-50 shadow-[0_4px_14px_rgba(14,165,233,0.10)] transition-[border-color,box-shadow] duration-300 ease-out hover:border-sky-100/52 hover:shadow-[0_10px_24px_rgba(14,165,233,0.18)] ${heroQuickLinkText}`}
            >
              <span className="inline-flex min-w-0 items-center gap-2.5 transition-transform duration-300 ease-out group-hover/blog:scale-[1.07]">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-sky-200/28 bg-sky-300/14">
                  <BookOpen className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                </span>
                <span className="truncate">Блог</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 opacity-70 transition-transform duration-300 group-hover/blog:translate-x-1" strokeWidth={2.2} aria-hidden="true" />
            </Link>
          </div>

          {/* back button */}
          <div className="relative z-10 flex justify-end">
            <button
              onClick={(e) => { e.stopPropagation(); setFlipped(false); }}
              className="inline-flex items-center gap-1 rounded-full border border-sky-200/24 bg-sky-100/8 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.10em] text-sky-200/70 transition-[border-color,background-color] duration-200 hover:border-sky-200/50 hover:bg-sky-100/16 hover:text-sky-100"
              tabIndex={-1}
              aria-label="Назад"
            >
              <RotateCcw className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
              Назад
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
