"use client";

import Image from "next/image";
import type { FC, SyntheticEvent } from "react";
import { LogIn, UserPlus } from "lucide-react";

interface HeroProps {
  isAuthenticated: boolean;
  authReady?: boolean;
  onLogin: () => void;
  onRegister: () => void;
  onAddVin?: () => void;
}

const benefitItems = [
  "5% знижка на перше замовлення",
  "Пріоритетна підтримка",
  "Професійний підбір",
];

const depthBackground = [
  "radial-gradient(circle at 18% 18%, rgba(56,189,248,0.22), transparent 42%)",
  "radial-gradient(circle at 86% 12%, rgba(59,130,246,0.16), transparent 38%)",
  "linear-gradient(180deg, rgba(7,15,30,0.98) 0%, rgba(15,23,42,0.95) 38%, rgba(30,64,175,0.2) 100%)",
].join(", ");

const cardGradientBase =
  "bg-gradient-to-b from-slate-950/42 via-slate-900/24 to-sky-200/12";
const cardGradientHover =
  "motion-safe:hover:from-slate-950/36 motion-safe:hover:via-slate-900/20 motion-safe:hover:to-sky-200/18";
const cardInteractionStatic =
  "transition-[box-shadow,background-color,border-color] duration-300 ease-out";
const heroHeadingText =
  "font-display font-black italic leading-[0.98] tracking-[-0.06em] text-transparent bg-clip-text bg-gradient-to-r from-sky-100 via-white to-sky-200";

const actionButtonBase = [
  "inline-flex",
  "items-center",
  "gap-2",
  "justify-center",
  "rounded-[14px]",
  "px-5",
  "py-2.5",
  "font-ui",
  "text-[11px]",
  "font-bold",
  "tracking-[0.12em]",
  "uppercase",
  "transition-[box-shadow,filter,background-color,border-color]",
  "duration-400",
  "ease-out",
  "focus-visible:outline",
  "focus-visible:outline-2",
  "focus-visible:outline-offset-2",
  "focus-visible:outline-sky-300/80",
  "select-none",
  "disabled:opacity-60",
  "disabled:cursor-not-allowed",
].join(" ");

const primaryButton = `${actionButtonBase} border border-sky-100/35 bg-[image:linear-gradient(135deg,rgba(239,246,255,0.98)_0%,rgba(191,219,254,0.94)_34%,rgba(125,211,252,0.92)_68%,rgba(59,130,246,0.9)_100%)] text-slate-900 shadow-[0_10px_22px_rgba(56,189,248,0.24)] motion-safe:hover:border-sky-50/55 motion-safe:hover:brightness-[1.02] motion-safe:hover:shadow-[0_0_0_1px_rgba(255,255,255,0.16),0_14px_30px_rgba(56,189,248,0.28)]`;
const loginButton = `${primaryButton} bg-no-repeat [background-size:185%_185%] [background-position:0%_50%] transition-[box-shadow,filter,background-color,border-color,background-position] motion-safe:hover:[background-position:100%_50%]`;
const vinButton = `${actionButtonBase} border border-emerald-100/45 bg-[image:linear-gradient(135deg,rgba(236,253,245,0.98)_0%,rgba(167,243,208,0.95)_32%,rgba(110,231,183,0.92)_68%,rgba(16,185,129,0.9)_100%)] bg-no-repeat [background-size:185%_185%] [background-position:0%_50%] text-slate-900 shadow-[0_12px_24px_rgba(52,211,153,0.28)] transition-[box-shadow,filter,background-color,border-color,background-position] motion-safe:hover:[background-position:100%_50%] motion-safe:hover:border-emerald-50/60 motion-safe:hover:brightness-[1.02] motion-safe:hover:shadow-[0_0_0_1px_rgba(255,255,255,0.16),0_16px_32px_rgba(52,211,153,0.3)]`;
const secondaryButton = `${actionButtonBase} border border-white/24 bg-[image:linear-gradient(135deg,rgba(255,255,255,0.18)_0%,rgba(226,232,240,0.12)_50%,rgba(125,211,252,0.16)_100%)] text-white shadow-[0_10px_20px_rgba(2,6,23,0.24)] motion-safe:hover:border-sky-100/34 motion-safe:hover:bg-[image:linear-gradient(135deg,rgba(255,255,255,0.22)_0%,rgba(226,232,240,0.14)_48%,rgba(125,211,252,0.2)_100%)] motion-safe:hover:shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_14px_28px_rgba(56,189,248,0.16)]`;

