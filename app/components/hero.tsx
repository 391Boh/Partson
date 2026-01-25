"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { FC } from "react";
import { LogIn, UserPlus } from "lucide-react";

interface HeroProps {
  isAuthenticated: boolean;
  onLogin: () => void;
  onRegister: () => void;
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
const heroHeadingText =
  "font-extrabold leading-tight tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-sky-100 via-white to-sky-200";

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

const columnTransition = { duration: 0.55, ease: "easeOut" };
const viewportConfig = { once: false, amount: 0.2 };

const Hero: FC<HeroProps> = ({ isAuthenticated, onLogin, onRegister }) => {
  const router = useRouter();
  const handleLogoClick = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
      return;
    }
    router.refresh();
  };

  return (
    <section
      className="w-full select-none py-4 sm:py-5 font-[Montserrat] transition-[background-position,background-size,filter] duration-200 ease-out [background-size:160%_170%] [background-position:80%_50%] hover:[background-size:200%_200%] hover:[background-position:50%_25%] hover:brightness-110"
      style={{
        backgroundImage: depthBackground,
      }}
    >
      <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-2 lg:px-6">
        <motion.div
          className="relative grid gap-4 text-slate-100 md:grid-cols-2 lg:grid-cols-3 lg:items-stretch"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportConfig}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          <motion.div
            className=" h-full min-w-0"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={viewportConfig}
            transition={{ ...columnTransition, delay: 0.1 }}
          >
            <div
              className={`relative flex min-h-[180px] h-full flex-col justify-start gap-1.5 overflow-hidden rounded-2xl border border-white/10 p-3 shadow-[0_10px_26px_rgba(2,6,23,0.28)] transition ${cardGradientBase} ${cardGradientHover} bg-white/10 hover:bg-white/12 sm:min-h-0 sm:justify-center transform-gpu hover:-translate-y-0.5 hover:shadow-[0_16px_32px_rgba(56,189,248,0.28)]`}
            >
              <div className="pointer-events-none absolute inset-0 opacity-35 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.2),transparent_45%),radial-gradient(circle_at_85%_80%,rgba(37,99,235,0.16),transparent_50%)]" />
              <div className="relative z-10 flex items-center gap-3">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-sky-200/30 text-sky-200/90 shadow-[0_0_18px_rgba(56,189,248,0.35)]">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 9l2-5h14l2 5" />
                    <path d="M3 9h18" />
                    <path d="M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9" />
                    <path d="M9 21v-6h6v6" />
                  </svg>
                </span>
                <div className="flex min-w-0 flex-col">
                  <p
                    className={`break-words ${heroHeadingText} text-lg italic sm:text-xl`}
                  >
                    Магазин автозапчастин
                  </p>
                  <span className="h-0.5 w-28 bg-gradient-to-r from-sky-300/80 via-white/30 to-transparent" />
                </div>
              </div>
              <div className="relative z-10 space-y-1.5">
                <p className={`${heroHeadingText} text-2xl sm:text-3xl`}>
                  PartsON — знайдеться все!
                </p>
                <p className="relative text-sm font-semibold italic tracking-[0.12em] text-sky-100/80 sm:text-base after:mt-1 after:block after:h-0.5 after:w-16 after:bg-gradient-to-r after:from-sky-300/80 after:via-white/30 after:to-transparent">
                  Кожна деталь важлива...
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div
            className="h-full min-w-0"
            initial={{ opacity: 0, scale: 0.98 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={viewportConfig}
            transition={{ ...columnTransition, delay: 0.25 }}
          >
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <motion.button
                type="button"
                aria-label="Оновити сторінку"
                onClick={handleLogoClick}
                whileHover={{ scale: 1.04, filter: "drop-shadow(0 0 12px rgba(56,189,248,0.45))" }}
                whileTap={{ scale: 0.98 }}
                className="hidden items-center justify-center px-2 py-1 transition sm:flex group relative"
              >
                <Image
                  src="/Car-parts.png"
                  alt="PartsOn Logo"
                  width={98}
                  height={49}
                  className="h-auto w-[72px] md:w-[108px] object-contain"
                  priority
                />
                <span className="pointer-events-none absolute left-1/2 bottom-full z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-sky-200/50 bg-slate-900/90 px-3 py-1 text-[11px] font-semibold text-sky-100 opacity-0 shadow-[0_12px_28px_rgba(2,6,23,0.45)] backdrop-blur-md transition duration-150 ease-out group-hover:-translate-y-0.5 group-hover:opacity-100">
                  Оновити сторінку
                </span>
              </motion.button>
              <div className="flex flex-wrap justify-center gap-2">
                <motion.button
                  type="button"
                  onClick={onLogin}
                  disabled={isAuthenticated}
                  className={`${primaryButton} ${isAuthenticated ? "cursor-not-allowed" : ""}`}
                >
                  <LogIn className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                  Увійти
                </motion.button>
                <motion.button
                  type="button"
                  onClick={onRegister}
                  disabled={isAuthenticated}
                  className={`${secondaryButton} ${isAuthenticated ? "cursor-not-allowed" : ""}`}
                >
                  <UserPlus className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                  Реєстрація
                </motion.button>
              </div>
              {isAuthenticated && (
                <p className="text-sm text-emerald-300">
                  Ви вже авторизовані.
                </p>
              )}
            </div>
          </motion.div>

          <motion.div
            className={` flex min-h-[180px] h-full min-w-0 flex-col space-y-2 rounded-2xl border border-white/10 p-3 shadow-[0_10px_26px_rgba(2,6,23,0.28)] transition md:col-span-2 lg:col-span-1 ${cardGradientBase} ${cardGradientHover} bg-white/10 hover:bg-white/12 sm:min-h-0 transform-gpu hover:-translate-y-0.5 hover:shadow-[0_16px_32px_rgba(56,189,248,0.28)]`}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={viewportConfig}
            transition={{ ...columnTransition, delay: 0.4 }}
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
                <motion.li
                  key={benefit}
                  className="flex items-center gap-3 rounded-lg border border-white/15 bg-white/10 px-3 py-2 transition hover:border-white/30 hover:bg-white/15"
                  initial={{ opacity: 0, x: -6 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={viewportConfig}
                  whileHover={{ x: 4 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm border border-emerald-400/70 text-emerald-300/90">
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12l4 4 10-10" />
                    </svg>
                  </span>
                  <span>{benefit}</span>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

export default Hero;

