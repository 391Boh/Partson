"use client";

import { useEffect, useRef, useState } from "react";

type ProductSectionNavItem = {
  href: string;
  label: string;
  /** Shown instead of `label` on phones, where the rail is a row of pills. */
  shortLabel?: string;
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

    // Desktop pins the navigation row; phones share one sticky container
    // for the admin bar and section navigation.
    const mobileControls = nav.closest<HTMLElement>(".product-pinned-controls");
    const navigationRow = nav.closest<HTMLElement>(".product-navigation-row") || nav;
    const observeSections = () => {
      observer?.disconnect();
      const pinnedContainer = mobileControls && getComputedStyle(mobileControls).position === "sticky"
        ? mobileControls
        : navigationRow;
      // Track the reading area beneath the header and pinned controls.
      const pinnedBottom = (element: HTMLElement | null | undefined) => {
        if (!element) return 0;
        const style = getComputedStyle(element);
        if (style.position !== "sticky" && style.position !== "fixed") return 0;
        return (Number.parseFloat(style.top) || 0) + element.offsetHeight;
      };
      const headerVar = getComputedStyle(nav).getPropertyValue("--header-height").trim();
      const headerHeight = (Number.parseFloat(headerVar) || 4) * (headerVar.endsWith("px") ? 1 : 16);
      const identity = nav.closest(".product-page")?.querySelector<HTMLElement>(".product-identity-sticky");
      const coveredHeight = Math.max(headerHeight, pinnedBottom(pinnedContainer), pinnedBottom(nav), pinnedBottom(identity));
      const top = Math.min(window.innerHeight - 40, coveredHeight + 8);
      const readingHeight = Math.max(40, (window.innerHeight - top) * 0.45);
      const bottom = Math.max(0, window.innerHeight - top - readingHeight);
      // A callback lists only the sections whose visibility just changed, so
      // picking from it alone jumped to whichever section last entered the
      // reading area (the active pill flickered between neighbours). Keep
      // every section's state and take the first visible one in page order.
      const visibleSections = new Set<Element>();
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) visibleSections.add(entry.target);
            else visibleSections.delete(entry.target);
          }
          const first = sections.find((section) => visibleSections.has(section));
          if (first?.id) setActiveHref(`#${first.id}`);
        },
        { rootMargin: `-${top}px 0px -${bottom}px 0px`, threshold: 0 }
      );
      sections.forEach((section) => observer?.observe(section));
    };
    observeSections();
    // Rebuilding the observer reads styles and re-reports every section, so
    // batch it to one frame.
    let frame = 0;
    const scheduleObserve = () => {
      if (!frame) frame = window.requestAnimationFrame(() => { frame = 0; observeSections(); });
    };
    const resizeObserver = new ResizeObserver(scheduleObserve);
    resizeObserver.observe(navigationRow);
    if (mobileControls) resizeObserver.observe(mobileControls);
    if (navigationRow !== nav) resizeObserver.observe(nav);
    const identity = nav.closest(".product-page")?.querySelector(".product-identity-sticky");
    if (identity) resizeObserver.observe(identity);
    // iOS Safari fires resize all through a scroll while its toolbar slides
    // in and out (a few dozen px of height). Rebuilding on each of those
    // during the gesture shook the pinned pills; only a real change counts.
    let lastWidth = window.innerWidth;
    let lastHeight = window.innerHeight;
    const handleResize = () => {
      const widthChanged = window.innerWidth !== lastWidth;
      const heightChanged = Math.abs(window.innerHeight - lastHeight) > 150;
      if (!widthChanged && !heightChanged) return;
      lastWidth = window.innerWidth;
      lastHeight = window.innerHeight;
      scheduleObserve();
    };
    window.addEventListener("resize", handleResize);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [items]);

  useEffect(() => {
    const rail = railRef.current;
    const activeLink = rail?.querySelector<HTMLAnchorElement>(`a[href="${activeHref}"]`);
    if (!rail || !activeLink) return;
    // The mobile grid fits all four tabs. Do not start a horizontal smooth
    // scroll (or force layout reads) during native vertical momentum scroll.
    if (rail.scrollWidth <= rail.clientWidth + 1) return;

    // `scrollIntoView` scrolls *every* scrollable ancestor the target isn't
    // fully visible in, not just this horizontal pill rail — including the
    // whole page's own vertical scroll once the rail itself had scrolled out
    // of view (this nav sits near the top, so that's true for most of the
    // page). Every scroll-spy update while reading further down yanked the
    // page back up to reveal it. Adjusting the rail's own scrollLeft instead
    // never touches vertical/page scroll at all.
    const railRect = rail.getBoundingClientRect();
    const linkRect = activeLink.getBoundingClientRect();
    if (linkRect.left < railRect.left - 1 || linkRect.right > railRect.right + 1) {
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
                {item.shortLabel ? (
                  <>
                    <span className="product-details-nav-label">{item.label}</span>
                    <span className="product-details-nav-label-short" aria-hidden="true">{item.shortLabel}</span>
                  </>
                ) : (
                  item.label
                )}
              </a>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