const Hero: FC<HeroProps> = ({
  isAuthenticated,
  authReady = false,
  onLogin,
  onRegister,
  onAddVin,
}) => {
  const logoFallbackPath = "/favicon-192x192.png";
  const handleLogoClick = () => {
    window.location.reload();
  };

  const handleLogoLoadError = (event: SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    if (image.dataset.fallbackApplied === "1") return;
    image.dataset.fallbackApplied = "1";
    image.src = logoFallbackPath;
  };

  return (
    <section
      className="font-ui relative isolate w-full select-none overflow-hidden py-6 sm:py-8"
      style={{
        backgroundImage: depthBackground,
      }}
      >
      <span className="pointer-events-none absolute -inset-20 bg-[image:radial-gradient(circle_at_20%_5%,rgba(56,189,248,0.24),transparent_42%),radial-gradient(circle_at_88%_10%,rgba(37,99,235,0.14),transparent_46%),radial-gradient(circle_at_60%_80%,rgba(14,165,233,0.1),transparent_54%)] opacity-60 blur-[32px]" />
      <span className="pointer-events-none absolute inset-0 bg-[image:linear-gradient(132deg,rgba(15,23,42,0.18)_0%,rgba(14,165,233,0.12)_28%,rgba(56,189,248,0.12)_58%,rgba(2,6,23,0.1)_100%)] opacity-60" />
      <div className="page-shell-inline">
        <div className="relative grid gap-4 text-slate-100 md:grid-cols-2 lg:grid-cols-3 lg:items-stretch">
          <div className="h-full min-w-0">
            <div
              className={`relative flex min-h-[180px] h-full flex-col justify-start gap-1.5 overflow-hidden rounded-2xl border border-white/10 p-3 shadow-[0_10px_24px_rgba(2,6,23,0.26)] ${cardInteractionStatic} ${cardGradientBase} ${cardGradientHover} bg-white/10 hover:bg-white/12 hover:shadow-[0_14px_28px_rgba(2,6,23,0.3)] sm:min-h-0 sm:justify-center`}
            >
              <span className="pointer-events-none absolute inset-0 rounded-2xl border border-sky-200/10" />
              <div className="pointer-events-none absolute inset-0 opacity-30 bg-[image:radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.16),transparent_44%),radial-gradient(circle_at_85%_80%,rgba(37,99,235,0.12),transparent_48%)]" />
              <div className="relative z-10 flex items-center gap-3 pb-1">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-sky-200/30 text-sky-200/90 shadow-[0_0_18px_rgba(56,189,248,0.35)]">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 9l2-5h14l2 5" />
                    <path d="M3 9h18" />
                    <path d="M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9" />
                    <path d="M9 21v-6h6v6" />
                  </svg>
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <h1 className="font-display break-words text-[15px] font-extrabold italic leading-snug tracking-[0.04em] text-sky-50 sm:text-[18px] md:text-[20px] md:leading-tight">
                    Інтернет-магазин автозапчастин у Львові
                  </h1>
                  <span className="mt-1 h-0.5 w-32 bg-gradient-to-r from-sky-300/80 via-white/30 to-transparent" />
                </div>
              </div>
              <div className="relative z-10 space-y-2 pt-1.5">
                <p
                  className={`${heroHeadingText} mt-1 mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[18px] leading-tight sm:text-[20px] md:mb-2 md:flex-nowrap md:items-baseline md:text-[22px] lg:text-[24px]`}
                >
                  <span className="text-[20px] sm:text-[23px] md:text-[25px] lg:text-[27px]">
                    PartsON
                  </span>
                  <span className="text-[17px] sm:text-[19px] md:text-[21px] lg:text-[23px]">
                    — знайдеться все!
                  </span>
                </p>
                <p className="font-display relative ml-auto max-w-[34ch] pr-2 text-right text-sm font-semibold italic leading-relaxed tracking-[0.05em] text-sky-100/90 sm:pr-3 sm:text-base md:text-[17px] after:mt-2 after:ml-auto after:block after:h-0.5 after:w-20 after:bg-gradient-to-r after:from-sky-300/80 after:via-white/30 after:to-transparent">
                  Кожна деталь важлива...
                </p>
              </div>
            </div>
          </div>

          <div className="h-full min-w-0">
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <button
                type="button"
                aria-label="Оновити сторінку"
                onClick={handleLogoClick}
                className="group/logo relative hidden items-center justify-center overflow-visible px-2 py-1 transition-transform duration-500 ease-out motion-safe:transform-gpu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300/80 sm:flex"
              >
                <Image
                  src="/Car-parts.png"
                  alt="PartsOn Logo"
                  width={98}
                  height={49}
                  className="relative z-[2] h-auto w-[72px] object-contain drop-shadow-[0_10px_20px_rgba(15,23,42,0.18)] transition-transform duration-500 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] motion-safe:transform-gpu md:w-[108px] motion-safe:group-hover/logo:-translate-y-0.5 motion-safe:group-hover/logo:scale-[1.04]"
                  sizes="(min-width: 768px) 108px, 72px"
                  onError={handleLogoLoadError}
                />
                <span className="pointer-events-none absolute left-1/2 bottom-full z-20 mb-3 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-[14px] border border-sky-200/35 bg-[image:linear-gradient(135deg,rgba(30,41,59,0.96),rgba(51,65,85,0.94))] px-4 py-2 text-center text-[12px] font-semibold tracking-[0.08em] text-slate-50 opacity-0 shadow-[0_18px_40px_rgba(15,23,42,0.34)] ring-1 ring-sky-100/10 backdrop-blur-xl transition-[opacity,transform] duration-300 ease-out after:absolute after:left-1/2 after:top-full after:h-2.5 after:w-2.5 after:-translate-x-1/2 after:-translate-y-1/2 after:rotate-45 after:border-b after:border-r after:border-sky-200/30 after:bg-slate-700 motion-safe:group-hover/logo:-translate-y-1 motion-safe:group-hover/logo:opacity-100">
                  Оновити сторінку
                </span>
              </button>
              <div className="flex min-h-[42px] min-w-[272px] flex-wrap items-center justify-center gap-2 sm:min-h-[44px] sm:min-w-[292px]">
                {!authReady ? (
                  <div className="h-[42px] w-full max-w-[292px] rounded-[14px] border border-white/14 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:h-[44px]" />
                ) : !isAuthenticated ? (
                  <>
                    <button
                      type="button"
                      onClick={onLogin}
                      className={loginButton}
                    >
                      <LogIn className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                      Увійти
                    </button>
                    <button
                      type="button"
                      onClick={onRegister}
                      className={secondaryButton}
                    >
                      <UserPlus className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                      Реєстрація
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={onAddVin}
                    className={`${vinButton} min-w-[272px] sm:min-w-[292px]`}
                  >
                    Додати VIN номер
                  </button>
                )}
              </div>
            </div>
          </div>

          <div
            className={`flex min-h-[180px] h-full min-w-0 flex-col space-y-2 rounded-2xl border border-white/10 p-3 shadow-[0_10px_24px_rgba(2,6,23,0.26)] ${cardInteractionStatic} md:col-span-2 lg:col-span-1 ${cardGradientBase} ${cardGradientHover} bg-white/10 motion-safe:hover:bg-white/12 sm:min-h-0`}
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-sky-200/30 text-sky-200/90 shadow-[0_0_16px_rgba(56,189,248,0.3)]">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 10h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V10z" />
                  <path d="M2 7h20v3H2z" />
                  <path d="M12 7v15" />
                  <path d="M7.5 7a2.5 2.5 0 1 1 0-5c2.5 0 4.5 5 4.5 5" />
                  <path d="M16.5 7a2.5 2.5 0 1 0 0-5c-2.5 0-4.5 5-4.5 5" />
                </svg>
              </span>
              <div className="flex min-w-0 flex-col">
                <p className="font-display break-words text-xs font-semibold italic uppercase tracking-[0.14em] text-slate-100/90 sm:text-sm sm:tracking-[0.2em]">
                  Вигода від реєстрації
                </p>
                <span className="h-0.5 w-28 bg-gradient-to-r from-sky-300/70 via-white/25 to-transparent" />
              </div>
            </div>
            <ul className="space-y-2 text-[13px] font-semibold tracking-[-0.01em] text-slate-100 sm:text-[15px]">
              {benefitItems.map((benefit) => (
                <li
                  key={benefit}
                  className="flex items-center gap-3 rounded-lg border border-white/15 bg-white/10 px-3 py-2 transition-[border-color,background-color] duration-200 ease-out motion-safe:hover:border-white/30 motion-safe:hover:bg-white/15"
                >
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm border border-emerald-400/70 text-emerald-300/90">
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12l4 4 10-10" />
                    </svg>
                  </span>
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
