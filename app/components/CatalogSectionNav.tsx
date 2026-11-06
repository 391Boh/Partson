import { CarFront, Factory, Layers3 } from "lucide-react";
import SmartLink from "app/components/SmartLink";
import DirectoryNavigationWarmup from "./DirectoryNavigationWarmup";
import type { DirectorySection } from "app/lib/directory-appearance";

export type CatalogSectionId = DirectorySection;
const items = [
  { id: "auto", href: "/auto", label: "Авто", icon: CarFront },
  { id: "groups", href: "/groups", label: "Категорії", icon: Layers3 },
  { id: "manufacturers", href: "/manufacturers", label: "Виробники", icon: Factory },
];

export default function CatalogSectionNav({ current, warmup = true }: { current: CatalogSectionId; warmup?: boolean }) {
  return (
    <div className="directory-nav-shell">
    <nav aria-label="Розділи каталогу" className="directory-section-nav">
      {warmup ? <DirectoryNavigationWarmup current={current} /> : null}
      {items.map(({ id, href, label, icon: Icon }) => (
        <SmartLink key={id} href={href} className="font-ui" aria-current={current === id ? "page" : undefined}>
          <span className="directory-section-icon"><Icon size={16} strokeWidth={2} aria-hidden="true" /></span>
          <span className="directory-section-label">{label}</span>
        </SmartLink>
      ))}
    </nav>
    </div>
  );
}
