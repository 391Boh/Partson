import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, CarFront, Factory, Layers3, PackageCheck, Truck, Wrench, type LucideIcon } from "lucide-react";

import { buildAutoBrandPath, buildGroupPath, buildManufacturerPathFromLabel } from "app/lib/catalog-links";

import { getCategoryIconPath } from "app/lib/category-icons";
import { carBrands } from "./carBrands";
import { brands } from "./brandsData";

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

const carLogos = new Map(carBrands.map(({ name, logo }) => [name.toUpperCase(), logo]));
const producerLogos = new Map(brands.map(({ name, logo }) => [name.toUpperCase(), logo]));
// The shared KNECHT entry currently points to MANN-FILTER; use its own asset here.
producerLogos.set("KNECHT", "/Brands/MahleKnecht.png");

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
  return (
    <div className={`home-popular-group home-popular-group--${variant}`}>
      <div className="home-popular-group-heading">
        <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
        <h3>{title}</h3>
      </div>
      <ul className={`${categories ? "home-popular-category-list" : "home-popular-brand-list"} home-popular-list--${variant}`}>
        {items.map(({ href, label, image }) => (
          <li key={href}>
            <Link href={href} prefetch={false} className={categories ? "home-popular-category-link" : "home-popular-brand-link"}>
              {image && (
                <span className={categories ? "home-popular-category-image" : "home-popular-logo"}>
                  <Image src={image} alt="" width={36} height={36} unoptimized loading="lazy" />
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
    </div>
  );
}

export default function HomeSeoLinks() {
  return (
    <nav aria-labelledby="home-seo-links-title" className="home-popular-nav font-ui relative z-10 py-8 sm:py-10">
      <div className="home-popular-photo" aria-hidden="true">
        <Image src="/images/home/popular-sections-workshop-v1.webp" alt="" fill sizes="100vw" unoptimized loading="lazy" />
      </div>
      <div className="home-popular-content page-shell-inline">
        <header className="home-popular-intro home-popular-hero">
          <div className="home-popular-hero-photo" aria-hidden="true">
            <Image src="/images/directories/parts-workbench-v1.webp" alt="" fill sizes="(min-width: 1280px) 1200px, 100vw" unoptimized loading="lazy" />
          </div>
          <div className="home-popular-hero-body">
            <span className="home-popular-hero-eyebrow">
              <span className="home-popular-hero-icon" aria-hidden="true">
                <Wrench size={20} strokeWidth={2} />
              </span>
              Каталог PartsON
            </span>
            <h2 id="home-seo-links-title" className="font-display font-display-readable">
              Популярні розділи <span>автозапчастин</span>
            </h2>
            <p>
              Купити автозапчастини у Львові можна за трьома шляхами: за{" "}
              <Link href="/groups" prefetch={false}>категорією запчастин</Link>{" "}
              (деталі для ТО, гальмівна система, підвіска, двигун, охолодження),
              за <Link href="/auto" prefetch={false}>маркою та моделлю авто</Link>{" "}
              або за <Link href="/manufacturers" prefetch={false}>виробником</Link>{" "}
              — Bosch, Febi, TRW, SKF, Sachs, KYB та інших.
            </p>
            <p>
              У кожному розділі — актуальні ціни, наявність на складі й аналоги за
              артикулом. Не впевнені в сумісності? Підберемо деталь за VIN-кодом.
              Самовивіз у Львові на вул. Перфецького, 8, або доставка Новою Поштою
              по всій Україні.
            </p>
            <ul className="home-popular-hero-facts" aria-label="PartsON у цифрах">
              <li><PackageCheck size={16} aria-hidden="true" /><strong>10 000+</strong> товарів</li>
              <li><Factory size={16} aria-hidden="true" /><strong>130+</strong> виробників</li>
              <li><CarFront size={16} aria-hidden="true" /><strong>60+</strong> марок авто</li>
              <li><Truck size={16} aria-hidden="true" />Самовивіз і доставка по Україні</li>
            </ul>
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
