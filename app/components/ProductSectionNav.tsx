"use client";

import { useEffect, useRef, useState } from "react";

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

    let observer: IntersectionObserver | undefined;
    const nav = railRef.current?.closest("nav");
    if (!nav) return;

    const pinnedContainer = nav.closest<HTMLElement>(".product-navigation-row") || nav;
    const observeSections = () => {
      observer?.disconnect();
      // Track the reading area beneath whatever is actually pinned. On phones
      // nothing is (globals.css), so only the site header covers the page.
      const pinnedBottom = (element: HTMLElement | null | undefined) => {
        if (!element) return 0;
        const style = getComputedStyle(element);
        if (style.position !== "sticky" && style.position !== "fixed") return 0;
        return (Number.parseFloat(style.top) || 0) + element.offsetHeight;
      };
      const headerVar = getComputedStyle(nav).getPropertyValue("--header-height").trim();
      const headerHeight = (Number.parseFloat(headerVar) || 4) * (headerVar.endsWith("px") ? 1 : 16);
      const identity = nav.closest(".product-page")?.querySelector<HTMLElement>(".product-identity-sticky");
      const coveredHeight = Math.max(headerHeight, pinnedBottom(pinnedContainer), pinnedBottom(identity));
      const top = Math.min(window.innerHeight - 40, coveredHeight + 8);
      const readingHeight = Math.max(40, (window.innerHeight - top) * 0.45);
      const bottom = Math.max(0, window.innerHeight - top - readingHeight);
      observer = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          if (visible[0]?.target.id) setActiveHref(`#${visible[0].target.id}`);
        },
        { rootMargin: `-${top}px 0px -${bottom}px 0px`, threshold: 0 }
      );
      sections.forEach((section) => observer?.observe(section));
    };
    observeSections();
    const resizeObserver = new ResizeObserver(observeSections);
    resizeObserver.observe(pinnedContainer);
    const identity = nav.closest(".product-page")?.querySelector(".product-identity-sticky");
    if (identity) resizeObserver.observe(identity);
    window.addEventListener("resize", observeSections);
    return () => {
      observer?.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("resize", observeSections);
    };
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
      rail.scrollBy({ left: delta, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
  }, [activeHref]);

  // Plain <a href="#id"> jumps instantly — fine functionally, but a jarring
  // snap reads as "did that even work?" rather than a deliberate navigation
  // action. Smooth-scrolling to the target (and still updating the URL hash,
  // so back/forward and reload/deep-linking behave exactly as a normal
  // anchor link would) makes clicking one of these visibly do something.
  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = document.getElementById(href.slice(1));
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    if (window.location.hash !== href) window.history.pushState(null, "", href);
    setActiveHref(href);
  };

  return (
    <nav aria-label="Розділи сторінки товару" className="product-details-nav">
      <div className="product-details-nav-inner">
        <div ref={railRef} className="product-details-nav-rail">
          {items.map((item) => {
            const isActive = item.href === activeHref;
            return (
              <a
                key={item.href}
                href={item.href}
                onClick={(event) => handleClick(event, item.href)}
                aria-current={isActive ? "location" : undefined}
                className="product-details-nav-link"
              >
                {item.label}
              </a>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
