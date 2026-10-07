"use client";

import { useEffect, useRef, type ReactNode, type MouseEvent } from "react";
import { usePathname } from "next/navigation";

const revealTargets = ".info-section-heading,.info-content-card,.info-callout,.info-step-card,.info-faq,.info-cta";

export default function InformationMotion({ children, className }: { children: ReactNode; className: string }) {
  const root = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const node = root.current;
    if (!node || !("IntersectionObserver" in window)) return;
    let attachedPage: HTMLElement | null = null;
    let attachedArt: HTMLElement | null = null;
    let cleanup = () => {};
    const attach = () => {
      const page = node.querySelector<HTMLElement>(".info-page");
      const art = page?.querySelector<HTMLElement>(".info-hero-art") ?? null;
      if (page === attachedPage && art === attachedArt) return;
      cleanup();
      attachedPage = page;
      attachedArt = art;
      if (!page || !art) return;
      const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
      const artObserver = new IntersectionObserver(([entry]) => {
        art.classList.toggle("info-art-paused", !entry.isIntersecting);
      });
      artObserver.observe(art);

      const items = CSS.supports("animation-timeline: view()") ? [] : Array.from(page.querySelectorAll<HTMLElement>(revealTargets));
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const item = entry.target as HTMLElement;
          item.classList.remove("info-motion-pending");
          if (!motion.matches) item.classList.add("info-motion-enter");
          observer.unobserve(item);
        });
      }, { rootMargin: "0px 0px -20px 0px", threshold: .06 });
      items.forEach((item) => {
        if (!motion.matches && item.getBoundingClientRect().top >= innerHeight) item.classList.add("info-motion-pending");
        observer.observe(item);
      });
      const showAll = () => {
        if (motion.matches) items.forEach((item) => item.classList.remove("info-motion-pending", "info-motion-enter"));
      };
      const focus = (event: FocusEvent) => {
        if (!(event.target instanceof HTMLElement)) return;
        const item = event.target.closest<HTMLElement>(".info-motion-pending");
        if (item) {
          item.classList.remove("info-motion-pending");
          observer.unobserve(item);
        }
      };
      motion.addEventListener("change", showAll);
      node.addEventListener("focusin", focus);
      cleanup = () => {
        artObserver.disconnect();
        observer.disconnect();
        art.classList.remove("info-art-paused");
        motion.removeEventListener("change", showAll);
        node.removeEventListener("focusin", focus);
        items.forEach((item) => item.classList.remove("info-motion-pending", "info-motion-enter"));
      };
    };
    // Layout can hydrate before its streamed page, and transitions replace art.
    const observer = new MutationObserver(attach);
    observer.observe(node, { childList: true, subtree: true });
    attach();
    return () => {
      observer.disconnect();
      cleanup();
    };
  }, [pathname]);

  const followAnchor = (event: MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>('a[href^="#"]');
    if (!link) return;
    const target = document.getElementById(link.hash.slice(1));
    if (!target || !root.current?.contains(target)) return;
    event.preventDefault();
    const offset = parseFloat(getComputedStyle(target).scrollMarginTop) || 112;
    window.history.replaceState(window.history.state, "", link.hash);
    window.scrollTo({ top: target.getBoundingClientRect().top + scrollY - offset, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  return <div ref={root} className={className} onClick={followAnchor}>{children}</div>;
}
