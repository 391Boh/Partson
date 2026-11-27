"use client";

import Image from "next/image";
import BlogCoverImage from "./BlogCoverImage";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { HOME_BLOG_OVERVIEW, type HomeHighlight } from "app/lib/home-highlights";
import { getBlogEditorialImageBySrc } from "app/lib/blog-editorial-images";
import { revealHomeImage } from "app/lib/home-image-reveal";

// Keep complete sentences in the compact excerpt before the responsive clamp.
const TEASER_MAX_CHARS = 120;
const FIRST_ROTATE_MS = 9000;
const ROTATE_MS = 6000;
const ARTICLE_COVER_SIZES = "(max-width: 767px) 100vw, 57vw";
const VISUALLY_HIDDEN = {
  position: "absolute", width: 1, height: 1, padding: 0, margin: -1,
  overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0,
} as const;
// Only local editorial compositions are used as the article background.
const backgroundOf = (item: HomeHighlight) =>
  item.image.startsWith("/images/blog/editorial-v1/") ? item.image : HOME_BLOG_OVERVIEW.image;
// Titles read as "subject: question" — the second half takes the mint accent.
// A service title without one accents its trailing place ("… у Львові").
const accentTitle = (title: string) => {
  const split = title.match(/^(.+?)(:|\s[—–-])\s+(.+)$/u);
  if (split) return <>{split[1]}{split[2]} <span className="home-highlight-accent">{split[3]}</span></>;
  const place = title.match(/^(.+)\s(у\s\S+)$/u);
  if (place) return <>{place[1]} <span className="home-highlight-accent">{place[2]}</span></>;
  return title;
};
type Selection = { current: HomeHighlight; previous: HomeHighlight | null; dir: 1 | -1 };
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

