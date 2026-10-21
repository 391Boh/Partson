"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { HOME_BLOG_OVERVIEW, type HomeHighlight } from "app/lib/home-highlights";

export default function HomeHighlightsSlider({ services, initialArticles = [], serverResolved = false }: { services: HomeHighlight[]; initialArticles?: HomeHighlight[]; serverResolved?: boolean }) {
  const [articles, setArticles] = useState<HomeHighlight[]>(() => initialArticles.length ? initialArticles : [HOME_BLOG_OVERVIEW]);
  const [selection, setSelection] = useState<{ current: HomeHighlight; previous: HomeHighlight | null }>(() => ({ current: initialArticles[0] ?? HOME_BLOG_OVERVIEW, previous: null }));
  const [pendingSlide, setPendingSlide] = useState<HomeHighlight | null>(null);
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [announcement, setAnnouncement] = useState("");
  const sectionRef = useRef<HTMLElement>(null);
  const gesture = useRef<{ x: number; y: number } | null>(null);
  // One article and its persistent service link do not need a carousel.
  const hasNewContent = articles.length > 1 || services.length > 1;
  const items = useMemo(() => hasNewContent ? [...articles, ...services] : articles, [articles, services, hasNewContent]);
  const hasSlides = items.length > 1;
  const selected = selection.current;
  const selectedIndex = Math.max(0, items.findIndex((item) => item.id === selected.id));
  const previous = selection.previous;
  const selectedRef = useRef(selected);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  // Keep the visible slide until next/image has decoded its replacement.
  // Its old snapshot survives API refreshes even when it leaves the item list.
  const commitPendingSlide = () => {
    if (!pendingSlide) return;
    setSelection(current => ({
      current: pendingSlide,
      previous: current.current.id === pendingSlide.id && current.current.image === pendingSlide.image ? null : current.current,
    }));
    setPendingSlide(null);
  };

  useEffect(() => {
    if (!previous) return;
    const timer = window.setTimeout(() => {
      setSelection(current => current === selection ? { ...current, previous: null } : current);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [previous, selection]);
  const rotating = inView && pageVisible && hasSlides;

  useEffect(() => {
    if (!serverResolved) return;
    const controller = new AbortController();
    // Revalidate the small preview payload at hydration. The server-provided
    // cover is already downloading; API latency never gates its first paint.
    void fetch("/api/home-blog?view=all", { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then((payload: { items?: HomeHighlight[] } | null) => {
        if (!controller.signal.aborted && payload?.items?.length) {
          setArticles(payload.items);
          setPendingSlide(payload.items.find(item => item.id === selectedRef.current.id) ?? payload.items[0]);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [serverResolved]);

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
      setPendingSlide(items[(selectedIndex + 1) % items.length]);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [rotating, selected, selectedIndex, items]);

  // Keep the promo's footprint stable. Scroll-driven height, typography and
  // padding invalidated layout for every section below it on every frame.

  const select = (index: number) => {
    if (!items.length) return;
    const next = items[(index + items.length) % items.length];
    setPendingSlide(next);
    setAnnouncement(next.title);
  };

  if (!selected) return null;

  return (
    <section ref={sectionRef} data-server-resolved={serverResolved || undefined} className="home-highlights font-ui" aria-label="Статті та послуги PartsON">
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
            {pendingSlide && (
              <Image
                key={`${pendingSlide.id}:${pendingSlide.image}`}
                src={pendingSlide.image} alt="" fill aria-hidden="true"
                sizes="(max-width: 767px) 100vw, (max-width: 1440px) 90vw, 1280px"
                loading="eager" className="home-highlight-preload"
                onLoad={commitPendingSlide}
                onError={commitPendingSlide}
              />
            )}
            {[...(previous ? [previous] : []), selected].map((item) => {
              const outgoing = item !== selected;
              return (
                <article
                  key={`${item.id}:${item.image}`}
                  role={hasSlides ? "group" : undefined}
                  aria-roledescription={hasSlides ? "слайд" : undefined}
                  aria-label={hasSlides ? `${selectedIndex + 1} з ${items.length}: ${item.title}` : undefined}
                  aria-hidden={outgoing || undefined}
                  inert={outgoing}
                  className={`home-highlight-feature${outgoing ? " is-previous" : previous ? " is-entering" : ""}`}
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
                    {serverResolved && <Image
                      src={item.image} alt={item.imageAlt} fill
                      sizes="(max-width: 767px) 100vw, (max-width: 1440px) 90vw, 1280px"
                      loading={outgoing ? "lazy" : "eager"}
                      className="home-highlight-cover"
                      onLoad={event => { event.currentTarget.dataset.loaded = "true"; }}
                    />}
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
