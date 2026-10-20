"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { HOME_BLOG_OVERVIEW, type HomeHighlight } from "app/lib/home-highlights";

export default function HomeHighlightsSlider({ services }: { services: HomeHighlight[] }) {
  const [articles, setArticles] = useState<HomeHighlight[]>([HOME_BLOG_OVERVIEW]);
  const [selection, setSelection] = useState({ id: HOME_BLOG_OVERVIEW.id, previousId: "" });
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [announcement, setAnnouncement] = useState("");
  const sectionRef = useRef<HTMLElement>(null);
  const gesture = useRef<{ x: number; y: number } | null>(null);
  // One article and its persistent service link do not need a carousel.
  const hasNewContent = articles.length > 1 || services.length > 1;
  const items = useMemo(() => hasNewContent ? [...articles, ...services] : articles, [articles, services, hasNewContent]);
  const hasSlides = items.length > 1;
  const selectedIndex = Math.max(0, items.findIndex((item) => item.id === selection.id));
  const selected = items[selectedIndex];
  const previous = items.find((item) => item.id === selection.previousId && item.id !== selected?.id);
  const rotating = inView && pageVisible && hasSlides;

  useEffect(() => {
    const controller = new AbortController();
    let observer: IntersectionObserver | undefined;
    const load = () => {
      observer?.disconnect();
      void fetch("/api/home-blog?view=all", { signal: controller.signal })
        .then((response) => response.ok ? response.json() : null)
        .then((payload: { items?: HomeHighlight[] } | null) => {
          if (!controller.signal.aborted && payload?.items?.length) setArticles(payload.items);
        })
        .catch(() => {});
    };
    if (typeof IntersectionObserver === "undefined") load();
    else {
      observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) load(); }, { rootMargin: "160px" });
      if (sectionRef.current) observer.observe(sectionRef.current);
    }
    return () => { observer?.disconnect(); controller.abort(); };
  }, []);

  useEffect(() => {
    const syncVisibility = () => setPageVisible(!document.hidden);
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: .25 });
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, []);

  useEffect(() => {
    if (!rotating || !selected) return;
    const timer = window.setTimeout(() => {
      setSelection({ id: items[(selectedIndex + 1) % items.length].id, previousId: selected.id });
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [rotating, selected, selectedIndex, items]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || !inView || !pageVisible) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const update = () => {
      frame = 0;
      const bounds = section.getBoundingClientRect();
      const progress = (window.innerHeight / 2 - bounds.top - bounds.height / 2) / (window.innerHeight + bounds.height);
      const offset = Math.max(-24, Math.min(24, progress * 48));
      section.style.setProperty("--highlight-parallax", `${offset.toFixed(2)}px`);
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    const stop = () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.cancelAnimationFrame(frame);
      frame = 0;
      section.style.removeProperty("--highlight-parallax");
      delete section.dataset.parallax;
    };
    const sync = () => {
      stop();
      if (motion.matches) return;
      section.dataset.parallax = "true";
      window.addEventListener("scroll", schedule, { passive: true });
      window.addEventListener("resize", schedule, { passive: true });
      schedule();
    };
    sync();
    motion.addEventListener("change", sync);
    return () => { stop(); motion.removeEventListener("change", sync); };
  }, [inView, pageVisible]);

  const select = (index: number) => {
    if (!items.length) return;
    const next = items[(index + items.length) % items.length];
    setSelection({ id: next.id, previousId: selected.id });
    setAnnouncement(next.title);
  };

  if (!selected) return null;

  return (
    <section ref={sectionRef} className="home-highlights font-ui" aria-label="Статті та послуги PartsON">
      <div className="page-shell-inline">
        <div
          className={`home-highlights-player${hasSlides ? "" : " is-static"}`}
          role={hasSlides ? "region" : undefined}
          aria-roledescription={hasSlides ? "карусель" : undefined}
          aria-label="Статті та послуги PartsON"
          onKeyDown={(event) => {
            if (!hasSlides) return;
            if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
              event.preventDefault();
              select(selectedIndex + (event.key === "ArrowRight" ? 1 : -1));
            }
          }}
        >
          <div className="home-highlights-stage">
            {[...(previous ? [previous] : []), selected].map((item) => {
              const outgoing = item.id !== selected.id;
              return (
                <article
                  key={item.id}
                  role={hasSlides ? "group" : undefined}
                  aria-roledescription={hasSlides ? "слайд" : undefined}
                  aria-label={hasSlides ? `${selectedIndex + 1} з ${items.length}: ${item.title}` : undefined}
                  aria-hidden={outgoing || undefined}
                  inert={outgoing}
                  className={`home-highlight-feature${outgoing ? " is-previous" : ""}`}
                  onPointerDown={(event) => { if (hasSlides && event.isPrimary) gesture.current = { x: event.clientX, y: event.clientY }; }}
                  onPointerCancel={() => { gesture.current = null; }}
                  onPointerUp={(event) => {
                    const start = gesture.current;
                    gesture.current = null;
                    if (!hasSlides || !start || event.pointerType === "mouse") return;
                    const dx = event.clientX - start.x;
                    const dy = event.clientY - start.y;
                    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) select(selectedIndex + (dx < 0 ? 1 : -1));
                  }}
                >
                  <div className="home-highlight-image">
                    <Image src={item.image} alt={item.imageAlt} fill sizes="100vw" className="home-highlight-cover" />
                  </div>
                  <div className="home-highlight-copy">
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                    <span className="home-highlight-meta">{item.meta}</span>
                    <div className="home-highlight-actions">
                      <Link className="home-highlight-action" href={item.href} prefetch={false}><span>{item.action}</span><ArrowUpRight size={18} aria-hidden="true" /></Link>
                      {item.kind === "article" && item.href !== "/blog" && (
                        <Link className="home-highlight-blog-link" href="/blog" prefetch={false}>Усі статті<ArrowRight size={14} aria-hidden="true" /></Link>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {services[0] && (
            <Link className="home-highlight-service-link" href={services[0].href} prefetch={false}>
              <span className="home-highlight-service-image">
                <Image src={services[0].image} alt="" fill sizes="76px" />
              </span>
              <span className="home-highlight-service-label">Комп’ютерна діагностика</span>
              <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          )}
          {hasSlides && <div className="home-highlights-controls">
            <span aria-hidden="true">{selectedIndex + 1}<span> / {items.length}</span></span>
            <button type="button" aria-label="Попередній матеріал" disabled={items.length < 2} onClick={() => select(selectedIndex - 1)}><ChevronLeft size={18} aria-hidden="true" /></button>
            <button type="button" aria-label="Наступний матеріал" disabled={items.length < 2} onClick={() => select(selectedIndex + 1)}><ChevronRight size={18} aria-hidden="true" /></button>
          </div>}
          {hasSlides && <p className="home-highlights-announcement" aria-live="polite" aria-atomic="true">{announcement}</p>}
        </div>
      </div>
    </section>
  );
}
