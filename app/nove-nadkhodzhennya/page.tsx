import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, PackageCheck, PackagePlus, Store, Truck } from "lucide-react";

import CatalogHubHero from "app/components/CatalogHubHero";
import CatalogSeoTextSection from "app/components/CatalogSeoTextSection";
import {
  catalogPageBackgroundClass,
  directoryHeaderClass,
  directoryPanelClass,
} from "app/components/catalog-directory-styles";
import ManufacturerCatalogProducts from "app/manufacturers/[slug]/ManufacturerCatalogProducts";
import { buildGroupItemPath } from "app/lib/catalog-links";
import { fetchCatalogProductsByQuery, fetchEuroRate, type CatalogProduct } from "app/lib/catalog-server";
import { getGroupProductPreview } from "app/lib/group-product-image";
import { buildProductPhotoPath } from "app/lib/product-image-variant-path";
import { getFullGroupsDirectoryData } from "app/lib/groups-directory-data";
import { HOME_ARRIVAL_CARDS } from "app/lib/home-arrivals";
import { pluralizeProducts } from "app/lib/pluralize-uk";
import { withoutCostPrice } from "app/lib/public-catalog-product";
import { resolveWithTimeout } from "app/lib/resolve-with-timeout";
import { safeJsonLd } from "app/lib/safe-json-ld";
import { buildPageMetadata } from "app/lib/seo-metadata";
import { buildPlainSeoSlug } from "app/lib/seo-slug";
import { getSiteUrl } from "app/lib/site-url";
import { VITOL_GROUP_SECTION, VITOL_GROUPS, type VitolGroup } from "app/lib/vitol-groups";

// The new arrivals range (accessories, car care, tools, lamps, wipers) in one
// place. Since the 2026-11-23 catalog restructure its groups live in several
// sections, so the homepage banner links here instead of to one section.
export const revalidate = 3600;

const PATH = "/nove-nadkhodzhennya";
// Short names for the combined heading of the small sections.
const SHORT_SECTION_NAMES: Record<string, string> = {
  "Оливи, рідини та автохімія": "автохімія",
  "Склоочисники та омивачі": "склоочисники",
  "Освітлення": "освітлення",
  "Електрика та електроніка": "автоелектрика",
};
const IN_STOCK_LIMIT = 12;

const TITLE = "Нове надходження: автохімія, інструмент, аксесуари";
const DESCRIPTION =
  "Нове надходження автотоварів у PartsON, Львів: автохімія, інструмент, автолампи, щітки склоочисника, аксесуари. Є в наявності, решта — 1–3 дні.";

const FAQ = [
  {
    question: "Що входить у нове надходження PartsON?",
    answer:
      "Автохімія та засоби догляду, освіжувачі повітря, ручний і будівельний інструмент, домкрати, компресори й шиноремонт, автолампи й ліхтарі, щітки склоочисника, автоелектрика та аксесуари для салону й подорожей.",
  },
  {
    question: "Чи є ці товари в наявності у Львові?",
    answer:
      "Частина товарів уже лежить у магазині на вул. Перфецького, 8 — їх зібрано в блоці «Вже в наявності». Решта доступна під замовлення з постачанням за 1–3 дні.",
  },
  {
    question: "Як замовити товар із нового надходження?",
    answer:
      "Додайте товар у кошик і оформіть замовлення — для швидкого замовлення достатньо номера телефону. Менеджер передзвонить, підтвердить наявність і узгодить доставку Новою Поштою або самовивіз у Львові.",
  },
];

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    title: TITLE,
    description: DESCRIPTION,
    canonicalPath: PATH,
    keywords: [
      "нове надходження автотоварів",
      "новинки автотоварів",
      "автохімія купити львів",
      "інструмент для авто",
      "ручний інструмент купити",
      "автолампи led",
      "щітки склоочисника купити",
      "автоаксесуари львів",
      "освіжувачі повітря для авто",
      "компресор автомобільний",
      "автотовари в наявності львів",
    ],
    openGraphTitle: "Нове надходження автотоварів | PartsON",
  });
}

const cardInfo = new Map(HOME_ARRIVAL_CARDS.map((card) => [card.group, card]));

