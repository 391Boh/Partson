import Link from "next/link";
import { ArrowRight, CarFront, Car, Disc3, Factory, Layers3, Wrench, Zap, type LucideIcon } from "lucide-react";

import HomeHeading from "./HomeHeading";
import { buildAutoBrandPath, buildGroupPath, buildManufacturerPathFromLabel } from "app/lib/catalog-links";
import { CAR_BRANDS, GROUPS, PRODUCERS } from "app/lib/home-popular-links";

// Plain server-rendered links from the homepage into the catalog's main
// sections: part groups, car brands, the model pages that already draw search
// impressions, and producers. Without them the homepage HTML linked only to
// the three directory roots, so its weight never reached the pages people
// search for ("запчастини форд фокус 2"). Also carries the store's "Автозапчастини
// для вашого авто" heading, lead and scope. Four ruled sections of dot-separated text links;
// no JS, skipped offscreen via content-visibility.

const POPULAR_MODELS: Array<[path: string, label: string]> = [
  ["/auto/ford/focus-ii", "Ford Focus II"],
  ["/auto/volkswagen/caddy-iii", "VW Caddy III"],
  ["/auto/skoda/octavia-ii", "Škoda Octavia II"],
  ["/auto/opel/astra-h", "Opel Astra H"],
  ["/auto/renault/megane-ii", "Renault Megane II"],
  ["/auto/renault/logan-i", "Renault Logan I"],
  ["/auto/volkswagen/golf-iv", "VW Golf IV"],
  ["/auto/volkswagen/passat-b6", "VW Passat B6"],
  ["/auto/volkswagen/transporter-t5", "VW Transporter T5"],
  ["/auto/opel/vivaro-a", "Opel Vivaro A"],
  ["/auto/skoda/fabia-i", "Škoda Fabia I"],
  ["/auto/volkswagen/passat-b5", "VW Passat B5"],
  ["/auto/renault/kangoo-ii", "Renault Kangoo II"],
  ["/auto/opel/combo-c", "Opel Combo C"],
  ["/auto/skoda/octavia-iii", "Škoda Octavia III"],
];

// Beyond the shared homepage lists, so each section fills three lines on
// desktop. Every page was checked to exist.
const MORE_CAR_BRANDS: Array<[name: string, label: string]> = [
  ["FIAT", "Fiat"], ["MAZDA", "Mazda"], ["HONDA", "Honda"], ["DACIA", "Dacia"], ["VOLVO", "Volvo"],
  ["SEAT", "Seat"], ["SUZUKI", "Suzuki"], ["DAEWOO", "Daewoo"], ["SUBARU", "Subaru"], ["LEXUS", "Lexus"], ["CHERY", "Chery"], ["JEEP", "Jeep"],
];
const MORE_PRODUCERS: Array<[name: string, label: string]> = [
  ["VALEO", "Valeo"], ["NGK", "NGK"], ["MANN-FILTER", "Mann-Filter"], ["GATES", "Gates"], ["CONTITECH", "ContiTech"],
  ["INA", "INA"], ["LUK", "LuK"], ["MONROE", "Monroe"], ["MAHLE", "Mahle"], ["HELLA", "Hella"], ["BREMBO", "Brembo"], ["DENSO", "Denso"],
  ["MEYLE", "Meyle"], ["DAYCO", "Dayco"], ["FILTRON", "Filtron"], ["SWAG", "Swag"],
];

