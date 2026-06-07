import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Sparkles, Wrench } from "lucide-react";
import HeroAccountClient from "./HeroAccountClient";

const depthBackground = [
  "radial-gradient(circle at 18% 18%, rgba(56,189,248,0.22), transparent 42%)",
  "radial-gradient(circle at 86% 12%, rgba(59,130,246,0.16), transparent 38%)",
  "linear-gradient(180deg, rgba(7,15,30,0.98) 0%, rgba(15,23,42,0.95) 38%, rgba(30,64,175,0.2) 100%)",
].join(", ");

const cardGradientBase =
  "bg-gradient-to-b from-slate-950/44 via-slate-900/24 to-sky-200/12";
const cardGradientHover =
  "motion-safe:hover:bg-white/[0.11]";
const cardInteractionStatic =
  "transition-[box-shadow,background-color,border-color] duration-300 ease-out";
const heroHeadingText =
  "font-display font-black italic leading-[0.98] tracking-[-0.06em] text-transparent bg-clip-text bg-gradient-to-r from-sky-100 via-white to-sky-200";

const Hero = () => {
  return (
    <section
      className="home-glow-section home-glow-section-indigo hero-section-smooth group/hero font-ui relative isolate flex min-h-0 w-full select-none items-start overflow-hidden py-4 sm:items-center sm:py-7 lg:py-8"
      style={{
        backgroundImage: depthBackground,
      }}
      >
      <span className="pointer-events-none absolute inset-0 bg-[image:radial-gradient(circle_at_20%_5%,rgba(56,189,248,0.16),transparent_42%),radial-gradient(circle_at_88%_10%,rgba(37,99,235,0.09),transparent_46%),radial-gradient(circle_at_60%_80%,rgba(14,165,233,0.06),transparent_54%)] opacity-60" />
      <span className="pointer-events-none absolute inset-0 bg-[image:linear-gradient(132deg,rgba(15,23,42,0.14)_0%,rgba(14,165,233,0.08)_28%,rgba(56,189,248,0.07)_58%,rgba(2,6,23,0.08)_100%)] opacity-46" />
      <div className="page-shell-inline">
        <div className="relative grid gap-4 text-slate-100 md:grid-cols-2 lg:grid-cols-3 lg:items-stretch">
          <div className="h-full min-w-0">
            <div
              tabIndex={0}
              className={`group/intro home-glass-card hero-intro-card relative flex min-h-[214px] h-full cursor-pointer flex-col justify-between gap-3 overflow-hidden rounded-2xl border border-sky-100/18 p-4 shadow-[0_12px_28px_rgba(2,6,23,0.24),inset_0_1px_0_rgba(255,255,255,0.08)] outline-none ${cardInteractionStatic} ${cardGradientBase} ${cardGradientHover} bg-white/10 hover:shadow-[0_14px_30px_rgba(2,6,23,0.24),inset_0_1px_0_rgba(255,255,255,0.1)] sm:min-h-[230px] sm:p-4.5 lg:min-h-0`}
            >
              <span className="pointer-events-none absolute inset-0 rounded-2xl border border-sky-200/14" />
              <div className="pointer-events-none absolute inset-0 opacity-38 transition-opacity duration-700 bg-[image:radial-gradient(circle_at_18%_18%,rgba(56,189,248,0.12),transparent_44%),radial-gradient(circle_at_88%_82%,rgba(37,99,235,0.09),transparent_48%)] group-hover/hero:opacity-44" />
              <div className="relative z-10 flex items-start gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-sky-200/34 bg-sky-100/10 text-sky-100 shadow-[0_0_18px_rgba(56,189,248,0.24)]">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 9l2-5h14l2 5" />
                    <path d="M3 9h18" />
                    <path d="M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9" />
                    <path d="M9 21v-6h6v6" />
                  </svg>
                </span>
                <div className="relative flex min-w-0 flex-1 flex-col">
                  <div className="flex w-full items-start">
                    <h1 className="font-display min-w-0 flex-1 pr-12 text-[15px] font-extrabold italic leading-[1.12] tracking-[0.01em] text-sky-50 min-[380px]:text-[16px] sm:text-[18px] md:text-[19px]">
                      <span className="block whitespace-nowrap">Інтернет-магазин</span>
                      <span className="block whitespace-nowrap text-sky-100/92">
                        автозапчастин у Львові
                      </span>
                    </h1>
                    <span className="absolute right-0 top-0 inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200/36 bg-emerald-300/12 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.13em] text-emerald-100 shadow-[0_0_12px_rgba(52,211,153,0.12)] sm:px-2 sm:text-[9px]">
                      <Sparkles className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                      New
                    </span>
                  </div>
                </div>
              </div>
              <div className="relative z-10 min-h-[94px]">
                <div
                  className="space-y-2 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/intro:pointer-events-none group-hover/intro:absolute group-hover/intro:inset-x-0 group-hover/intro:top-0 group-hover/intro:-translate-y-2 group-hover/intro:opacity-0 group-focus-within/intro:pointer-events-none group-focus-within/intro:absolute group-focus-within/intro:inset-x-0 group-focus-within/intro:top-0 group-focus-within/intro:-translate-y-2 group-focus-within/intro:opacity-0"
                >
                  <p
                    className={`${heroHeadingText} mt-1 mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[18px] leading-tight sm:text-[20px] md:mb-2 md:flex-nowrap md:items-baseline md:text-[22px] lg:text-[24px]`}
                  >
                    <Link
                      href="/"
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
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 translate-y-2 opacity-0 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/intro:pointer-events-auto group-hover/intro:relative group-hover/intro:translate-y-0 group-hover/intro:opacity-100 group-focus-within/intro:pointer-events-auto group-focus-within/intro:relative group-focus-within/intro:translate-y-0 group-focus-within/intro:opacity-100"
                >
                  <Link
                    href="/inform/diagnostics"
                    className="inline-flex w-full items-center justify-between rounded-xl border border-emerald-100/35 bg-emerald-200/16 px-3.5 py-3 text-[12px] font-black uppercase tracking-[0.12em] text-emerald-50 transition-[border-color,background-color,box-shadow,transform] duration-300 ease-out hover:-translate-y-0.5 hover:border-emerald-50/60 hover:bg-emerald-200/24 hover:shadow-[0_10px_22px_rgba(16,185,129,0.18)]"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Wrench className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                      Комп&apos;ютерна діагностика
                    </span>
                    <ChevronRight className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className="h-full min-w-0">
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <Link
                href="/"
                aria-label="Оновити сторінку"
                className="group/logo relative hidden items-center justify-center overflow-visible px-2 py-1 transition-transform duration-500 ease-out motion-safe:transform-gpu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300/80 sm:flex"
              >
                <Image
                  src="/Car-parts.png"
                  alt="PartsOn Logo"
                  width={98}
                  height={49}
                  loading="lazy"
                  className="relative z-[2] h-auto w-[72px] object-contain drop-shadow-[0_10px_20px_rgba(15,23,42,0.18)] transition-transform duration-500 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] motion-safe:transform-gpu md:w-[108px] motion-safe:group-hover/logo:-translate-y-0.5 motion-safe:group-hover/logo:scale-[1.04]"
                  sizes="(min-width: 768px) 108px, 72px"
                />
                <span className="pointer-events-none absolute left-1/2 bottom-full z-20 mb-3 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-[14px] border border-sky-200/35 bg-[image:linear-gradient(135deg,rgba(30,41,59,0.96),rgba(51,65,85,0.94))] px-4 py-2 text-center text-[12px] font-semibold tracking-[0.08em] text-slate-50 opacity-0 shadow-[0_18px_40px_rgba(15,23,42,0.34)] ring-1 ring-sky-100/10 backdrop-blur-xl transition-[opacity,transform] duration-300 ease-out after:absolute after:left-1/2 after:top-full after:h-2.5 after:w-2.5 after:-translate-x-1/2 after:-translate-y-1/2 after:rotate-45 after:border-b after:border-r after:border-sky-200/30 after:bg-slate-700 motion-safe:group-hover/logo:-translate-y-1 motion-safe:group-hover/logo:opacity-100">
                  Оновити сторінку
                </span>
              </Link>
              <HeroAccountClient
                cardGradientBase={cardGradientBase}
                cardGradientHover={cardGradientHover}
                cardInteractionStatic={cardInteractionStatic}
              />
            </div>
          </div>
          <HeroAccountClient
            cardGradientBase={cardGradientBase}
            cardGradientHover={cardGradientHover}
            cardInteractionStatic={cardInteractionStatic}
            variant="benefits"
          />
        </div>
      </div>
    </section>
  );
};

export default Hero;
