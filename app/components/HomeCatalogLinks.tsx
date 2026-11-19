import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { buildAutoBrandPath, buildGroupPath, buildManufacturerPathFromLabel } from "app/lib/catalog-links";
import { CAR_BRANDS, GROUPS, PRODUCERS } from "app/lib/home-popular-links";

// Plain server-rendered links from the homepage into the catalog's main
// sections: part groups, car brands, the model pages that already draw search
// impressions, and producers. Without them the homepage HTML linked only to
// the three directory roots, so its weight never reached the pages people
// search for ("запчастини форд фокус 2"). Text links only: no icons, no JS.

const POPULAR_MODELS: Array<[path: string, label: string]> = [
  ["/auto/ford/focus-ii", "Ford Focus II"],
  ["/auto/volkswagen/caddy-iii", "Volkswagen Caddy III"],
  ["/auto/skoda/octavia-ii", "Škoda Octavia II"],
  ["/auto/opel/astra-h", "Opel Astra H"],
  ["/auto/renault/megane-ii", "Renault Megane II"],
  ["/auto/renault/logan-i", "Renault Logan I"],
  ["/auto/volkswagen/golf-iv", "Volkswagen Golf IV"],
  ["/auto/volkswagen/passat-b6", "Volkswagen Passat B6"],
  ["/auto/volkswagen/transporter-t5", "Volkswagen Transporter T5"],
  ["/auto/opel/vivaro-a", "Opel Vivaro A"],
];

const COLUMNS: Array<{ title: string; allHref: string; allLabel: string; links: Array<[string, string]> }> = [
  {
    title: "Групи запчастин",
    allHref: "/groups",
    allLabel: "Усі групи",
    links: GROUPS.map((label) => [buildGroupPath(label), label]),
  },
  {
    title: "Марки авто",
    allHref: "/auto",
    allLabel: "Усі марки",
    links: CAR_BRANDS.map(([name, label]) => [buildAutoBrandPath(name), `Запчастини ${label}`]),
  },
  {
    title: "Популярні моделі",
    allHref: "/auto",
    allLabel: "Підібрати за авто",
    links: POPULAR_MODELS,
  },
  {
    title: "Виробники",
    allHref: "/manufacturers",
    allLabel: "Усі виробники",
    links: PRODUCERS.map(([name, label]) => [buildManufacturerPathFromLabel(name), label]),
  },
];

export default function HomeCatalogLinks() {
  return (
    <section
      aria-labelledby="home-catalog-links-title"
      className="font-ui border-t border-[#0f4c5c]/[0.08] bg-[#f4f8fa] py-10 text-[#0f2b3d] [contain-intrinsic-size:auto_560px] [content-visibility:auto] sm:py-12"
    >
      <div className="mx-auto w-full max-w-[var(--page-shell-max)] px-[var(--page-shell-gutter)]">
        <h2
          id="home-catalog-links-title"
          className="font-display font-display-readable text-[clamp(22px,2vw,28px)] font-[800] leading-[1.15] tracking-[-.025em] text-[#0b2233]"
        >
          Популярні розділи каталогу
        </h2>
        <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-8 sm:gap-x-8 lg:grid-cols-4">
          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h3 className="text-[13px] font-bold uppercase tracking-[.06em] text-[#087783]">{column.title}</h3>
              <ul className="mt-3 space-y-0.5">
                {column.links.map(([href, label]) => (
                  <li key={href}>
                    <Link
                      href={href}
                      prefetch={false}
                      className="inline-flex min-h-9 items-center rounded-md text-[14px] sm:min-h-8 font-medium leading-[1.35] text-[#2b4f63] underline-offset-[3px] transition-colors hover:text-[#087783] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#087783]"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href={column.allHref}
                prefetch={false}
                className="mt-2 inline-flex min-h-9 items-center gap-1.5 text-[13.5px] font-bold text-[#087783] underline-offset-[3px] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#087783]"
              >
                {column.allLabel}
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </nav>
          ))}
        </div>
      </div>
    </section>
  );
}
