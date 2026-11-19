"use client";

import { ArrowUpRight, Compass, MousePointer2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { preconnect } from "react-dom";

import { whenScrollSettles } from "app/lib/when-scroll-settles";

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
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    const conserveData = connection?.saveData || ["slow-2g", "2g"].includes(connection?.effectiveType ?? "");
    // Establish the TLS connection while approaching, without fetching the
    // panorama or competing with the first-screen assets.
    const warmObserver = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      warmObserver.disconnect();
      if (!conserveData) {
        preconnect(new URL(embedUrl).origin);
        preconnect("https://maps.gstatic.com", { crossOrigin: "anonymous" });
      }
    }, { rootMargin: "1800px 0px" });
    warmObserver.observe(frame);
    // The panorama's scripts stall a scroll that merely passes by. The poster
    // holds the frame until it is on screen and the page has come to rest.
    let cancelSettle: (() => void) | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      cancelSettle?.();
      if (!entry.isIntersecting) return;
      cancelSettle = whenScrollSettles(() => {
        observer.disconnect();
        setActive(true);
      });
    }, { threshold: 0.1 });
    observer.observe(frame);
    return () => { observer.disconnect(); warmObserver.disconnect(); cancelSettle?.(); };
  }, [active, embedUrl]);

  return (
    <section
      className={`home-store-tour relative flex min-w-0 flex-col !overflow-hidden !rounded-[20px] !bg-white/[0.04] !shadow-none ring-1 ring-white/10${loaded ? " is-tour-loaded" : ""}${interactive ? " is-tour-interactive" : ""}`}
      aria-label="Віртуальний тур 360° магазином PartsON"
    >
      <div ref={frameRef} className="home-store-tour-frame !h-[clamp(260px,52vw,420px)] overflow-hidden rounded-[20px] lg:!h-auto lg:min-h-[380px] lg:flex-1" aria-busy={active && !loaded}>
        {!interactive && <span className="pointer-events-none absolute left-3 top-3 z-[2] inline-flex items-center gap-1.5 rounded-full bg-[#0b2233]/70 px-3 py-1.5 text-[12px] font-bold text-white ring-1 ring-white/15 backdrop-blur-md"><span className="text-[#5eead4]">360°</span>Тур магазином</span>}
        {/* eslint-disable-next-line @next/next/no-img-element -- 20KB local facade poster, independent of Google */}
        <img className="home-store-tour-poster" src="/storefront/photos/bg/store-1.webp" width="600" height="400" alt="Фасад магазину PartsON у Львові" loading="lazy" decoding="async" />
        {interactive && !loaded && <div className="home-store-tour-placeholder">
          <p role="status">Завантажуємо тур 360°…</p>
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
        <div className="home-store-tour-lens" aria-hidden="true" />
        {!interactive && <button ref={startButtonRef} type="button" className="group/start absolute left-1/2 top-1/2 z-[2] inline-flex min-h-[58px] -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center gap-3 whitespace-nowrap rounded-full border border-white/70 bg-white/90 py-2 pl-2 pr-6 text-[15px] font-extrabold text-[#0b2233] shadow-[0_0_0_8px_rgb(255_255_255/16%),0_22px_40px_-18px_rgb(4_30_45/80%)] backdrop-blur-md transition-[transform,box-shadow,background-color] duration-300 ease-[cubic-bezier(.16,1,.3,1)] hover:scale-[1.03] hover:bg-white hover:shadow-[0_0_0_12px_rgb(255_255_255/20%),0_26px_44px_-18px_rgb(4_30_45/85%)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#5eead4] motion-reduce:transition-none motion-reduce:hover:scale-100 sm:text-[16px]" onPointerEnter={() => setActive(true)} onFocus={() => setActive(true)} onClick={startTour}><span className="grid h-[42px] w-[42px] place-items-center rounded-full bg-[linear-gradient(140deg,#0d9488,#0e7490)] text-white transition-transform duration-500 ease-[cubic-bezier(.16,1,.3,1)] group-hover/start:rotate-45 motion-reduce:transition-none"><Compass size={21} aria-hidden="true" /></span>Розпочати тур 360°</button>}
      </div>
      <div className="flex min-h-[52px] items-center justify-between gap-3 px-4 py-2.5">
        <p className="!m-0 inline-flex items-center gap-2 text-[12.5px] font-medium text-[#9fc1cd] sm:text-[13px]"><MousePointer2 size={14} aria-hidden="true" className="text-[#5eead4]" />Обертайте панораму мишею або дотиком.</p>
        <button type="button" className="inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.08] px-4 text-[12.5px] font-bold text-white transition-colors duration-200 hover:bg-white/[0.15] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5eead4] [&[aria-hidden=true]]:hidden" disabled={!interactive} aria-hidden={!interactive} style={{ visibility: interactive ? "visible" : "hidden" }} onClick={() => { setInteractive(false); window.requestAnimationFrame(() => startButtonRef.current?.focus()); }}><X size={14} aria-hidden="true" />Завершити огляд</button>
        {!interactive && <a href={tourUrl} target="_blank" rel="noreferrer" className="group/maps inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-2 text-[12.5px] font-bold text-white/90 no-underline transition-colors hover:text-[#5eead4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5eead4]">Google Maps<ArrowUpRight size={15} aria-hidden="true" className="transition-transform duration-200 group-hover/maps:-translate-y-px group-hover/maps:translate-x-px" /></a>}
      </div>
    </section>
  );
}
