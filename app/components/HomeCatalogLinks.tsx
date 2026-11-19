import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight, CarFront, Car, Factory, Layers3, type LucideIcon } from "lucide-react";

import { buildAutoBrandPath, buildGroupPath, buildManufacturerPathFromLabel } from "app/lib/catalog-links";
import { CAR_BRANDS, GROUPS, PRODUCERS } from "app/lib/home-popular-links";

// Plain server-rendered links from the homepage into the catalog's main
// sections: part groups, car brands, the model pages that already draw search
// impressions, and producers. Without them the homepage HTML linked only to
// the three directory roots, so its weight never reached the pages people
// search for ("запчастини форд фокус 2"). Four compact cards of pill links;
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

// Rough pill width at 13px semibold: ~8px per character (Cyrillic runs wide) plus padding,
// border and the 6px gap. Half the total (plus slack) gives two rows.
const twoRowWidth = (links: Array<[string, string]>) =>
  Math.ceil(links.reduce((total, [, label]) => total + label.length * 8 + 32, 0) / 2 + 24);

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
      </div>

      <div className="mx-auto w-full max-w-[var(--page-shell-max)] px-[var(--page-shell-gutter)]">
        <h2
          id="home-catalog-links-title"
          className="font-display font-display-readable text-[clamp(22px,2vw,28px)] font-[800] leading-[1.15] tracking-[-.025em] text-[#0b2233]"
        >
          Популярні розділи <span className="text-[#087783]">каталогу</span>
        </h2>

        <div className="mt-5 grid gap-3 sm:mt-6 md:grid-cols-2 md:gap-4">
          {CARDS.map(({ title, icon: Icon, allHref, allLabel, links }) => (
            <nav
              key={title}
              aria-label={title}
              className="overflow-hidden rounded-[20px] border border-white/80 bg-white/70 p-4 shadow-[inset_0_1px_0_rgb(255_255_255/90%),0_1px_2px_rgb(15_43_61/5%),0_12px_26px_-20px_rgb(15_60_80/40%)] sm:p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2.5 text-[15px] font-extrabold leading-tight text-[#0b2233]">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#e6f5f5] text-[#087783]">
                    <Icon size={17} aria-hidden="true" />
                  </span>
                  {title}
                </h3>
                <Link
                  href={allHref}
                  prefetch={false}
                  className="group/all inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full px-2 text-[13px] font-bold text-[#087783] hover:bg-[#e6f5f5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#087783]"
                >
                  {allLabel}
                  <ArrowRight size={14} aria-hidden="true" className="transition-transform duration-200 group-hover/all:translate-x-0.5" />
                </Link>
              </div>
              {/* Phones: the pills wrap inside a row about half their total
                  width, so they pack into two tight rows that scroll
                  sideways; wider screens wrap at the card's width. */}
              <div className="-mx-4 mt-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden">
              <ul
                style={{ "--pills-row": `${twoRowWidth(links)}px` } as CSSProperties}
                className="flex w-[var(--pills-row)] flex-wrap gap-1.5 sm:w-auto sm:gap-2"
              >
                {links.map(([href, label]) => (
                  <li key={href}>
                    <Link
                      href={href}
                      prefetch={false}
                      className="inline-flex min-h-9 items-center rounded-full border border-[#0f4c5c]/[0.1] bg-white px-3 text-[13px] font-semibold leading-tight text-[#2b4f63] transition-[color,border-color,background-color] duration-200 hover:border-[#087783]/40 hover:bg-[#f0faf9] hover:text-[#087783] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#087783] sm:min-h-8"
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