// In-stock products of the new-arrival groups: one request per section (1C
// keys these two-level groups by section), bucketed by group and interleaved
// so the block shows several groups instead of one long list.
const NEW_ARRIVAL_GROUPS = new Set<string>(VITOL_GROUPS);
const loadInStock = async (sectionNames: string[]) => {
  const lists = await Promise.all(
    sectionNames.map((section) =>
      resolveWithTimeout(
        () =>
          fetchCatalogProductsByQuery({
            page: 1,
            limit: 60,
            group: section,
            onlyInStock: true,
            pricedItemsOnly: true,
            forceAllgoodsSource: true,
            includePriceEnrichment: true,
            timeoutMs: 5000,
            retries: 0,
          }).then((result) => result.items),
        [] as CatalogProduct[],
        5500
      ).catch(() => [] as CatalogProduct[])
    )
  );
  const byGroup = new Map<string, CatalogProduct[]>();
  const seen = new Set<string>();
  for (const item of lists.flat()) {
    const group = NEW_ARRIVAL_GROUPS.has(item.group || "") ? item.group! : NEW_ARRIVAL_GROUPS.has(item.subGroup || "") ? item.subGroup! : "";
    if (!group || !item.code || !item.name || (item.quantity ?? 0) <= 0 || seen.has(item.code)) continue;
    seen.add(item.code);
    byGroup.set(group, [...(byGroup.get(group) || []), item]);
  }
  const usable = Array.from(byGroup.values()).map((items) =>
    items.sort((a, b) => Number(b.hasPhoto === true) - Number(a.hasPhoto === true))
  );
  const picked: CatalogProduct[] = [];
  for (let round = 0; picked.length < IN_STOCK_LIMIT && usable.some((items) => items.length > round); round += 1) {
    for (const items of usable) {
      if (items[round] && picked.length < IN_STOCK_LIMIT) picked.push(items[round]);
    }
  }
  return { products: picked, groupsWithStock: usable.length };
};

// A product photo for each group card the build-time preview manifest does
// not cover: one small request per such group, products with a photo only.
const loadGroupPhotos = async (groups: VitolGroup[]) => {
  const entries = await Promise.all(
    groups.map((group) =>
      resolveWithTimeout(
        () =>
          fetchCatalogProductsByQuery({
            page: 1,
            limit: 1,
            group: VITOL_GROUP_SECTION[group],
            subcategory: group,
            withPhotoOnly: true,
            forceAllgoodsSource: true,
            timeoutMs: 4000,
            retries: 0,
          }).then((result) => result.items[0]),
        undefined,
        4500
      )
        .catch(() => undefined)
        .then((item) => {
          const path = item?.code && item.hasPhoto === true
            ? buildProductPhotoPath({ code: item.code, article: item.article, name: item.name, producer: item.producer })
            : "";
          return [group, path] as const;
        })
    )
  );
  return new Map(entries.filter(([, path]) => path));
};