export default function HomeHighlightsSlider({ services, initialArticles = [], serverResolved = false, pending = false }: { services: HomeHighlight[]; initialArticles?: HomeHighlight[]; serverResolved?: boolean; pending?: boolean }) {
  const [articles, setArticles] = useState<HomeHighlight[]>(() => initialArticles.length ? initialArticles : [HOME_BLOG_OVERVIEW]);
  const [selection, setSelection] = useState<Selection>(() => ({ current: initialArticles[0] ?? HOME_BLOG_OVERVIEW, previous: null, dir: 1 }));
  const [inView, setInView] = useState(false);
  const [playbackAllowed, setPlaybackAllowed] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const sectionRef = useRef<HTMLElement>(null);
  const hydratedAt = useRef<number | null>(null);
  useEffect(() => { hydratedAt.current = performance.now(); }, []);
  const revealPhoto = (event: React.SyntheticEvent<HTMLImageElement>) => {
    revealHomeImage(event.currentTarget, hydratedAt.current);
  };
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

  // Only local editorial backgrounds are used here: switching never waits for
  // a database-backed cover or a cold image transform.
  useEffect(() => {
    if (!previous) return;
    const timer = window.setTimeout(() => {
      setSelection(current => current === selection ? { ...current, previous: null } : current);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [previous, selection]);
  const rotating = inView && playbackAllowed && hasSlides;

  useEffect(() => {
    // The server and this endpoint share the same 10-minute cache. Fetch
    // only to recover an empty server result, rather than repeat that read
    // two seconds into every successful page load.
    if (!serverResolved || initialArticles.length) return;
    const controller = new AbortController();
    // Recover a failed/empty server preview after hydration; successful
    // server content stays usable without another network round trip.
    const refresh = () => { void fetch("/api/home-blog?view=all", { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then((payload: { items?: HomeHighlight[] } | null) => {
        if (!controller.signal.aborted && payload?.items?.length) {
          setArticles(payload.items);
          const next = payload.items.find(item => item.id === selectedRef.current.id) ?? payload.items[0];
          const current = selectedRef.current;
          if (JSON.stringify(current) !== JSON.stringify(next)) {
            setSelection({ current: next, previous: null, dir: 1 });
          }
        }
      })
      .catch(() => {}); };
    const timer = window.setTimeout(refresh, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [serverResolved, initialArticles.length]);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    const syncVisibility = () => setPlaybackAllowed(
      !document.hidden && !motion.matches && !connection?.saveData &&
      !["slow-2g", "2g", "3g"].includes(connection?.effectiveType ?? ""),
    );
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    motion.addEventListener("change", syncVisibility);
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: .25 });
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", syncVisibility);
      motion.removeEventListener("change", syncVisibility);
    };
  }, []);

  // The first article stays longer (the visitor is still reading the page
  // as it opens); then the articles rotate every 6 s. The dot's fill uses
  // the same interval (--dot-interval).
  const [hasRotated, setHasRotated] = useState(false);
  const interval = hasRotated ? ROTATE_MS : FIRST_ROTATE_MS;
  useEffect(() => {
    if (!rotating || !selected) return;
    const timer = window.setTimeout(() => {
      setHasRotated(true);
      setSelection({ current: items[(selectedIndex + 1) % items.length], previous: selected, dir: 1 });
    }, interval);
    return () => window.clearTimeout(timer);
  }, [rotating, selected, selectedIndex, items, interval]);

  // Warm both neighbours' backgrounds so the reveal never uncovers an
  // undecoded image. Static, immutable files: one request each per visit.
  useEffect(() => {
    if (!hasSlides || !inView || !playbackAllowed) return;
    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    if (connection?.saveData || ["slow-2g", "2g", "3g"].includes(connection?.effectiveType ?? "")) return;
    for (const step of [1, -1]) {
      const image = new window.Image();
      image.decoding = "async";
      image.fetchPriority = "low";
      const src = backgroundOf(items[(selectedIndex + step + items.length) % items.length]);
      const editorial = getBlogEditorialImageBySrc(src);
      if (editorial) {
        image.sizes = ARTICLE_COVER_SIZES;
        image.srcset = editorial.srcSet;
      }
      image.src = src;
    }
  }, [hasSlides, inView, playbackAllowed, selectedIndex, items]);

  // Keep the promo's footprint stable. Scroll-driven height, typography and
  // padding invalidated layout for every section below it on every frame.

  const select = (index: number) => {
    if (!items.length) return;
    const next = items[(index + items.length) % items.length];
    if (next.id === selected.id) return;
    setHasRotated(true);
    setSelection({ current: next, previous: selected, dir: index < selectedIndex ? -1 : 1 });
    setAnnouncement(next.title);
  };

  if (!selected) return null;

  return (
    <section ref={sectionRef} data-server-resolved={serverResolved || undefined} className="home-highlights font-ui" aria-labelledby="home-highlights-title">
      {/* Slides carry h3 titles; this keeps the outline h1 → h2 → h3.
          Hidden inline: .sr-only is not in the homepage's critical CSS. */}
      <h2 id="home-highlights-title" style={VISUALLY_HIDDEN}>Статті та послуги PartsON</h2>
      <div className={`home-highlights-player home-highlights-split${hasSlides ? "" : " is-static"}${service ? "" : " is-single"}`}>
        <div
          className="home-highlights-stage"
          data-dir={selection.dir < 0 ? "prev" : "next"}
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
          <div className="home-highlight-image" aria-hidden="true">
            {/* The outgoing photo stays underneath while the new one
                materialises over it behind a sweeping light band. */}
            {!pending && Array.from(new Set([...(previous ? [backgroundOf(previous)] : []), backgroundOf(selected)])).map((src, index, all) => (
              <BlogCoverImage
                key={src} src={src} alt="" fill unoptimized
                sizes={ARTICLE_COVER_SIZES} loading="eager" fetchPriority="low"
                className={`home-highlight-cover${all.length > 1 && index === all.length - 1 ? " is-materializing" : ""}`}
                onLoad={revealPhoto}
              />
            ))}
            {previous && <span key={`sweep:${selected.id}`} className="home-highlight-sweep" />}
          </div>
          {[...(previous ? [previous] : []), selected].map((item) => {
            const outgoing = item !== selected;
            return (
              <article
                key={`${item.id}:${item.image}`}
                role={hasSlides ? "group" : undefined}
                aria-roledescription={hasSlides ? "слайд" : undefined}
                aria-label={hasSlides ? `${Math.max(0, items.findIndex(slide => slide.id === item.id)) + 1} з ${items.length}: ${item.title}` : undefined}
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
                <div className="home-highlight-copy">
                  <h3>{accentTitle(item.title)}</h3>
                  <span className="home-highlight-meta"><Clock3 size={14} aria-hidden="true" />{item.meta}</span>
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
          {/* One dot per article; the current one is a pill that fills over
              the autoplay interval. Keyboard arrows (stage handler) and
              swipes still step through the articles. */}
          {hasSlides && <div className={`home-highlights-dots${rotating ? " is-playing" : ""}`} role="group" aria-label="Вибір статті" style={{ "--dot-interval": `${interval}ms` } as CSSProperties}>
            <button type="button" className="home-highlights-arrow" aria-label="Попередня стаття" onClick={() => select(selectedIndex - 1)}>
              <ChevronLeft size={18} strokeWidth={2.4} aria-hidden="true" />
            </button>
            {items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                aria-label={`Стаття ${index + 1} з ${items.length}: ${item.title}`}
                aria-current={index === selectedIndex ? "true" : undefined}
                onClick={() => select(index)}
              >
                <span key={index === selectedIndex ? `on:${selected.id}` : "off"} />
              </button>
            ))}
            <button type="button" className="home-highlights-arrow" aria-label="Наступна стаття" onClick={() => select(selectedIndex + 1)}>
              <ChevronRight size={18} strokeWidth={2.4} aria-hidden="true" />
            </button>
          </div>}
          {hasSlides && <p className="home-highlights-announcement" aria-live="polite" aria-atomic="true">{announcement}</p>}
        </div>

        {service && (
          <Link className="home-highlight-service" href={service.href} prefetch={false}>
            <span className="home-highlight-service-media" aria-hidden="true">
              <Image
                src={service.image}
                alt="" fill unoptimized sizes="(max-width: 767px) 100vw, 43vw"
                loading="lazy" fetchPriority="low" className="home-highlight-service-cover"
                onLoad={revealPhoto}
              />
            </span>
            <span className="home-highlight-service-card">
              <span className="home-highlight-service-title">{accentTitle(service.title)}</span>
              {service.meta && (
                <span className="home-highlight-service-meta">
                  {service.meta.split(/\s*,\s*/u).filter(Boolean).map((tag, index, tags) => (
                    <span key={tag}>{tag}{index < tags.length - 1 && <span style={VISUALLY_HIDDEN}>, </span>}</span>
                  ))}
                </span>
              )}
              <span className="home-highlight-service-cta">
                {service.action}
                <ArrowUpRight size={18} aria-hidden="true" />
              </span>
            </span>
          </Link>
        )}
      </div>
    </section>
  );
}
