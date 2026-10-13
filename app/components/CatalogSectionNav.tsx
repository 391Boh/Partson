import { CarFront, Factory, Layers3 } from "lucide-react";
import SmartLink from "app/components/SmartLink";

export type CatalogSectionId = "auto" | "groups" | "manufacturers";
const items = [
  { id: "auto", href: "/auto", label: "Авто", icon: CarFront },
  { id: "groups", href: "/groups", label: "Категорії", icon: Layers3 },
  { id: "manufacturers", href: "/manufacturers", label: "Виробники", icon: Factory },
];

export default function CatalogSectionNav({ current }: { current: CatalogSectionId }) {
  return (
    <nav aria-label="Розділи каталогу" className="directory-section-nav">
      {items.map(({ id, href, label, icon: Icon }) => (
        <SmartLink key={id} href={href} aria-current={current === id ? "page" : undefined}>
          <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
          <span>{label}</span>
        </SmartLink>
      ))}
    </nav>
  );
}
