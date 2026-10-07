"use client";

import { useEffect, useRef, type MouseEvent } from "react";
import { ArrowUpRight } from "lucide-react";

const sections = [
  { id: "benefits", label: "Для кого" },
  { id: "how-it-works", label: "Як стати партнером" },
  { id: "savings", label: "Ваша економія" },
  { id: "delivery", label: "Доставка" },
  { id: "faq", label: "Запитання" },
];

export default function PartnershipScrollNav() {
  const nav = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = nav.current;
    const page = node?.closest<HTMLElement>(".partner-page");
    if (!node || !page) return;
    const links = Array.from(node.querySelectorAll<HTMLAnchorElement>(".partner-nav-links a"));
    const targets = sections.map(({ id }) => document.getElementById(id));
    const rail = node.querySelector<HTMLElement>(".partner-nav-links");
    let frame = 0;
    let current = "";
    const update = () => {
      frame = 0;
      const navBounds = node.getBoundingClientRect();
      const pageBounds = page.getBoundingClientRect();
      const travel = Math.max(1, pageBounds.height - window.innerHeight);
      const progress = Math.max(0, Math.min(1, -pageBounds.top / travel));
      const line = navBounds.bottom + 48;
      let active = "";
      targets.forEach((target) => {
        if (target && target.getBoundingClientRect().top <= line) active = target.id;
      });
      node.style.setProperty("--partner-read-progress", String(progress));
      if (active === current) return;
      current = active;
      links.forEach((link) => {
        const selected = link.hash === `#${active}`;
        if (selected) {
          link.setAttribute("aria-current", "location");
          if (rail && rail.scrollWidth > rail.clientWidth) {
            rail.scrollTo({ left: link.offsetLeft - rail.clientWidth / 2 + link.offsetWidth / 2, behavior: "auto" });
          }
        } else link.removeAttribute("aria-current");
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(page);
    update();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  const goToSection = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const target = document.getElementById(id);
    if (!target || !nav.current) return;
    event.preventDefault();
    const headerHeight = parseFloat(getComputedStyle(nav.current).top) || 64;
    const top = target.getBoundingClientRect().top + window.scrollY - headerHeight - nav.current.offsetHeight - 14;
    window.history.replaceState(window.history.state, "", `#${id}`);
    window.scrollTo({ top, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  return (
    <nav ref={nav} className="partner-section-nav" aria-label="Розділи партнерської програми">
      <div className="page-shell-inline partner-nav-inner">
        <span className="partner-nav-brand">PARTSON <small>PARTNER</small></span>
        <div className="partner-nav-links">{sections.map(({ id, label }) => <a key={id} href={`#${id}`} onClick={(event) => goToSection(event, id)}>{label}</a>)}</div>
        <a className="partner-nav-catalog" href="/katalog">Каталог <ArrowUpRight size={15} /></a>
      </div>
      <div className="partner-scroll-progress" aria-hidden="true"><span /></div>
    </nav>
  );
}
