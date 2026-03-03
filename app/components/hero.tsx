"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import type { FC, SyntheticEvent } from "react";
import { LogIn, UserPlus } from "lucide-react";

interface HeroProps {
  isAuthenticated: boolean;
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
  "radial-gradient(circle at 18% 20%, rgba(59,130,246,0.35), transparent 45%)",
  "radial-gradient(circle at 82% 10%, rgba(30,64,175,0.25), transparent 50%)",
  "linear-gradient(180deg, rgba(2,6,23,0.96) 0%, rgba(15,23,42,0.92) 35%, rgba(59,130,246,0.25) 100%)",
].join(", ");

const cardGradientBase =
  "bg-gradient-to-b from-slate-950/50 via-slate-900/30 to-sky-200/18";
const cardGradientHover =
  "hover:from-slate-950/40 hover:via-slate-900/25 hover:to-sky-200/30";
const cardInteractionStatic =
  "transition-[box-shadow,background-color,border-color] duration-300";
const heroHeadingText =
  "font-black italic leading-[1.05] tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-sky-100 via-white to-sky-200";

const actionButtonBase = [
  "inline-flex",
  "items-center",
  "gap-2",
  "justify-center",
  "rounded-lg",
  "px-5",
  "py-2.5",
  "text-[10px]",
  "font-semibold",
  "tracking-[0.28em]",
  "uppercase",
  "transition-all",
  "duration-300",
  "focus-visible:outline",
  "focus-visible:outline-2",
  "focus-visible:outline-offset-2",
  "focus-visible:outline-sky-300/80",
  "select-none",
  "disabled:opacity-60",
  "disabled:cursor-not-allowed",
].join(" ");

const primaryButton = `${actionButtonBase} border border-white/30 bg-gradient-to-b from-sky-200 via-sky-300 to-blue-500 text-slate-900 shadow-[0_12px_24px_rgba(56,189,248,0.4)] hover:brightness-110 hover:shadow-[0_16px_32px_rgba(56,189,248,0.5)]`;
const secondaryButton = `${actionButtonBase} border border-white/30 bg-white/15 text-white shadow-[0_10px_20px_rgba(2,6,23,0.35)] hover:border-white/50 hover:bg-white/25`;

