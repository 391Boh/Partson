import Link from "next/link";
import { ArrowRight, Car, Factory, Layers, PackageSearch, Search } from "lucide-react";

import { resolveSiteStylesheetHref } from "app/lib/critical-css";

export const metadata = {
  title: "Сторінку не знайдено",
  robots: { index: false, follow: true },
};

// Where people from a dead link usually want to go next: the same four
// entry points as the catalog's own navigation, each with what it holds.
const DESTINATIONS = [
  { href: "/auto", label: "Підбір за авто", hint: "Марка, модель і рік випуску", icon: Car },
  { href: "/groups", label: "Категорії", hint: "Гальма, підвіска, двигун, ТО", icon: Layers },
  { href: "/manufacturers", label: "Виробники", hint: "Bosch, TRW, Febi та інші", icon: Factory },
  { href: "/katalog", label: "Увесь каталог", hint: "Ціни й наявність онлайн", icon: PackageSearch },
] as const;

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
    <div className="page-shell-inline flex min-h-[70vh] items-center justify-center py-10 sm:py-16">
      {/* Next also renders this boundary as a fallback on successful routes.
          A JSX stylesheet link hoists a preload there, downloading the full
          CSS on every page. A local style import only loads when the actual
          404 markup reaches the browser, including with JavaScript disabled. */}
      {stylesheetHref ? (
        <style dangerouslySetInnerHTML={{ __html: `@import url(${JSON.stringify(stylesheetHref)});` }} />
      ) : null}

      <section aria-labelledby="notfound-title" className="notfound-panel">
        <div className="notfound-code" aria-hidden="true">
          <span>4</span>
          <BrakeDisc />
          <span>4</span>
        </div>

        <h1 id="notfound-title" className="notfound-title font-display">
          Сторінку не знайдено
        </h1>
        <p className="notfound-lead">
          Можливо, посилання застаріло, товар зняли з продажу або в адресі є
          помилка. Знайдіть деталь за назвою чи артикулом або перейдіть до
          потрібного розділу.
        </p>

        <form action="/katalog" method="get" role="search" className="notfound-search">
          <label htmlFor="notfound-search-input" className="sr-only">
            Пошук запчастин
          </label>
          <Search size={18} strokeWidth={2.2} aria-hidden className="notfound-search-icon" />
          <input
            id="notfound-search-input"
            name="search"
            type="search"
            required
            autoComplete="off"
            enterKeyHint="search"
            placeholder="Назва або артикул"
          />
          <button type="submit">Знайти</button>
        </form>

        <nav aria-label="Розділи каталогу" className="notfound-destinations">
          {DESTINATIONS.map(({ href, label, hint, icon: Icon }) => (
            <Link key={href} href={href} className="notfound-destination">
              <span className="notfound-destination-icon">
                <Icon size={18} strokeWidth={2.2} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="notfound-destination-label">{label}</span>
                <span className="notfound-destination-hint">{hint}</span>
              </span>
            </Link>
          ))}
        </nav>

        <Link href="/" className="notfound-home">
          На головну
          <ArrowRight size={15} strokeWidth={2.6} aria-hidden />
        </Link>
      </section>
    </div>
  );
}
