import { useId } from "react";
import { ArrowRight, type LucideIcon } from "lucide-react";
import SmartLink from "app/components/SmartLink";

interface CatalogSeoTextSectionProps {
  badge: string;
  title: string;
  lead: string;
  paragraphs: string[];
  topics: Array<{ title: string; text: string; icon: LucideIcon }>;
  links: Array<{ href: string; label: string }>;
  contained?: boolean;
  numbered?: boolean;
}

export default function CatalogSeoTextSection({ title, lead, paragraphs, topics, links, contained = true }: CatalogSeoTextSectionProps) {
  const headingId = useId();
  const uniqueParagraphs = [...new Set(paragraphs.map(text => text.trim()).filter(text => text && text !== lead.trim()))];
  const uniqueLinks = links.filter((link, index, all) => all.findIndex(item => item.href === link.href) === index);
  return (
    <section className="directory-guide-section" aria-labelledby={headingId}>
      <div className={contained ? "page-shell-inline" : undefined}>
        <article className="directory-guide">
          <div className="directory-guide-copy">
            <h2 id={headingId} className="directory-heading">{title}</h2>
            <p className="directory-guide-lead">{lead}</p>
            {uniqueParagraphs.map(text => <p key={text}>{text}</p>)}
            {uniqueLinks.length ? <nav className="directory-guide-links" aria-label="Продовжити підбір">{uniqueLinks.map(link => <SmartLink key={link.href} href={link.href}>{link.label}<ArrowRight size={15} aria-hidden="true" /></SmartLink>)}</nav> : null}
          </div>
          {topics.length ? <div className="directory-guide-notes">{topics.map(topic => { const Icon = topic.icon; return <section key={topic.title}><Icon size={20} strokeWidth={1.8} aria-hidden="true" /><div><h3>{topic.title}</h3><p>{topic.text}</p></div></section>; })}</div> : null}
        </article>
      </div>
    </section>
  );
}
