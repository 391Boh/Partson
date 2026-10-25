import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, CarFront, ChevronDown, Factory, Layers3, type LucideIcon } from "lucide-react";

import { buildAutoBrandPath, buildGroupPath, buildManufacturerPathFromLabel } from "app/lib/catalog-links";

import { getCategoryIconPath } from "app/lib/category-icons";
import { CAR_BRANDS, GROUPS, PRODUCERS, carLogos, producerLogos } from "app/lib/home-popular-links";
import { HOME_POPULAR_ICONS } from "app/generated/home-popular-icons";

// Server-rendered, crawlable links from the homepage into the catalogue.
// The interactive car picker, category browser and manufacturer carousel
// mount client-side only (HomeDeferredStack), so without this block the
// homepage HTML linked to none of them. Static lists on purpose: no 1C call
// on the homepage render, and every URL here is one the sitemaps publish.



type SectionLink = { href: string; label: string; image?: string };

type ListVariant = "categories" | "cars" | "producers";

function LinkList({ title, icon: Icon, items, directoryHref, directoryLabel, variant }: {
  title: string;
  icon: LucideIcon;
  items: SectionLink[];
  directoryHref: string;
  directoryLabel: string;
  variant: ListVariant;
}) {
  const categories = variant === "categories";
  const heading = <><Icon size={19} strokeWidth={1.8} aria-hidden="true" /><h3>{title}</h3><span className="home-popular-count">{items.length}</span></>;
  const content = <>
      <ul className={`${categories ? "home-popular-category-list" : "home-popular-brand-list"} home-popular-list--${variant}`}>
        {items.map(({ href, label, image }) => (
          <li key={href}>
            <Link href={href} prefetch={false} className={categories ? "home-popular-category-link" : "home-popular-brand-link"}>
              {image && (
                <span className={categories ? "home-popular-category-image" : "home-popular-logo"}>
                  {/* 72px webp thumbnails (scripts/generate-home-popular-icons.ts):
                      the originals added up to ~400 KB for 36px icons. */}
                  <Image src={HOME_POPULAR_ICONS[image] ?? image} alt="" width={36} height={36} unoptimized loading="lazy" />
                </span>
              )}
              <span>{label}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href={directoryHref} prefetch={false} className="home-popular-directory-link">
        {directoryLabel}<ArrowUpRight size={16} aria-hidden="true" />
      </Link>
  </>;
  return categories ? (
    <div className="home-popular-group home-popular-group--categories">
      <div className="home-popular-group-heading">{heading}</div>{content}
    </div>
  ) : (
    <details className={`home-popular-group home-popular-group--${variant}`}>
      <summary className="home-popular-group-heading">{heading}<ChevronDown size={17} className="home-popular-expand" aria-hidden="true" /></summary>
      {content}
    </details>
  );
}

export default function HomeSeoLinks() {
  return (
    <nav aria-labelledby="home-seo-links-title" className="home-popular-nav home-popular-compact font-ui relative z-10 py-8 sm:py-10">
      <div className="home-popular-photo" aria-hidden="true">
        {/* Plain srcset: phones take the 960px copy (31 KB instead of 87 KB). */}
        {/* eslint-disable-next-line @next/next/no-img-element -- static srcset served by nginx */}
        <img
          src="/images/home/popular-sections-workshop-v1.webp"
          srcSet="/images/home/popular-sections-workshop-v1-960.webp 960w, /images/home/popular-sections-workshop-v1.webp 1672w"
          sizes="100vw"
          alt=""
          loading="lazy"
          decoding="async"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
      <div className="home-popular-content page-shell-inline">
        <header className="home-popular-intro home-popular-hero">
          <div className="home-popular-hero-body">
            <h2 id="home-seo-links-title" className="font-display font-display-readable">
              Популярні розділи <span>автозапчастин</span>
            </h2>
            <p>Перейдіть до потрібних деталей для ТО, гальмівної системи, підвіски чи двигуна. Або відкрийте каталог за маркою авто чи виробником.</p>
          </div>
        </header>
        <div className="home-popular-groups">
          <LinkList
            title="Категорії запчастин" icon={Layers3} variant="categories"
            directoryHref="/groups" directoryLabel="Усі категорії запчастин"
            items={GROUPS.map((label) => ({ href: buildGroupPath(label), label, image: getCategoryIconPath(label) }))}
          />
          <LinkList
            title="За маркою авто" icon={CarFront} variant="cars"
            directoryHref="/auto" directoryLabel="Усі марки автомобілів"
            items={CAR_BRANDS.map(([name, label]) => ({ href: buildAutoBrandPath(name), label, image: carLogos.get(name) }))}
          />
          <LinkList
            title="Виробники запчастин" icon={Factory} variant="producers"
            directoryHref="/manufacturers" directoryLabel="Усі виробники запчастин"
            items={PRODUCERS.map(([name, label]) => ({ href: buildManufacturerPathFromLabel(name), label, image: producerLogos.get(name) ?? undefined }))}
          />
        </div>
      </div>
    </nav>
  );
}
