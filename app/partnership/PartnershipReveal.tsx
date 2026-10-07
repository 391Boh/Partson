"use client";

import { useEffect, useRef, type ReactNode, type MouseEvent } from "react";

const targets = [
  ".partner-eyebrow", ".partner-hero h1", ".partner-hero-description",
  ".partner-hero-actions", ".partner-hero-proof", ".partner-stat-bar > div",
  ".partner-section-heading", ".partner-audience-card", ".partner-service-line",
  ".partner-step-grid > li", ".partner-savings-section > div:first-child",
  ".partner-calculator", ".partner-delivery-grid > article",
  ".partner-faq-section > div:first-child", ".partner-faq-list > details",
  ".partner-final > div",
  ".partner-graphic",
].join(",");

export default function PartnershipReveal({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const items = Array.from(node.querySelectorAll<HTMLElement>(targets));
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches || !("IntersectionObserver" in window)) return;

    const reveal = (element: HTMLElement) => {
      element.classList.remove("partner-reveal-pending");
      element.classList.add("partner-reveal-in");
    };
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        reveal(entry.target as HTMLElement);
        observer.unobserve(entry.target);
      });
    }, { threshold: .08, rootMargin: "0px 0px -24px 0px" });

    // Independent translate leaves the entrance and hover transforms intact.
    const driftItems = Array.from(node.querySelectorAll<HTMLElement>("[data-partner-drift]"));
    const active = new Set<HTMLElement>();
    const previous = new Map<HTMLElement, { x: number; y: number }>();
    let frame = 0;
    const updateDrift = () => {
      frame = 0;
      if (motion.matches) return;
      const scale = window.innerWidth < 768 ? .4 : 1;
      const positions = Array.from(active, (item) => {
        const old = previous.get(item) ?? { x: 0, y: 0 };
        const bounds = item.getBoundingClientRect();
        const distance = window.innerHeight / 2 - (bounds.top - old.y + bounds.height / 2);
        const shift = Math.max(-28, Math.min(28, distance * Number(item.dataset.partnerDrift))) * scale;
        return { item, x: item.dataset.partnerDriftAxis === "x" ? shift : 0, y: item.dataset.partnerDriftAxis === "x" ? 0 : shift };
      });
      positions.forEach(({ item, x, y }) => {
        item.style.setProperty("--partner-shift-x", `${x.toFixed(2)}px`);
        item.style.setProperty("--partner-shift-y", `${y.toFixed(2)}px`);
        previous.set(item, { x, y });
      });
    };
    const scheduleDrift = () => {
      if (!motion.matches && active.size && !frame) frame = requestAnimationFrame(updateDrift);
    };
    const driftObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) active.add(entry.target as HTMLElement);
        else active.delete(entry.target as HTMLElement);
      });
      scheduleDrift();
    }, { rootMargin: "80px" });
    driftItems.forEach((item) => driftObserver.observe(item));
    window.addEventListener("scroll", scheduleDrift, { passive: true });
    window.addEventListener("resize", scheduleDrift);

    items.forEach((item) => {
      const siblings = Array.from(item.parentElement?.children ?? []);
      const staggered = item.matches(".partner-audience-card,.partner-step-grid > li,.partner-delivery-grid > article,.partner-stat-bar > div,.partner-faq-list > details");
      item.style.setProperty("--partner-reveal-delay", `${staggered ? Math.min(siblings.indexOf(item), 3) * 75 : 0}ms`);
      // Server-rendered content stays visible until JavaScript is ready.
      if (item.getBoundingClientRect().top >= window.innerHeight) {
        item.classList.add("partner-reveal-pending");
      }
      observer.observe(item);
    });

    const showAll = () => {
      if (!motion.matches) return;
      observer.disconnect();
      items.forEach((item) => item.classList.remove("partner-reveal-pending", "partner-reveal-in"));
      cancelAnimationFrame(frame);
      frame = 0;
      driftItems.forEach((item) => {
        item.style.removeProperty("--partner-shift-x");
        item.style.removeProperty("--partner-shift-y");
      });
      previous.clear();
    };
    const onFocus = (event: FocusEvent) => {
      if (!(event.target instanceof HTMLElement)) return;
      const item = event.target.closest<HTMLElement>(".partner-reveal-pending");
      if (item) {
        reveal(item);
        observer.unobserve(item);
      }
    };
    motion.addEventListener("change", showAll);
    node.addEventListener("focusin", onFocus);
    return () => {
      observer.disconnect();
      driftObserver.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleDrift);
      window.removeEventListener("resize", scheduleDrift);
      motion.removeEventListener("change", showAll);
      node.removeEventListener("focusin", onFocus);
      items.forEach((item) => item.classList.remove("partner-reveal-pending", "partner-reveal-in"));
      driftItems.forEach((item) => {
        item.style.removeProperty("--partner-shift-x");
        item.style.removeProperty("--partner-shift-y");
      });
    };
  }, []);

  const handleAnchor = (event: MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>('a[href^="#"]');
    if (!link || link.closest(".partner-section-nav")) return;
    const target = document.getElementById(link.hash.slice(1));
    const nav = root.current?.querySelector<HTMLElement>(".partner-section-nav");
    if (!target || !nav) return;
    event.preventDefault();
    const headerHeight = parseFloat(getComputedStyle(nav).top) || 64;
    window.history.replaceState(window.history.state, "", link.hash);
    window.scrollTo({
      top: target.getBoundingClientRect().top + window.scrollY - headerHeight - nav.offsetHeight - 14,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  };

  return <div ref={root} className="partner-page font-ui" onClick={handleAnchor}>{children}</div>;
}
