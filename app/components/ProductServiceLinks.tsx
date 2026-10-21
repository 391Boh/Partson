import Link from "next/link";
import { BadgeCheck, ChevronRight, CreditCard, MapPin, RotateCcw, ShieldCheck, Truck, type LucideIcon } from "lucide-react";

import {
  INFORMATION_SECTION_ACCENTS,
  informationSections,
  type InformationSectionKey,
} from "app/inform/section-config";

// Every figure comes from the information pages' own config, so the product
// page never promises anything /inform/* does not say.
const factOf = (key: InformationSectionKey, index: number) =>
  informationSections.find((section) => section.key === key)?.facts[index] ?? { value: "", label: "" };
const value = (key: InformationSectionKey, index: number) => factOf(key, index).value;
const label = (key: InformationSectionKey, index: number) => factOf(key, index).label;
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

type ServiceLink = {
  key: InformationSectionKey;
  title: string;
  detail: string;
  icon: LucideIcon;
};

const SERVICE_LINKS: ServiceLink[] = [
  { key: "delivery", title: `Доставка за ${value("delivery", 0)}`, detail: label("delivery", 1), icon: Truck },
  {
    key: "location",
    title: "Самовивіз у Львові",
    detail: `${value("location", 0)} · ${value("location", 1)} ${label("location", 1)}`,
    icon: MapPin,
  },
  {
    key: "payment",
    title: "Оплата",
    detail: `${capitalize(label("payment", 0))} · ${value("payment", 1)}`,
    icon: CreditCard,
  },
  { key: "warranty", title: `Гарантія ${value("warranty", 0)}`, detail: capitalize(label("warranty", 1)), icon: ShieldCheck },
  {
    key: "returns",
    title: `${value("returns", 0)} ${label("returns", 0)}`,
    detail: `${capitalize(label("returns", 2))} — ${value("returns", 2).toLowerCase()}`,
    icon: RotateCcw,
  },
  {
    key: "about",
    title: "Про PartsON",
    detail: `${value("about", 0)} ${label("about", 0)} · ${value("about", 1)} ${label("about", 1)}`,
    icon: BadgeCheck,
  },
];

export default function ProductServiceLinks() {
  return (
    <section className="product-section" aria-labelledby="product-service-title">
      <div className="product-section-head">
        <h2 id="product-service-title" className="font-display product-section-title">
          Доставка, оплата і гарантія
        </h2>
      </div>
      <ul className="product-service-grid">
        {SERVICE_LINKS.map(({ key, title, detail, icon: Icon }) => {
          const [from, to] = INFORMATION_SECTION_ACCENTS[key];
          return (
            <li key={key}>
              <Link
                href={`/inform/${key}`}
                prefetch={false}
                className="product-service-link"
                style={{ "--service-from": from, "--service-to": to } as React.CSSProperties}
              >
                <span className="product-service-icon" aria-hidden="true">
                  <Icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="product-service-title">{title}</span>
                  <span className="product-service-detail">{detail}</span>
                </span>
                <ChevronRight size={16} className="product-service-arrow" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