export default async function NewArrivalsPage() {
  const siteUrl = getSiteUrl();
  const { clientGroups } = await getFullGroupsDirectoryData();

  const sectionNames = Array.from(new Set(VITOL_GROUPS.map((group) => VITOL_GROUP_SECTION[group])));
  const groupPhotos: Map<string, string> = await loadGroupPhotos(
    VITOL_GROUPS.filter((group) => !getGroupProductPreview({ categoryLabel: VITOL_GROUP_SECTION[group], itemLabel: group }))
  );
  const sections = sectionNames
    .map((sectionName) => {
      const section = clientGroups.find((group) => group.label === sectionName);
      const sectionSlug = section?.slug || buildPlainSeoSlug(sectionName);
      const groups = VITOL_GROUPS.filter((group) => VITOL_GROUP_SECTION[group] === sectionName)
        .map((group) => {
          const subgroup = section?.subgroups.find((entry) => entry.label === group);
          const preview = getGroupProductPreview({ categoryLabel: sectionName, itemLabel: group });
          return {
            label: group,
            href: buildGroupItemPath(sectionSlug, subgroup?.slug || buildPlainSeoSlug(group)),
            count: subgroup?.productCount ?? 0,
            about: cardInfo.get(group)?.about,
            brands: cardInfo.get(group)?.brands,
            image: preview?.url || groupPhotos.get(group) || null,
          };
        })
        .sort((a, b) => b.count - a.count);
      return { name: sectionName, groups, total: groups.reduce((sum, group) => sum + group.count, 0) };
    })
    .sort((a, b) => b.total - a.total);
  const total = sections.reduce((sum, section) => sum + section.total, 0);
  // Sections with one or two new groups share one block (a lone card per
  // row left most of the width empty); each card then names its section.
  const largeSections = sections.filter((section) => section.groups.length >= 3);
  const smallSections = sections.filter((section) => section.groups.length < 3);
  const displaySections = [
    ...largeSections.map((section) => ({ ...section, groups: section.groups.map((group) => ({ ...group, tag: null as string | null })) })),
    ...(smallSections.length
      ? [{
          name: (() => {
            const words = smallSections.map((section) => SHORT_SECTION_NAMES[section.name] || section.name.toLocaleLowerCase("uk-UA"));
            const text = words.length > 1 ? `${words.slice(0, -1).join(", ")} та ${words[words.length - 1]}` : words[0];
            return text.charAt(0).toLocaleUpperCase("uk-UA") + text.slice(1);
          })(),
          total: smallSections.reduce((sum, section) => sum + section.total, 0),
          groups: smallSections.flatMap((section) => section.groups.map((group) => ({ ...group, tag: section.name as string | null }))),
        }]
      : []),
  ];

  const { products: inStock, groupsWithStock } = await loadInStock(sectionNames);
  const euroRate = inStock.length
    ? await resolveWithTimeout(() => fetchEuroRate(), null, 800).catch(() => null)
    : null;

  const pageUrl = `${siteUrl}${PATH}`;
  const allGroups = sections.flatMap((section) => section.groups);
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "@id": `${pageUrl}#collection-page`,
      name: TITLE,
      description: DESCRIPTION,
      url: pageUrl,
      inLanguage: "uk-UA",
      isPartOf: { "@type": "WebSite", name: "PartsON", url: siteUrl },
      mainEntity: {
        "@type": "ItemList",
        name: "Групи нового надходження PartsON",
        numberOfItems: allGroups.length,
        itemListElement: allGroups.map((group, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: group.label,
          url: `${siteUrl}${group.href}`,
          ...(group.image ? { image: `${siteUrl}${group.image}` } : {}),
        })),
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Головна", item: `${siteUrl}/` },
        { "@type": "ListItem", position: 2, name: "Нове надходження", item: pageUrl },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map((entry) => ({
        "@type": "Question",
        name: entry.question,
        acceptedAnswer: { "@type": "Answer", text: entry.answer },
      })),
    },
  ];

  return (
    <main className={catalogPageBackgroundClass}>
      <script
        id="new-arrivals-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <div className="page-shell-inline catalog-hub-stage relative flex flex-col py-3 sm:py-4 lg:py-5">
        <CatalogHubHero
          current="groups"
          badge="Новинки PartsON"
          icon={PackagePlus}
          title="Нове надходження"
          titleAccent="автохімія, інструмент та аксесуари"
          description={`${total > 0 ? `${total.toLocaleString("uk-UA")} ${pluralizeProducts(total)}` : "Сотні товарів"} для авто й гаража в ${VITOL_GROUPS.length} групах: автохімія й догляд, ручний інструмент, автолампи, щітки склоочисника, компресори, аксесуари для салону.${inStock.length ? " Частина вже в наявності у Львові," : ""} решта — постачання 1–3 дні.`}
          highlights={[
            inStock.length ? "Є товари в наявності у Львові" : "Постачання 1–3 дні",
            "Ціни та наявність у каталозі",
            "Доставка по Україні й самовивіз",
          ]}
        />
      </div>

      <div className="page-shell-inline flex flex-col gap-8 pb-8 sm:gap-10">
        {inStock.length > 0 && (
          <section className={directoryPanelClass} aria-labelledby="arrivals-in-stock">
            <div className={`${directoryHeaderClass} flex flex-wrap items-end justify-between gap-3`}>
              <div>
                <p className="directory-kicker inline-flex items-center gap-1.5 text-[11px] uppercase text-emerald-800">
                  <Store size={13} aria-hidden="true" /> Магазин на Перфецького, 8
                </p>
                <h2 id="arrivals-in-stock" className="directory-heading mt-1 text-xl text-slate-900 sm:text-2xl">
                  Вже в наявності
                </h2>
                <p className="mt-1 max-w-[60ch] text-sm leading-6 text-slate-600">
                  Ці товари з нового надходження вже лежать у магазині: заберіть сьогодні або отримайте доставкою.
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200">
                <PackageCheck size={14} aria-hidden="true" />
                {groupsWithStock} {groupsWithStock === 1 ? "група" : groupsWithStock < 5 ? "групи" : "груп"} у наявності
              </span>
            </div>
            <div className="p-3 sm:p-4">
              <ManufacturerCatalogProducts products={inStock.map(withoutCostPrice)} euroRate={euroRate ?? undefined} />
            </div>
          </section>
        )}

        {displaySections.map((section) => {
          const headingId = `arrivals-${buildPlainSeoSlug(section.name)}`;
          return (
            <section key={section.name} aria-labelledby={headingId}>
              <div className="mb-3 flex items-baseline justify-between gap-3 sm:mb-4">
                <h2 id={headingId} className="font-display text-[clamp(1.2rem,2.2vw,1.6rem)] font-extrabold tracking-[-0.02em] text-slate-950">
                  {section.name}
                </h2>
                {section.total > 0 && (
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-500">
                    {section.total.toLocaleString("uk-UA")} {pluralizeProducts(section.total)}
                  </span>
                )}
              </div>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
                {section.groups.map((group) => (
                  <li key={group.label} className="h-full">
                    <Link
                      href={group.href}
                      prefetch={false}
                      className="group/arrival flex h-full flex-col overflow-hidden rounded-[20px] border border-slate-200/80 bg-white shadow-[0_12px_28px_-20px_rgb(15_43_61/50%)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-[0_18px_34px_-20px_rgb(15_43_61/60%)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                    >
                      <span className="relative block aspect-[2/1] overflow-hidden bg-[linear-gradient(135deg,#f0fdfa,#eff6ff)]">
                        {group.image ? (
                          <Image
                            src={group.image}
                            alt={`${group.label} — нове надходження PartsON`}
                            fill
                            sizes="(min-width: 1280px) 300px, (min-width: 640px) 45vw, 92vw"
                            className="object-contain p-3 mix-blend-multiply transition-transform duration-300 group-hover/arrival:scale-[1.04] motion-reduce:transition-none"
                          />
                        ) : (
                          <span className="absolute inset-0 grid place-items-center text-teal-700/60">
                            <PackagePlus size={40} aria-hidden="true" />
                          </span>
                        )}
                        {group.tag && (
                          <span className="absolute right-3 top-3 rounded-full bg-teal-700/90 px-2.5 py-0.5 text-[11px] font-bold text-white shadow-sm">
                            {group.tag}
                          </span>
                        )}
                        {group.count > 0 && (
                          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-0.5 text-[12px] font-bold tabular-nums text-slate-800 shadow-sm ring-1 ring-slate-200/80">
                            {group.count.toLocaleString("uk-UA")} {pluralizeProducts(group.count)}
                          </span>
                        )}
                      </span>
                      <span className="flex flex-1 flex-col gap-1.5 p-4">
                        <span className="text-[15px] font-extrabold leading-snug text-slate-900">{group.label}</span>
                        {group.about && <span className="text-[13px] leading-5 text-slate-600">{group.about}</span>}
                        {group.brands && <span className="text-[12px] font-semibold tracking-wide text-slate-400">{group.brands}</span>}
                        <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-[13px] font-bold text-teal-700">
                          Переглянути товари
                          <ArrowRight size={15} aria-hidden="true" className="transition-transform duration-200 group-hover/arrival:translate-x-0.5" />
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <CatalogSeoTextSection
        badge="Нове надходження"
        title="Нове надходження автотоварів у PartsON"
        lead="Розширений асортимент для авто й гаража: від автохімії та освіжувачів до професійного інструменту, автоламп і аксесуарів для салону."
        topics={[
          { title: "Вже в наявності", text: "Частина нового надходження вже в магазині у Львові — її можна забрати в день замовлення.", icon: Store },
          { title: "Постачання 1–3 дні", text: "Товари під замовлення привозимо за 1–3 дні; менеджер підтвердить термін після оформлення.", icon: Truck },
          { title: "Перевірені бренди", text: "ALLOID, VITOL, VOIN, PULSO, AREON, ABRO та інші виробники з гарантією від постачальника.", icon: BadgeCheck },
        ]}
        paragraphs={[
          "У новому надходженні PartsON — автохімія та засоби догляду (поліролі, шампуні, очисники), освіжувачі повітря, ручний, будівельний і садовий інструмент, домкрати, автомобільні компресори й набори для шиноремонту, LED і галогенні автолампи, ліхтарі, щітки склоочисника, автоелектрика, чохли на кермо й сидіння, номерні рамки, антени та аксесуари для салону.",
          "Ціни на сайті актуальні, а наявність оновлюється з облікової системи магазину. Замовити можна онлайн або за телефоном: для швидкого замовлення достатньо номера, менеджер передзвонить і узгодить доставку Новою Поштою по Україні або самовивіз з вул. Перфецького, 8 у Львові.",
          ...FAQ.map((entry) => `${entry.question} ${entry.answer}`),
        ]}
        links={[
          { href: "/groups/instrument", label: "Інструмент" },
          { href: "/groups/aksesuary", label: "Аксесуари" },
          { href: "/groups/olyvy-ridyny-ta-avtokhimiya", label: "Автохімія та оливи" },
          { href: "/katalog", label: "Увесь каталог" },
        ]}
      />
    </main>
  );
}
