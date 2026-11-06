import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import CatalogSectionNav, { type CatalogSectionId } from "app/components/CatalogSectionNav";
import SmartLink from "app/components/SmartLink";
import DirectoryHeroBackdrop from "./DirectoryHeroBackdrop";

interface CatalogHubHeroProps {
  current: CatalogSectionId;
  badge: string;
  title: string;
  titleAccent?: string;
  description: string;
  icon: LucideIcon;
  stats?: Array<{ label: string; value: string; icon: LucideIcon }>;
  quickLinks?: Array<{ href: string; label: string; icon: LucideIcon; accent?: boolean; prefetchOnViewport?: boolean }>;
  highlights?: string[];
  breadcrumb?: ReactNode;
  warmNavigation?: boolean;
}

const sectionLabels: Record<CatalogSectionId, string> = { auto: "Підбір по авто", groups: "Категорії", manufacturers: "Виробники" };

export default function CatalogHubHero({ current, title, titleAccent, description, stats = [], quickLinks = [], breadcrumb, warmNavigation = true }: CatalogHubHeroProps) {
  const uniqueLinks = quickLinks.filter((link, index, links) => link.href.startsWith("#") && links.findIndex(item => item.href === link.href) === index);
  const factualStats = stats.filter(stat => !["Наступний крок", "Результат", "Марка"].includes(stat.label));
  const accent = titleAccent && title.endsWith(titleAccent) ? titleAccent : null;
  return (
    <section className="directory-intro directory-intro--showcase">
      <DirectoryHeroBackdrop tone={current === "auto" ? "auto" : current === "groups" ? "groups" : "manufacturers"} />
      <CatalogSectionNav current={current} warmup={warmNavigation} />
      {/* Every directory hero has a breadcrumb row, so the title starts at the
          same height on hubs and on brand pages and nothing jumps between them. */}
      <div className="directory-intro-breadcrumb">
        {breadcrumb ?? (
          <nav aria-label="Навігаційні хлібні крихти">
            <ol className="flex flex-wrap items-center gap-2 text-xs font-medium">
              <li className="inline-flex items-center gap-2"><SmartLink href="/">Головна</SmartLink></li>
              <li className="inline-flex items-center gap-2"><span aria-hidden="true">/</span><span aria-current="page">{sectionLabels[current]}</span></li>
            </ol>
          </nav>
        )}
      </div>
      <div className="directory-intro-body">
        <div className="directory-intro-copy">
          <div>
            <h1 className="directory-heading-hero">
              {accent ? <><span className="directory-title-lead">{title.slice(0, -accent.length).trimEnd()}</span>{" "}<span className="directory-title-emphasis">{accent}</span></> : title}
            </h1>
            <p>{description}</p>
          </div>
        </div>
      </div>
      <div className="directory-intro-footer">
        {uniqueLinks.length ? (
          <nav className="directory-intro-links" aria-label="Швидкі переходи">
            {uniqueLinks.map(link => <SmartLink key={link.href} href={link.href} prefetchOnViewport={link.prefetchOnViewport} className={link.accent ? "directory-intro-link directory-intro-link--primary" : "directory-intro-link"}>{link.label}<ArrowRight size={17} aria-hidden="true" /></SmartLink>)}
          </nav>
        ) : null}
        {factualStats.length ? (
          <dl className="directory-intro-facts">
            {factualStats.map(stat => <div key={stat.label}><dt>{stat.label}</dt><dd>{stat.value}</dd></div>)}
          </dl>
        ) : null}
      </div>
    </section>
  );
}
