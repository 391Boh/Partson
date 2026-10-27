import Link from "next/link";
import { ArrowRight, Home, PackageSearch, Phone, Search } from "lucide-react";

import { resolveSiteStylesheetHref } from "app/lib/critical-css";

export const metadata = {
  title: "Сторінку не знайдено",
  robots: { index: false, follow: true },
};

const STORE_PHONE_DISPLAY = "+38 (063) 421-18-51";
const STORE_PHONE_HREF = "tel:+380634211851";

// The "0" of 404, drawn as a brake disc: vented rotor, drilled holes and a
// five-bolt hub. Spins slowly (see .notfound-disc in globals.css).
function BrakeDisc() {
  const drilled = Array.from({ length: 12 }, (_, index) => (index * 360) / 12);
  const bolts = Array.from({ length: 5 }, (_, index) => (index * 360) / 5);
  return (
    <svg viewBox="0 0 200 200" className="notfound-disc" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="notfound-rotor" cx="50%" cy="42%" r="62%">
          <stop offset="0%" stopColor="#e2f3fb" />
          <stop offset="55%" stopColor="#9ccfe6" />
          <stop offset="100%" stopColor="#3f88ab" />
        </radialGradient>
        <linearGradient id="notfound-hub" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5eead4" />
          <stop offset="100%" stopColor="#0ea5e9" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="94" fill="url(#notfound-rotor)" />
      <circle cx="100" cy="100" r="94" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1.5" />
      <circle cx="100" cy="100" r="80" fill="none" stroke="#0b2134" strokeOpacity="0.14" strokeWidth="1" />
      {drilled.map((angle) => (
        <g key={angle} transform={`rotate(${angle} 100 100)`}>
          <circle cx="100" cy="26" r="4.2" fill="#0b2134" fillOpacity="0.55" />
          <circle cx="100" cy="44" r="3.4" fill="#0b2134" fillOpacity="0.4" transform="rotate(15 100 100)" />
        </g>
      ))}
      <circle cx="100" cy="100" r="46" fill="#0b2134" />
      <circle cx="100" cy="100" r="40" fill="url(#notfound-hub)" />
      {bolts.map((angle) => (
        <circle key={angle} cx="100" cy="74" r="5" fill="#0b2134" transform={`rotate(${angle} 100 100)`} />
      ))}
      <circle cx="100" cy="100" r="13" fill="#0b2134" />
      <circle cx="100" cy="100" r="13" fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1.5" />
    </svg>
  );
}

export default function NotFound() {
  const stylesheetHref = resolveSiteStylesheetHref();
  return (
    <div className="page-shell-inline flex min-h-[72vh] items-center justify-center py-10 sm:py-16">
      {/* A real 404 response skips the root layout's <head> stylesheet
          loader, which left this page unstyled; React hoists this into <head>. */}
      {stylesheetHref ? (
        <link rel="stylesheet" href={stylesheetHref} precedence="default" />
      ) : null}

      <section
        aria-labelledby="notfound-title"
        className="notfound-panel relative isolate w-full max-w-[880px] overflow-hidden rounded-[28px] px-5 py-10 text-center text-white sm:rounded-[34px] sm:px-12 sm:py-14"
      >
        <div className="notfound-code" aria-hidden="true">
          <span>4</span>
          <BrakeDisc />
          <span>4</span>
        </div>

        <h1
          id="notfound-title"
          className="font-display mt-6 text-balance text-[28px] font-black leading-tight tracking-tight sm:text-[40px]"
        >
          Сторінку не знайдено
        </h1>
        <p className="mx-auto mt-3 max-w-[46ch] text-pretty text-[15px] font-medium leading-7 text-sky-100/80 sm:text-base">
          Товар чи розділ, який ви шукали, могли перейменувати або прибрати з
          каталогу. Спробуйте пошук ще раз або поверніться на головну.
        </p>

        <form
          action="/katalog"
          method="get"
          role="search"
          className="notfound-search mx-auto mt-7 flex max-w-[520px] items-center gap-2 rounded-[18px] p-1.5"
        >
          <label htmlFor="notfound-search-input" className="sr-only">
            Пошук запчастин
          </label>
          <Search size={18} strokeWidth={2.2} aria-hidden className="ml-3 shrink-0 text-sky-200/80" />
          <input
            id="notfound-search-input"
            name="search"
            type="search"
            required
            autoComplete="off"
            enterKeyHint="search"
            placeholder="Назва або артикул"
            className="min-h-11 min-w-0 flex-1 bg-transparent text-[15px] font-medium text-white outline-none placeholder:text-sky-100/50"
          />
          <button
            type="submit"
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[13px] bg-[image:linear-gradient(135deg,#0369a1,#0e7490)] px-4 text-[14px] font-extrabold text-white shadow-[0_8px_20px_-8px_rgba(14,165,233,0.7)] transition-[filter,transform] duration-200 ease-out hover:brightness-110 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200 sm:px-5"
          >
            Знайти
          </button>
        </form>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="group/home inline-flex min-h-12 items-center gap-2.5 rounded-[15px] bg-white px-6 text-[14px] font-extrabold text-slate-900 shadow-[0_14px_30px_-12px_rgba(2,6,23,0.6)] transition-[background-color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d2236]"
          >
            <Home size={16} strokeWidth={2.4} aria-hidden />
            На головну
            <ArrowRight
              size={15}
              strokeWidth={2.8}
              aria-hidden
              className="transition-transform duration-200 ease-out group-hover/home:translate-x-1"
            />
          </Link>
          <Link
            href="/katalog"
            className="inline-flex min-h-12 items-center gap-2.5 rounded-[15px] border border-white/20 bg-white/[0.06] px-6 text-[14px] font-extrabold text-white transition-colors duration-200 ease-out hover:border-white/40 hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
          >
            <PackageSearch size={16} strokeWidth={2.4} aria-hidden />
            До каталогу
          </Link>
        </div>

        <p className="mt-8 border-t border-white/10 pt-6 text-[14px] font-medium text-sky-100/80">
          Не знайшли потрібну деталь?{" "}
          <a
            href={STORE_PHONE_HREF}
            className="inline-flex items-center gap-1.5 whitespace-nowrap font-bold text-white underline decoration-sky-300/50 underline-offset-4 transition-colors hover:decoration-sky-300 focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
          >
            <Phone size={14} strokeWidth={2.4} aria-hidden className="text-sky-300" />
            {STORE_PHONE_DISPLAY}
          </a>
        </p>
      </section>
    </div>
  );
}
