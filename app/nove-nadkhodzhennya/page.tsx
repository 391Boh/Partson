import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, PackagePlus } from "lucide-react";

import CatalogHubHero from "app/components/CatalogHubHero";
import { catalogPageBackgroundClass } from "app/components/catalog-directory-styles";
import { buildGroupItemPath } from "app/lib/catalog-links";
import { getFullGroupsDirectoryData } from "app/lib/groups-directory-data";
import { HOME_ARRIVAL_CARDS } from "app/lib/home-arrivals";
import { pluralizeProducts } from "app/lib/pluralize-uk";
import { buildPageMetadata } from "app/lib/seo-metadata";
import { buildPlainSeoSlug } from "app/lib/seo-slug";
import { VITOL_GROUP_SECTION, VITOL_GROUPS } from "app/lib/vitol-groups";

// The new arrivals range (accessories, car care, tools, lamps — VITOL) in one
// place. Since the 2026-11-23 catalog restructure its groups live in several
// sections, so the homepage banner links here instead of to one section.
export const revalidate = 3600;

const PATH = "/nove-nadkhodzhennya";

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    title: "Нове надходження: аксесуари, автохімія та інструмент | PartsON",
    description:
      "Нове надходження в PartsON: автохімія, освіжувачі, інструмент, автолампи, компресори, аксесуари для салону та інше. Ціни, наявність і доставка по Україні.",
    canonicalPath: PATH,
    keywords: ["нове надходження", "автоаксесуари", "автохімія", "інструмент для авто", "автолампи", "partson новинки"],
  });
}

const about = new Map(HOME_ARRIVAL_CARDS.map((card) => [card.group, card]));

export default async function NewArrivalsPage() {
  const { clientGroups } = await getFullGroupsDirectoryData();
  const sections = Array.from(new Set(VITOL_GROUPS.map((group) => VITOL_GROUP_SECTION[group]))).map((sectionName) => {
    const section = clientGroups.find((group) => group.label === sectionName);
    const sectionSlug = section?.slug || buildPlainSeoSlug(sectionName);
    const groups = VITOL_GROUPS.filter((group) => VITOL_GROUP_SECTION[group] === sectionName).map((group) => {
      const subgroup = section?.subgroups.find((entry) => entry.label === group);
      return {
        label: group,
        href: buildGroupItemPath(sectionSlug, subgroup?.slug || buildPlainSeoSlug(group)),
        count: subgroup?.productCount ?? 0,
        about: about.get(group)?.about,
        brands: about.get(group)?.brands,
      };
    }).sort((a, b) => b.count - a.count);
    return { name: sectionName, groups, total: groups.reduce((sum, group) => sum + group.count, 0) };
  }).sort((a, b) => b.total - a.total);
  const total = sections.reduce((sum, section) => sum + section.total, 0);

  return (
    <main className={catalogPageBackgroundClass}>
      <div className="page-shell-inline catalog-hub-stage relative flex flex-col py-3 sm:py-4 lg:py-5">
        <CatalogHubHero
          current="groups"
          badge="Нове надходження"
          icon={PackagePlus}
          title="Нове надходження"
          titleAccent="аксесуари, автохімія та інструмент"
          description={`${total > 0 ? `${total.toLocaleString("uk-UA")} ${pluralizeProducts(total)}` : "Товари"} для авто й гаража в ${VITOL_GROUPS.length} групах: інструмент, автохімія й догляд, освіжувачі, автолампи, компресори, аксесуари для салону. Усі товари під замовлення — постачання 1–3 дні.`}
          highlights={["Ціни й наявність у каталозі", "Постачання 1–3 дні", "Доставка по Україні та самовивіз у Львові"]}
        />
      </div>

      <div className="page-shell-inline flex flex-col gap-8 pb-10 sm:gap-10 sm:pb-14">
        {sections.map((section) => (
          <section key={section.name} aria-labelledby={`arrivals-${buildPlainSeoSlug(section.name)}`}>
            <div className="mb-3 flex items-baseline justify-between gap-3 sm:mb-4">
              <h2 id={`arrivals-${buildPlainSeoSlug(section.name)}`} className="font-display text-[clamp(1.2rem,2.2vw,1.6rem)] font-extrabold tracking-[-0.02em] text-slate-950">
                {section.name}
              </h2>
              {section.total > 0 && (
                <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-500">
                  {section.total.toLocaleString("uk-UA")} {pluralizeProducts(section.total)}
                </span>
              )}
            </div>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {section.groups.map((group) => (
                <li key={group.label} className="h-full">
                  <Link
                    href={group.href}
                    prefetch={false}
                    className="group/arrival flex h-full min-h-[112px] flex-col justify-between gap-3 rounded-[18px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_10px_24px_-18px_rgb(15_43_61/45%)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-[0_16px_30px_-18px_rgb(15_43_61/55%)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                  >
                    <span className="flex flex-col gap-1">
                      <span className="text-[15px] font-extrabold leading-snug text-slate-900">{group.label}</span>
                      {group.about && <span className="text-[13px] leading-5 text-slate-600">{group.about}</span>}
                    </span>
                    <span className="flex items-center justify-between gap-2 text-[13px] font-semibold">
                      <span className="tabular-nums text-teal-700">
                        {group.count > 0 ? `${group.count.toLocaleString("uk-UA")} ${pluralizeProducts(group.count)}` : "Переглянути"}
                      </span>
                      <ArrowRight size={16} aria-hidden="true" className="text-slate-400 transition-transform duration-200 group-hover/arrival:translate-x-0.5 group-hover/arrival:text-teal-700" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