// Real catalog parts behind the cards (wide screens only).
const BACKDROP_PARTS: Array<{ code: string; className: string }> = [
  // Side gutters and the empty space right of the heading only, so no part
  // sits behind the pills; sizes follow the gutter width.
  { code: "00-00001414", className: "left-[0.5%] top-[110px] w-[clamp(96px,8vw,170px)] rotate-[8deg] opacity-80" }, // радіатор
  { code: "00-00001350", className: "left-[0.5%] bottom-6 w-[clamp(96px,8vw,165px)] -rotate-[6deg] opacity-80" }, // комплект ГРМ
  { code: "00-00004279", className: "right-[0.5%] top-[90px] w-[clamp(96px,8vw,160px)] -rotate-[10deg] opacity-85" }, // гальмівний диск Bosch
  { code: "00-00003450", className: "right-[0.5%] bottom-6 w-[clamp(96px,8vw,160px)] rotate-[14deg] opacity-80" }, // важіль підвіски
];
// What the shop covers, in plain crawlable copy (moved here from the store
// section, which now holds only the visit block and the FAQ).
const CATALOG_SCOPE: Array<{ label: string; items: string; icon: LucideIcon }> = [
  { label: "Планове техобслуговування", items: "Фільтри, моторні оливи, свічки запалювання, ремені й ролики ГРМ.", icon: Wrench },
  { label: "Підвіска та гальма", items: "Амортизатори, пружини, важелі, підшипники, гальмівні диски й колодки.", icon: Disc3 },
  { label: "Електрика й охолодження", items: "Датчики, котушки, стартери, генератори, радіатори, помпи та термостати.", icon: Zap },
];

const EMPTY_IMAGE = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

const CARDS: Array<{
  title: string;
  icon: LucideIcon;
  allHref: string;
  allLabel: string;
  links: Array<[string, string]>;
}> = [
  {
    title: "Групи запчастин",
    icon: Layers3,
    allHref: "/groups",
    allLabel: "Усі групи",
    links: GROUPS.map((label) => [buildGroupPath(label), label]),
  },
  {
    title: "Запчастини за маркою",
    icon: Car,
    allHref: "/auto",
    allLabel: "Усі марки",
    links: [...CAR_BRANDS, ...MORE_CAR_BRANDS].map(([name, label]) => [buildAutoBrandPath(name), label]),
  },
  {
    title: "Популярні моделі",
    icon: CarFront,
    allHref: "/auto",
    allLabel: "Підібрати авто",
    links: POPULAR_MODELS,
  },
  {
    title: "Виробники",
    icon: Factory,
    allHref: "/manufacturers",
    allLabel: "Усі виробники",
    links: [...PRODUCERS, ...MORE_PRODUCERS].map(([name, label]) => [buildManufacturerPathFromLabel(name), label]),
  },
];

// Decorative separators for section `index` of the 2×2 grid (gap 56 × 40).
function SectionRules({ index }: { index: number }) {
  return (
    <span aria-hidden="true" className="pointer-events-none">
      {/* Horizontal: under every section on phones but the last; from md
          under the top row only, running to the centre line. */}
      {index < 3 && (
        <span
          className={`absolute -bottom-5 h-px ${
            index === 0
              ? `inset-x-0 bg-[linear-gradient(90deg,transparent,rgb(8_119_131/28%)_30%,rgb(8_119_131/28%)_70%,transparent)] md:-right-7 md:bg-[linear-gradient(90deg,transparent,rgb(8_119_131/28%)_55%)]`
              : index === 1
                ? `inset-x-0 bg-[linear-gradient(90deg,transparent,rgb(8_119_131/28%)_30%,rgb(8_119_131/28%)_70%,transparent)] md:-left-7 md:bg-[linear-gradient(90deg,rgb(8_119_131/28%)_45%,transparent)]`
                : `inset-x-0 bg-[linear-gradient(90deg,transparent,rgb(8_119_131/28%)_30%,rgb(8_119_131/28%)_70%,transparent)] md:hidden`
          }`}
        />
      )}
      {/* Vertical, md+: between the columns, fading towards top and bottom. */}
      {index === 0 && <span className="absolute -bottom-5 -right-7 top-2 hidden w-px bg-[linear-gradient(180deg,transparent,rgb(8_119_131/28%)_70%)] md:block" />}
      {index === 2 && <span className="absolute -right-7 -top-5 bottom-2 hidden w-px bg-[linear-gradient(180deg,rgb(8_119_131/28%)_30%,transparent)] md:block" />}
      {/* The crossing: a small teal diamond on the page ground. */}
      {index === 0 && (
        <span className="absolute -bottom-5 -right-7 hidden h-2 w-2 translate-x-1/2 translate-y-1/2 rotate-45 rounded-[2px] border border-[#087783]/50 bg-[#eef6f8] shadow-[0_0_0_4px_#eef6f8] md:block" />
      )}
      {/* Phones: a diamond in the middle of each rule, echoing the centre. */}
      {index < 3 && (
        <span className="absolute -bottom-5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 translate-y-1/2 rotate-45 rounded-[1px] bg-[#087783]/45 shadow-[0_0_0_4px_#eef6f8] md:hidden" />
      )}
    </span>
  );
}

