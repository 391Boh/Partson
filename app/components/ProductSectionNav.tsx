"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";

type ProductSectionNavItem = {
  href: string;
  label: string;
};

export default function ProductSectionNav({
  items,
}: {
  items: ProductSectionNavItem[];
}) {
  const [activeHref, setActiveHref] = useState(items[0]?.href ?? "");
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sections = items
      .map((item) => document.getElementById(item.href.slice(1)))
      .filter((section): section is HTMLElement => Boolean(section));
    if (sections.length === 0) return;

    // Anchors near the top of the viewport count as "current" a bit before
    // they're fully in view — feels right for a jump-to-section nav (you're
    // reading it once it's mostly there), rather than waiting for the whole
    // section to have scrolled past the very top edge.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target.id) {
          setActiveHref(`#${visible[0].target.id}`);
        }
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
    );

    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [items]);

  useEffect(() => {
    const rail = railRef.current;
    const activeLink = rail?.querySelector<HTMLAnchorElement>(`a[href="${activeHref}"]`);
    if (!rail || !activeLink) return;

    // `scrollIntoView` scrolls *every* scrollable ancestor the target isn't
    // fully visible in, not just this horizontal pill rail — including the
    // whole page's own vertical scroll once the rail itself had scrolled out
    // of view (this nav sits near the top, so that's true for most of the
    // page). Every scroll-spy update while reading further down yanked the
    // page back up to reveal it. Adjusting the rail's own scrollLeft instead
    // never touches vertical/page scroll at all.
    const railRect = rail.getBoundingClientRect();
    const linkRect = activeLink.getBoundingClientRect();
    if (linkRect.left < railRect.left || linkRect.right > railRect.right) {
      const delta =
        linkRect.left < railRect.left
          ? linkRect.left - railRect.left
          : linkRect.right - railRect.right;
      rail.scrollBy({ left: delta, behavior: "smooth" });
    }
  }, [activeHref]);

  // Plain <a href="#id"> jumps instantly — fine functionally, but a jarring
  // snap reads as "did that even work?" rather than a deliberate navigation
  // action. Smooth-scrolling to the target (and still updating the URL hash,
  // so back/forward and reload/deep-linking behave exactly as a normal
  // anchor link would) makes clicking one of these visibly do something.
  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    const target = document.getElementById(href.slice(1));
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.pushState(null, "", href);
    setActiveHref(href);
  };

  return (
    <nav aria-label="Розділи сторінки товару" className="select-none border-b border-slate-200/80 bg-white px-3 py-2.5 sm:px-5 lg:px-7">
      <div
        ref={railRef}
        className="mx-auto flex max-w-[1280px] items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => {
          const isActive = item.href === activeHref;
          return (
            <a
              key={item.href}
              href={item.href}
              onClick={(event) => handleClick(event, item.href)}
              aria-current={isActive ? "true" : undefined}
              // select-none — without it, clicking (especially a slightly
              // imprecise or double click, which the smooth-scroll's own
              // brief delay before the page visibly moves seems to invite)
              // highlighted the label's text like a text-selection drag
              // instead of reading as a clean navigation action.
              className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-[11px] font-extrabold tracking-[0.01em] transition sm:px-4 sm:text-[12px] ${
                isActive
                  ? "bg-slate-950 text-white shadow-[0_8px_18px_rgba(15,23,42,0.16)]"
                  : "border border-slate-200 bg-slate-50 text-slate-600 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
              }`}
            >
              {item.label}
              <ChevronRight size={13} aria-hidden="true" />
            </a>
          );
        })}
      </div>
    </nav>
  );
}