const Hero: FC<HeroProps> = ({ isAuthenticated, onLogin, onRegister, onAddVin }) => {
  const router = useRouter();
  const logoFallbackPath = "/favicon-192x192.png";
  const handleLogoClick = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
      return;
    }
    router.refresh();
  };

  const handleLogoLoadError = (event: SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    if (image.dataset.fallbackApplied === "1") return;
    image.dataset.fallbackApplied = "1";
    image.src = logoFallbackPath;
  };

  return (
    <section
      className="group/hero relative isolate w-full select-none overflow-hidden py-6 sm:py-8 font-[Montserrat] [background-size:160%_170%] [background-position:80%_50%] transition-all duration-700"
      style={{
        backgroundImage: depthBackground,
      }}
      >
      <span className="pointer-events-none absolute -inset-32 rounded-[36px] bg-[radial-gradient(circle_at_20%_5%,rgba(56,189,248,0.38),transparent_48%),radial-gradient(circle_at_88%_10%,rgba(37,99,235,0.25),transparent_50%),radial-gradient(circle_at_60%_80%,rgba(14,165,233,0.18),transparent_62%)] opacity-0 blur-2xl transition duration-700 group-hover/hero:opacity-100" />
      <span className="pointer-events-none absolute inset-0 rounded-[28px] bg-[linear-gradient(132deg,rgba(15,23,42,0.25)_0%,rgba(14,165,233,0.20)_28%,rgba(56,189,248,0.24)_58%,rgba(2,6,23,0.18)_100%)] opacity-0 mix-blend-screen transition duration-700 group-hover/hero:opacity-100" />
      <span className="pointer-events-none absolute left-1/2 top-1/2 h-40 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-300/30 blur-[86px] opacity-0 transition duration-700 group-hover/hero:opacity-95" />
      <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-5 lg:px-7">
        <div className="relative grid gap-4 text-slate-100 md:grid-cols-2 lg:grid-cols-3 lg:items-stretch">
          <div className="h-full min-w-0">
            <div
              className={`group/card relative flex min-h-[180px] h-full flex-col justify-start gap-1.5 overflow-hidden rounded-2xl border border-white/10 p-3 shadow-[0_10px_26px_rgba(2,6,23,0.28)] ${cardInteractionStatic} ${cardGradientBase} ${cardGradientHover} bg-white/10 hover:bg-white/12 hover:shadow-[0_16px_34px_rgba(2,6,23,0.34)] sm:min-h-0 sm:justify-center`}
            >
              <span className="pointer-events-none absolute -inset-3 rounded-2xl bg-[radial-gradient(circle_at_24%_12%,rgba(56,189,248,0.45),transparent_44%),radial-gradient(circle_at_78%_88%,rgba(14,165,233,0.25),transparent_55%)] opacity-0 blur-2xl transition duration-500 group-hover/card:opacity-100" />
              <span className="pointer-events-none absolute inset-0 rounded-2xl border border-sky-200/0 transition-colors duration-500 group-hover/card:border-sky-200/45" />
              <span className="pointer-events-none absolute inset-0 rounded-2xl shadow-[inset_0_10px_30px_rgba(255,255,255,0.24)] opacity-0 transition duration-500 group-hover/card:opacity-100" />
              <span className="pointer-events-none absolute right-1/2 top-10 h-16 w-28 -translate-x-1/2 rounded-full bg-sky-300/30 blur-[64px] opacity-0 transition duration-700 group-hover/card:opacity-95" />
              <div className="pointer-events-none absolute inset-0 opacity-35 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.2),transparent_45%),radial-gradient(circle_at_85%_80%,rgba(37,99,235,0.16),transparent_50%)]" />
              <div className="relative z-10 flex items-center gap-3 pb-1">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-sky-200/30 text-sky-200/90 shadow-[0_0_18px_rgba(56,189,248,0.35)]">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 9l2-5h14l2 5" />
                    <path d="M3 9h18" />
                    <path d="M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9" />
                    <path d="M9 21v-6h6v6" />
                  </svg>
                </span>
                <div className="flex min-w-0 flex-col">
                  <p
                    className={`break-words ${heroHeadingText} text-base sm:text-lg md:text-xl uppercase tracking-[0.12em] -mt-1`}
                  >
                    Магазин автозапчастин
                  </p>
                  <span className="mt-1 h-0.5 w-32 bg-gradient-to-r from-sky-300/80 via-white/30 to-transparent" />
                </div>
              </div>
              <div className="relative z-10 space-y-2.5 pt-1">
                <p
                  className={`${heroHeadingText} flex items-baseline gap-1 flex-wrap md:flex-nowrap text-[18px] sm:text-[20px] md:text-[22px] lg:text-[24px] mt-1 mb-4 sm:mb-3 md:mb-2`}
                >
                  <span className="text-[20px] sm:text-[23px] md:text-[25px] lg:text-[27px]">
                    PartsON
                  </span>
                  <span className="text-[17px] sm:text-[19px] md:text-[21px] lg:text-[23px]">
                    — знайдеться все!
                  </span>
                </p>
                <p className="relative mt-2 text-sm font-semibold italic tracking-[0.12em] text-sky-100/85 sm:text-base md:text-[17px] leading-relaxed text-right pr-3 sm:pr-4 after:mt-2 after:block after:h-0.5 after:w-20 after:bg-gradient-to-r after:from-sky-300/80 after:via-white/30 after:to-transparent after:ml-auto">
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
                className="group/logo hidden items-center justify-center overflow-visible px-2 py-1 transition sm:flex relative"
              >
                <Image
                  src="/Car-parts.png"
                  alt="PartsOn Logo"
                  width={98}
                  height={49}
                  className="h-auto w-[72px] object-contain transition duration-300 ease-out md:w-[108px] group-hover/logo:scale-110 group-hover/logo:rotate-[-4deg] group-hover/logo:brightness-110"
                  priority
                  onError={handleLogoLoadError}
                />
                <span className="pointer-events-none absolute left-1/2 bottom-full z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-sky-200/55 bg-slate-900/85 px-3 py-1.5 text-[11px] font-semibold tracking-[0.09em] text-sky-100 opacity-0 shadow-[0_12px_28px_rgba(2,6,23,0.45)] backdrop-blur-lg transition duration-300 ease-out group-hover/logo:-translate-y-1 group-hover/logo:opacity-100 group-hover/logo:rotate-[-2deg]">
                  Оновити сторінку
                </span>
              </button>
              <div className="flex flex-wrap justify-center gap-2">
                {!isAuthenticated ? (
                  <>
                    <button
                      type="button"
                      onClick={onLogin}
                      className={primaryButton}
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
                    className={`${primaryButton} bg-gradient-to-b from-emerald-200 via-emerald-300 to-emerald-500 text-slate-900 shadow-[0_12px_24px_rgba(52,211,153,0.35)] hover:brightness-110 hover:shadow-[0_16px_32px_rgba(52,211,153,0.45)]`}
                  >
                    Додати VIN номер
                  </button>
                )}
              </div>
            </div>
          </div>

          <div
            className={` flex min-h-[180px] h-full min-w-0 flex-col space-y-2 rounded-2xl border border-white/10 p-3 shadow-[0_10px_26px_rgba(2,6,23,0.28)] transition-colors md:col-span-2 lg:col-span-1 ${cardGradientBase} ${cardGradientHover} bg-white/10 hover:bg-white/12 sm:min-h-0`}
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
                <p className="break-words text-xs italic font-semibold uppercase tracking-[0.22em] text-slate-100/85 sm:text-sm sm:tracking-[0.32em]">
                  Вигода від реєстрації
                </p>
                <span className="h-0.5 w-28 bg-gradient-to-r from-sky-300/70 via-white/25 to-transparent" />
              </div>
            </div>
            <ul className="space-y-2 text-[13px] font-medium text-slate-100 sm:text-sm">
              {benefitItems.map((benefit) => (
                <li
                  key={benefit}
                  className="flex items-center gap-3 rounded-lg border border-white/15 bg-white/10 px-3 py-2 transition hover:border-white/30 hover:bg-white/15"
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

