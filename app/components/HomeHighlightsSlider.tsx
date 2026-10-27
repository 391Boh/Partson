"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, BookOpen, ChevronLeft, ChevronRight, Gauge } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { HOME_BLOG_OVERVIEW, type HomeHighlight } from "app/lib/home-highlights";

// Whole sentences up to ~120 characters: the half has a fixed height, and a
// teaser cut mid-phrase with an ellipsis read as broken. The first sentence
// always stays, even when it is longer.
const TEASER_MAX_CHARS = 120;
// Homepage preview URLs already serve a resized, cached WebP.
const isPreparedCover = (image: string) => image.startsWith("/api/blog/og-image/") && image.includes("preview=1");
const teaserOf = (text: string) => {
  const sentences = text.replace(/\s+/g, " ").trim().match(/[^.!?…]+[.!?…]+(?=\s|$)|[^.!?…]+$/g) ?? [];
  let teaser = "";
  for (const sentence of sentences) {
    const next = `${teaser} ${sentence.trim()}`.trim();
    if (teaser && next.length > TEASER_MAX_CHARS) break;
    teaser = next;
  }
  return teaser.replace(/\s*(?:\.{3}|…)$/, ".");
};

export default function HomeHighlightsSlider({ services, initialArticles = [], serverResolved = false }: { services: HomeHighlight[]; initialArticles?: HomeHighlight[]; serverResolved?: boolean }) {
  const [articles, setArticles] = useState<HomeHighlight[]>(() => initialArticles.length ? initialArticles : [HOME_BLOG_OVERVIEW]);
  const [selection, setSelection] = useState<{ current: HomeHighlight; previous: HomeHighlight | null }>(() => ({ current: initialArticles[0] ?? HOME_BLOG_OVERVIEW, previous: null }));
  const [pendingSlide, setPendingSlide] = useState<HomeHighlight | null>(null);
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [announcement, setAnnouncement] = useState("");
  const sectionRef = useRef<HTMLElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number } | null>(null);
  // Two halves: the articles rotate on the left, the service stays on the
  // right as its own panel, so only articles take part in the carousel.
  const items = articles;
  const service = services[0];
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
    // Refresh after the initial render, without competing with the hero and
    // first article cover. Cached server content is already usable immediately.
    const refresh = () => { void fetch("/api/home-blog?view=all", { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then((payload: { items?: HomeHighlight[] } | null) => {
        if (!controller.signal.aborted && payload?.items?.length) {
          setArticles(payload.items);
          const next = payload.items.find(item => item.id === selectedRef.current.id) ?? payload.items[0];
          const current = selectedRef.current;
          if (current.id === HOME_BLOG_OVERVIEW.id) {
            // The first real article's text must not wait on its cover decode.
            setSelection({ current: next, previous: null });
          } else if (JSON.stringify(current) !== JSON.stringify(next)) {
            setPendingSlide(next);
          }
        }
      })
      .catch(() => {}); };
    const timer = window.setTimeout(refresh, initialArticles.length ? 2000 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [serverResolved, initialArticles.length]);

  // The contour's running light is measured in screen pixels (its stroke
  // does not scale with the SVG), so it needs the block's real perimeter.
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      player.style.setProperty("--highlight-perimeter", `${Math.round(2 * (width + height))}px`);
    });
    observer.observe(player);
    return () => observer.disconnect();
  }, []);

  // Only update the decorative stroke while visible; scrolling never changes
  // the panel's geometry or React state. A short opacity tail settles at rest.
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !inView || !pageVisible) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let lastY = window.scrollY;
    let distance = 0;
    let frame = 0;
    let settleTimer = 0;
    const paint = () => {
      frame = 0;
      const delta = window.scrollY - lastY;
      lastY = window.scrollY;
      if (reducedMotion.matches || !delta) return;
      distance += delta * 1.05;
      player.style.setProperty("--highlight-offset", `${-distance}px`);
      player.style.setProperty("--highlight-pulse", String(.38 + Math.min(Math.abs(delta) / 150, .4)));
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        player.style.removeProperty("--highlight-pulse");
      }, 180);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(paint);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer);
      player.style.removeProperty("--highlight-pulse");
    };
  }, [inView, pageVisible]);

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
      {/* Full bleed: both photos run edge to edge; the copy keeps to the page
          shell's edges (--highlight-gutter in globals.css). */}
      <div ref={playerRef} className={`home-highlights-player home-highlights-split${hasSlides ? "" : " is-static"}${service ? "" : " is-single"}${inView ? " is-in-view" : ""}`}>
        <div
          className="home-highlights-stage"
          role={hasSlides ? "region" : undefined}
          aria-roledescription={hasSlides ? "карусель" : undefined}
          aria-label={hasSlides ? "Статті блогу PartsON" : undefined}
          onKeyDown={(event) => {
            if (!hasSlides) return;
            if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
              event.preventDefault();
              select(selectedIndex + (event.key === "ArrowRight" ? 1 : -1));
            }
          }}
        >
          {pendingSlide && (
            <Image
              key={`${pendingSlide.id}:${pendingSlide.image}`}
              src={pendingSlide.image} alt="" fill aria-hidden="true"
              unoptimized={isPreparedCover(pendingSlide.image)}
              sizes="(max-width: 767px) 100vw, 57vw"
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
                    unoptimized={isPreparedCover(item.image)}
                    fetchPriority={!outgoing && item.id === initialArticles[0]?.id ? "high" : "auto"}
                    sizes="(max-width: 767px) 100vw, 57vw"
                    preload={!outgoing && item.id === initialArticles[0]?.id}
                    loading={item.id === initialArticles[0]?.id && !outgoing ? undefined : outgoing ? "lazy" : "eager"}
                    className="home-highlight-cover"
                    onLoad={event => { event.currentTarget.dataset.loaded = "true"; }}
                  />}
                </div>
                <div className="home-highlight-copy">
                  <span className="home-highlight-eyebrow">
                    <BookOpen size={13} aria-hidden="true" />
                    Блог PartsON
                    {item.meta && item.meta !== "Блог PartsON" && <span className="home-highlight-eyebrow-meta">{item.meta}</span>}
                  </span>
                  <h3>{item.title}</h3>
                  <p>{teaserOf(item.description)}</p>
                  <div className="home-highlight-actions">
                    <Link className="home-highlight-action" href={item.href} prefetch={false}><span>{item.action}</span><ArrowUpRight size={18} aria-hidden="true" /></Link>
                    {item.href !== "/blog" && (
                      <Link className="home-highlight-blog-link" href="/blog" prefetch={false}>Усі статті<ArrowRight size={14} aria-hidden="true" /></Link>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
          {hasSlides && <div className="home-highlights-controls">
            <span aria-hidden="true">{selectedIndex + 1}<span> / {items.length}</span></span>
            <button type="button" aria-label="Попередня стаття" onClick={() => select(selectedIndex - 1)}><ChevronLeft size={18} aria-hidden="true" /></button>
            <button type="button" aria-label="Наступна стаття" onClick={() => select(selectedIndex + 1)}><ChevronRight size={18} aria-hidden="true" /></button>
          </div>}
          {hasSlides && <p className="home-highlights-announcement" aria-live="polite" aria-atomic="true">{announcement}</p>}
        </div>

        {service && (
          <Link className="home-highlight-service" href={service.href} prefetch={false}>
            <span className="home-highlight-service-media" aria-hidden="true">
              <Image src={service.image} alt="" fill sizes="(max-width: 767px) 38vw, 44vw" className="home-highlight-service-cover" />
            </span>
            <span className="home-highlight-service-card">
              <span className="home-highlight-eyebrow">
                <Gauge size={13} aria-hidden="true" />
                Послуга в PartsON
              </span>
              <span className="home-highlight-service-title">{service.title}</span>
              {service.meta && <span className="home-highlight-service-meta">{service.meta}</span>}
              <span className="home-highlight-service-cta">
                {service.action}
                <ArrowUpRight size={18} aria-hidden="true" />
              </span>
            </span>
          </Link>
        )}

        <svg className="home-highlights-outline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id="home-highlights-outline-base-gradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#5eead4" stopOpacity=".25" />
              <stop offset=".3" stopColor="#5eead4" stopOpacity=".8" />
              <stop offset=".7" stopColor="#7dd3fc" stopOpacity=".8" />
              <stop offset="1" stopColor="#7dd3fc" stopOpacity=".25" />
            </linearGradient>
            <linearGradient id="home-highlights-outline-gradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ccfff7" />
              <stop offset=".5" stopColor="#67e8f9" />
              <stop offset="1" stopColor="#ccfff7" />
            </linearGradient>
          </defs>
          <rect className="home-highlights-outline-base" x="0" y="0" width="100" height="100" />
          <rect className="home-highlights-outline-glow" x="0" y="0" width="100" height="100" />
          <rect className="home-highlights-outline-trace" x="0" y="0" width="100" height="100" />
        </svg>
      </div>
    </section>
  );
}
