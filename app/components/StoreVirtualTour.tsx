"use client";

import { ArrowUpRight, Compass, MapPin, MousePointer2, X } from "lucide-react";
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
      className={`home-store-tour font-ui relative isolate !my-10 !overflow-hidden !rounded-[28px] !bg-[linear-gradient(140deg,#0b2233_0%,#0d3346_48%,#0a4a55_100%)] p-2.5 !shadow-[0_1px_0_rgb(255_255_255/8%)_inset,0_30px_60px_-34px_rgb(6_40_60/85%)] ring-1 ring-[#5eead4]/15 sm:!my-14 sm:p-3${loaded ? " is-tour-loaded" : ""}${interactive ? " is-tour-interactive" : ""}`}
      aria-labelledby="store-tour-title"
    >
      {/* Light on the dark card: a teal glow behind the heading, a sky one
          at the far corner, a fine top hairline. */}
      <span aria-hidden="true" className="pointer-events-none absolute -left-24 -top-32 -z-10 h-[340px] w-[480px] rounded-full bg-[radial-gradient(circle,rgb(45_212_191/22%)_0%,transparent_68%)]" />
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-40 -right-24 -z-10 h-[380px] w-[520px] rounded-full bg-[radial-gradient(circle,rgb(56_189_248/16%)_0%,transparent_68%)]" />
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,transparent,rgb(94_234_212/55%),transparent)]" />
      <div className="flex flex-col gap-4 px-3 pb-5 pt-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-5 sm:pb-6 sm:pt-5">
        <div className="flex min-w-0 items-center gap-4">
          {/* The 360° mark: a ring with a gradient numeral. */}
          <span aria-hidden="true" className="relative grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white/[0.06] ring-1 ring-white/15 sm:h-16 sm:w-16">
            <span className="absolute inset-1 rounded-full border border-dashed border-[#5eead4]/40" />
            <span className="font-display bg-[linear-gradient(160deg,#99f6e4,#38bdf8)] bg-clip-text text-[17px] font-[800] tracking-[-.04em] text-transparent sm:text-[19px]">360°</span>
          </span>
          <div className="min-w-0">
            <p className="!m-0 text-[11px] font-bold uppercase tracking-[.16em] text-[#5eead4]">Віртуальний тур</p>
            <h3 id="store-tour-title" className="font-display font-display-readable !m-0 !mt-1 !text-[clamp(22px,1vw+17px,30px)] !font-[800] !leading-[1.1] !tracking-[-.025em] !text-white">
              PartsON у форматі <span className="text-[#5eead4]">360°</span>
            </h3>
            <p className="!m-0 !mt-1.5 text-[13.5px] font-medium leading-[1.5] text-[#b6d3dd] sm:text-[14.5px]">Огляньте фасад і зайдіть усередину магазину в панорамі 360°.</p>
          </div>
        </div>
        <a
          href={tourUrl}
          target="_blank"
          rel="noreferrer"
          className="group/maps inline-flex min-h-11 shrink-0 items-center gap-2 self-start rounded-full border border-white/15 bg-white/[0.07] px-4 text-[13px] font-bold text-white no-underline transition-[background-color,border-color] duration-200 hover:border-white/30 hover:bg-white/[0.13] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5eead4] sm:self-auto"
        >
          <MapPin size={16} aria-hidden="true" className="text-[#5eead4]" />
          Відкрити в Google Maps
          <ArrowUpRight size={16} aria-hidden="true" className="transition-transform duration-200 group-hover/maps:-translate-y-px group-hover/maps:translate-x-px" />
        </a>
      </div>
      <div ref={frameRef} className="home-store-tour-frame !h-[clamp(280px,46vw,500px)] overflow-hidden rounded-[20px] ring-1 ring-white/10" aria-busy={active && !loaded}>
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
      <div className="flex min-h-[52px] items-center justify-between gap-3 px-3 pb-1 pt-3 sm:px-5">
        <p className="!m-0 inline-flex items-center gap-2 text-[12.5px] font-medium text-[#9fc1cd] sm:text-[13px]"><MousePointer2 size={14} aria-hidden="true" className="text-[#5eead4]" />Обертайте панораму мишею або дотиком.</p>
        <button type="button" className="inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.08] px-4 text-[12.5px] font-bold text-white transition-colors duration-200 hover:bg-white/[0.15] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5eead4] [&[aria-hidden=true]]:hidden" disabled={!interactive} aria-hidden={!interactive} style={{ visibility: interactive ? "visible" : "hidden" }} onClick={() => { setInteractive(false); window.requestAnimationFrame(() => startButtonRef.current?.focus()); }}><X size={14} aria-hidden="true" />Завершити огляд</button>
      </div>
    </section>
  );
}
