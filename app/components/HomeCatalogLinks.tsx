import Link from "next/link";
import { ArrowRight, CarFront, Car, Factory, Layers3, type LucideIcon } from "lucide-react";

import { buildAutoBrandPath, buildGroupPath, buildManufacturerPathFromLabel } from "app/lib/catalog-links";
import { CAR_BRANDS, GROUPS, PRODUCERS } from "app/lib/home-popular-links";

// Plain server-rendered links from the homepage into the catalog's main
// sections: part groups, car brands, the model pages that already draw search
// impressions, and producers. Without them the homepage HTML linked only to
// the three directory roots, so its weight never reached the pages people
// search for ("запчастини форд фокус 2"). Four ruled sections of dot-separated text links;
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
];

// Real catalog parts behind the cards (wide screens only).
const BACKDROP_PARTS: Array<{ code: string; className: string }> = [
  // Side gutters and the empty space right of the heading only, so no part
  // sits behind the pills; sizes follow the gutter width.
  { code: "00-00001414", className: "left-[0.5%] top-[110px] w-[clamp(96px,8vw,170px)] rotate-[8deg] opacity-80" }, // радіатор
  { code: "00-00001350", className: "left-[0.5%] bottom-6 w-[clamp(96px,8vw,165px)] -rotate-[6deg] opacity-80" }, // комплект ГРМ
  { code: "00-00004279", className: "right-[0.5%] top-[90px] w-[clamp(96px,8vw,160px)] -rotate-[10deg] opacity-85" }, // гальмівний диск Bosch
  { code: "00-00003450", className: "right-[0.5%] bottom-6 w-[clamp(96px,8vw,160px)] rotate-[14deg] opacity-80" }, // важіль підвіски
  { code: "00-00000537", className: "right-[24%] top-1 w-[110px] rotate-[8deg] opacity-75" }, // протитуманна фара
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
    links: CAR_BRANDS.map(([name, label]) => [buildAutoBrandPath(name), label]),
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
    links: PRODUCERS.map(([name, label]) => [buildManufacturerPathFromLabel(name), label]),
  },
];

export default function HomeCatalogLinks() {
  return (
    <section
      aria-labelledby="home-catalog-links-title"
      className="font-ui relative isolate overflow-hidden py-9 text-[#0f2b3d] [contain-intrinsic-size:auto_480px] [content-visibility:auto] sm:py-12"
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
        <h2
          id="home-catalog-links-title"
          className="font-display font-display-readable text-[clamp(22px,2vw,28px)] font-[800] leading-[1.15] tracking-[-.025em] text-[#0b2233]"
        >
          Популярні розділи <span className="text-[#087783]">каталогу</span>
        </h2>

        {/* No boxes: four sections on one ground, 2×2 from md, each with a
            ruled header row (icon, title, "Усі …") and its pills below. */}
        <div className="mt-6 grid gap-x-14 gap-y-9 sm:mt-8 md:grid-cols-2 md:gap-y-10">
          {CARDS.map(({ title, icon: Icon, allHref, allLabel, links }) => (
            <nav key={title} aria-label={title} className="min-w-0">
              <div className="flex items-center justify-between gap-3 border-b border-[#087783]/15 pb-3">
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