export default function HomeCatalogLinks() {
  return (
    <section
      aria-labelledby="home-catalog-links-title"
      className="font-ui relative isolate overflow-hidden py-9 text-[#0f2b3d] [contain-intrinsic-size:auto_820px] [content-visibility:auto] sm:py-12"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(180deg,#f4f9fa_0%,#eaf3f6_100%)]"
      >
        <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgb(8_119_131/30%),transparent)]" />
        <div className="absolute -right-[10%] -top-[40%] h-[420px] w-[520px] rounded-full bg-[radial-gradient(circle,rgb(45_212_191/14%)_0%,transparent_68%)]" />
        {BACKDROP_PARTS.map((part) => (
          // Desktop only: the <source> is the sole real URL, so phones never
          // download these. White photo grounds vanish under multiply, and
          // the translucent cards let the parts show through faintly.
          <picture key={part.code} className={`absolute hidden aspect-square mix-blend-multiply lg:block ${part.className}`}>
            <source media="(min-width: 1024px)" srcSet={`/product-image/${encodeURIComponent(part.code)}`} />
            <img
              src={EMPTY_IMAGE}
              alt=""
              width={500}
              height={500}
              loading="lazy"
              decoding="async"
              fetchPriority="low"
              className="h-full w-full object-contain"
            />
          </picture>
        ))}
      </div>

      <div className="mx-auto w-full max-w-[var(--page-shell-max)] px-[var(--page-shell-gutter)]">
        {/* Heading and lead on the left, the two actions on the right. */}
        <header className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-12">
          <div>
            <HomeHeading id="home-catalog-links-title">
              Автозапчастини <span>для вашого авто</span>
            </HomeHeading>
            <p className="!mb-0 !mt-4 max-w-[62ch] text-[15px] font-medium leading-[1.65] text-[#2b4f63] sm:!mt-5 sm:text-[16.5px]">
              Для техобслуговування й ремонту. Шукайте за автомобілем, артикулом або категорією — забирайте у Львові чи замовляйте доставку по Україні.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link
              href="/katalog"
              prefetch={false}
              className="group/cta inline-flex min-h-11 items-center gap-2.5 rounded-full bg-[#0f2b3d] py-1.5 pl-5 pr-1.5 text-[14px] font-bold text-white shadow-[0_12px_26px_-14px_rgb(15_43_61/70%)] transition-[transform,background-color] duration-200 hover:-translate-y-px hover:bg-[#0b3a4f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#087783] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              Перейти до каталогу
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,#5eead4,#38bdf8)] text-[#062033] transition-transform duration-200 group-hover/cta:translate-x-0.5">
                <ArrowRight size={16} aria-hidden="true" />
              </span>
            </Link>
            <Link
              href="/inform/delivery"
              prefetch={false}
              className="inline-flex min-h-11 items-center text-[14px] font-bold text-[#087783] underline decoration-[#087783]/30 decoration-2 underline-offset-[6px] transition-colors hover:decoration-[#087783] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#087783]"
            >
              Доставка й самовивіз
            </Link>
          </div>
        </header>

        {/* What we cover: three columns between hairlines. */}
        <ul className="mt-7 grid border-y border-[#087783]/15 sm:mt-9 md:grid-cols-3">
          {CATALOG_SCOPE.map(({ label, items, icon: Icon }, index) => (
            <li
              key={label}
              className={`flex gap-3.5 py-4 md:py-5 ${index > 0 ? "border-t border-[#087783]/10 md:border-l md:border-t-0 md:pl-6" : ""} ${index < 2 ? "md:pr-6" : ""}`}
            >
              <span aria-hidden="true" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-white text-[#087783] shadow-[0_1px_2px_rgb(15_43_61/6%),0_8px_18px_-12px_rgb(8_80_100/45%)] ring-1 ring-[#087783]/10">
                <Icon size={19} />
              </span>
              <div className="min-w-0">
                <h3 className="!m-0 text-[15px] font-extrabold leading-tight tracking-[-.01em] text-[#0b2233]">{label}</h3>
                <p className="!mb-0 !mt-1 text-[13.5px] font-medium leading-[1.55] text-[#33586c]">{items}</p>
              </div>
            </li>
          ))}
        </ul>

        <p className="!mb-0 !mt-9 inline-flex items-center gap-2.5 text-[12px] font-bold uppercase tracking-[.16em] text-[#087783] sm:!mt-11">
          <span aria-hidden="true" className="h-px w-8 bg-[#087783]/40" />
          Популярні розділи каталогу
        </p>

        {/* No boxes: four sections on one ground, 2×2 from md. Light hairlines
            fade in from the outer edges and meet at a small diamond in the
            centre; phones get a faded rule between stacked sections. */}
        <div className="mt-5 grid gap-x-14 gap-y-10 sm:mt-6 md:grid-cols-2">
          {CARDS.map(({ title, icon: Icon, allHref, allLabel, links }, index) => (
            <nav key={title} aria-label={title} className="relative min-w-0">
              <SectionRules index={index} />
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2.5 text-[16px] font-extrabold leading-tight tracking-[-.01em] text-[#0b2233]">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#087783] text-white shadow-[0_6px_14px_-8px_rgb(8_119_131/80%)]">
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  {title}
                </h3>
                <Link
                  href={allHref}
                  prefetch={false}
                  className="group/all -mr-2 inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full px-2 text-[13px] font-bold text-[#087783] hover:bg-[#087783]/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#087783]"
                >
                  {allLabel}
                  <ArrowRight size={14} aria-hidden="true" className="transition-transform duration-200 group-hover/all:translate-x-0.5" />
                </Link>
              </div>
              {/* Plain text links in a flowing line, dot-separated; an
                  underline grows in on hover. Every link carries a leading
                  dot; the list is pulled left by one dot's width and clipped,
                  so a dot that lands at the start of a line is hidden and
                  every line starts flush with the text. */}
              <div className="-mx-1 mt-3.5 overflow-hidden px-1">
              <ul className="-ml-6 flex flex-wrap items-center gap-y-0.5 sm:gap-y-1">
                {links.map(([href, label]) => (
                  <li key={href} className="flex items-center">
                    <span aria-hidden="true" className="mx-2.5 h-1 w-1 shrink-0 rounded-full bg-[#087783]/35" />
                    <Link
                      href={href}
                      prefetch={false}
                      className="inline-flex min-h-8 items-center bg-[linear-gradient(currentColor,currentColor)] bg-[length:0%_1.5px] bg-[position:0_calc(100%-5px)] bg-no-repeat text-[14px] sm:text-[14.5px] font-semibold leading-tight tracking-[-.005em] text-[#1d4257] transition-[color,background-size] duration-300 ease-[cubic-bezier(.16,1,.3,1)] hover:bg-[length:100%_1.5px] hover:text-[#087783] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#087783] motion-reduce:transition-none sm:bg-[position:0_calc(100%-4px)]"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
              </div>
            </nav>
          ))}
        </div>
      </div>
    </section>
  );
}
