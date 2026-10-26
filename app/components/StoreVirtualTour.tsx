"use client";

import { ArrowUpRight, Compass } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Props = { embedUrl: string; tourUrl: string };

/** Load the panorama only near its reserved frame, independently of window.load. */
export default function StoreVirtualTour({ embedUrl, tourUrl }: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const startButtonRef = useRef<HTMLButtonElement>(null);

  const startTour = () => {
    setActive(true);
    setInteractive(true);
  };

  useEffect(() => {
    if (interactive && loaded) iframeRef.current?.focus();
  }, [interactive, loaded]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || active || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      setActive(true);
    }, { rootMargin: "900px 0px" });
    observer.observe(frame);
    return () => observer.disconnect();
  }, [active]);

  return (
    <section className={`home-store-tour${loaded ? " is-tour-loaded" : ""}${interactive ? " is-tour-interactive" : ""}`} aria-labelledby="store-tour-title">
      <div className="home-store-tour-heading">
        <div className="home-store-tour-title-group">
          <span className="home-store-tour-symbol" aria-hidden="true"><Compass size={27} strokeWidth={1.6} /></span>
          <div>
            <span className="home-store-tour-kicker">Віртуальна прогулянка</span>
            <h3 id="store-tour-title">PartsON у форматі 360°</h3>
            <p>Огляньте фасад і зайдіть усередину магазину в панорамі 360°.</p>
          </div>
        </div>
        <a href={tourUrl} target="_blank" rel="noreferrer">Відкрити в Google Maps<ArrowUpRight size={17} aria-hidden="true" /></a>
      </div>
      <div ref={frameRef} className="home-store-tour-frame" aria-busy={active && !loaded}>
        {/* eslint-disable-next-line @next/next/no-img-element -- 20KB local facade poster, independent of Google */}
        <img className="home-store-tour-poster" src="/storefront/photos/bg/store-1.webp" width="600" height="400" alt="Фасад магазину PartsON у Львові" loading="lazy" decoding="async" />
        {!loaded && <div className="home-store-tour-placeholder">
          {active ? <p role="status">Завантажуємо тур 360°…</p> : <button type="button" onClick={startTour}>Переглянути тур 360°</button>}
        </div>}
        {active && <iframe
          ref={iframeRef}
          src={embedUrl}
          tabIndex={interactive ? 0 : -1}
          style={{ pointerEvents: interactive ? "auto" : "none" }}
          title="Віртуальний тур 360° магазином автозапчастин PartsON у Львові"
          loading="eager"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => setLoaded(true)}
          className={loaded ? "is-loaded" : undefined}
        />}
        <div className="home-store-tour-lens" aria-hidden="true"><span /><span /><span /><span /></div>
        {loaded && !interactive && <button ref={startButtonRef} type="button" className="home-store-tour-start" onClick={startTour}><Compass size={19} aria-hidden="true" />Розпочати тур 360°</button>}
      </div>
      <div className="home-store-tour-footer">
        <p className="home-store-tour-hint">Обертайте панораму мишею або дотиком.</p>
        <button type="button" disabled={!interactive} aria-hidden={!interactive} style={{ visibility: interactive ? "visible" : "hidden" }} onClick={() => { setInteractive(false); window.requestAnimationFrame(() => startButtonRef.current?.focus()); }}>Завершити огляд</button>
      </div>
    </section>
  );
}
