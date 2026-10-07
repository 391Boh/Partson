import Link from "next/link";

import { buildAutoBrandPath, buildGroupPath } from "app/lib/catalog-links";
import { buildSeoSlug } from "app/lib/seo-slug";

// Server-rendered, crawlable links from the homepage into the catalogue.
// The interactive car picker, category browser and manufacturer carousel
// mount client-side only (HomeDeferredStack), so without this block the
// homepage HTML linked to none of them. Static lists on purpose: no 1C call
// on the homepage render, and every URL here is one the sitemaps publish.

const GROUPS = [
  "Деталі для ТО",
  "Гальмівна система",
  "Деталі підвіски",
  "Амортизація",
  "Деталі двигуна",
  "Рульова система",
  "Система охолодження",
  "Освітлення",
  "Паливна система",
  "Привід та коробка передач",
  "Датчики та електроніка",
  "Кузовні елементи",
];

const CAR_BRANDS = [
  ["VOLKSWAGEN", "Volkswagen"],
  ["SKODA", "Škoda"],
  ["RENAULT", "Renault"],
  ["TOYOTA", "Toyota"],
  ["OPEL", "Opel"],
  ["AUDI", "Audi"],
  ["BMW", "BMW"],
  ["MERCEDES-BENZ", "Mercedes-Benz"],
  ["FORD", "Ford"],
  ["HYUNDAI", "Hyundai"],
  ["KIA", "Kia"],
  ["NISSAN", "Nissan"],
  ["PEUGEOT", "Peugeot"],
  ["CITROEN", "Citroën"],
  ["MITSUBISHI", "Mitsubishi"],
  ["CHEVROLET", "Chevrolet"],
] as const;

const PRODUCERS = [
  ["BOSCH", "Bosch"],
  ["FEBI", "Febi"],
  ["TRW", "TRW"],
  ["LEMFORDER", "Lemförder"],
  ["SACHS", "Sachs"],
  ["SKF", "SKF"],
  ["KYB", "KYB"],
  ["ELRING", "Elring"],
  ["CORTECO", "Corteco"],
  ["DELPHI", "Delphi"],
  ["KNECHT", "Knecht"],
  ["MAGNETI MARELLI", "Magneti Marelli"],
] as const;

const linkClass =
  "inline-flex items-center rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-[13px] font-semibold text-slate-700 transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400";

function LinkList({ title, items }: { title: string; items: Array<{ href: string; label: string }> }) {
  return (
    <div className="min-w-0">
      <h3 className="text-[12px] font-black uppercase tracking-[0.1em] text-teal-700">{title}</h3>
      <ul className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} prefetch={false} className={linkClass}>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function HomeSeoLinks() {
  return (
    <nav aria-labelledby="home-seo-links-title" className="font-ui page-shell-inline relative z-10 py-8 sm:py-10">
      <h2 id="home-seo-links-title" className="font-display font-display-readable text-[22px] font-black leading-tight tracking-[-0.02em] text-slate-950 sm:text-[26px]">
        Автозапчастини у Львові: <span className="text-teal-600">популярні розділи</span>
      </h2>
      <p className="home-description mt-2 max-w-[70ch] text-[14px] leading-relaxed text-slate-600">
        Запчастини для ТО та ремонту за категорією, маркою авто або виробником — з самовивозом на
        Перфецького, 8 у Львові та доставкою по Україні.
      </p>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <LinkList
          title="Категорії запчастин"
          items={GROUPS.map((label) => ({ href: buildGroupPath(label), label }))}
        />
        <LinkList
          title="Запчастини за маркою авто"
          items={CAR_BRANDS.map(([name, label]) => ({ href: buildAutoBrandPath(name), label }))}
        />
        <LinkList
          title="Виробники"
          items={PRODUCERS.map(([name, label]) => ({ href: `/manufacturers/${buildSeoSlug(name)}`, label }))}
        />
      </div>
    </nav>
  );
}
