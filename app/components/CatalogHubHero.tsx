import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import CatalogSectionNav, { type CatalogSectionId } from "app/components/CatalogSectionNav";
import SmartLink from "app/components/SmartLink";

interface CatalogHubHeroProps {
  current: CatalogSectionId;
  badge: string;
  title: string;
  description: string;
  icon: LucideIcon;
  stats?: Array<{ label: string; value: string; icon: LucideIcon }>;
  quickLinks?: Array<{ href: string; label: string; icon: LucideIcon; accent?: boolean; prefetchOnViewport?: boolean }>;
  highlights?: string[];
  breadcrumb?: ReactNode;
}

export default function CatalogHubHero({ current, title, description, icon: Icon, stats = [], quickLinks = [], breadcrumb }: CatalogHubHeroProps) {
  const uniqueLinks = quickLinks.filter((link, index, links) => link.href.startsWith("#") && links.findIndex(item => item.href === link.href) === index);
  const factualStats = stats.filter(stat => !["Наступний крок", "Результат", "Марка"].includes(stat.label));
  return (
    <section className="directory-intro">
      <CatalogSectionNav current={current} />
      {breadcrumb ? <div className="directory-intro-breadcrumb">{breadcrumb}</div> : null}
      <div className="directory-intro-body">
        <div className="directory-intro-copy">
          <span className="directory-intro-icon" aria-hidden="true"><Icon size={28} strokeWidth={1.8} /></span>
          <div>
            <h1 className="directory-heading-hero">{title}</h1>
            <p>{description}</p>
          </div>
        </div>
        {factualStats.length ? (
          <dl className="directory-intro-facts">
            {factualStats.map(stat => <div key={stat.label}><dt>{stat.label}</dt><dd>{stat.value}</dd></div>)}
          </dl>
        ) : null}
      </div>
      {uniqueLinks.length ? (
        <nav className="directory-intro-links" aria-label="Швидкі переходи">
          {uniqueLinks.map(link => <SmartLink key={link.href} href={link.href} prefetchOnViewport={link.prefetchOnViewport} className={link.accent ? "directory-intro-link directory-intro-link--primary" : "directory-intro-link"}>{link.label}<ArrowRight size={16} aria-hidden="true" /></SmartLink>)}
        </nav>
      ) : null}
    </section>
  );
}
