"use client";

import { useEffect, useRef } from "react";

// Atmospheric layer behind the SEO / store section — real storefront photos as
// a parallax backdrop. Only five, generously spaced (two per edge + one off the
// bottom) so nothing ever overlaps, even at full drift.
//
// Signature parallax — a CENTRE-PEAK DOLLY: each photo swells to its largest
// exactly when the section is centred in the viewport and recedes as it leaves,
// like a slow camera push-in. Distinct from the other backdrops (which peak at
// the scroll extremes or tumble).

type Photo = {
  src: string;
  className: string;
  drift: number; // px of vertical travel across the transit
  rot: number; // resting rotation, deg
  rotDrift: number; // gentle rotation sway, deg
  swell: number; // extra scale at the moment the section is centred
  opacity: number;
  cx?: boolean;
};

const MOBILE_MAX_WIDTH = 640;
const MOBILE_MOTION_FACTOR = 0.5;
const RATIO = 660 / 440; // the generated backdrop webp's aspect (3:2)
const LIGHT_MOTION_FACTOR = 0.82;

const PHOTOS: Photo[] = [
  // ---- LEFT EDGE (two, well apart) ----------------------------------
  {
    src: "/storefront/photos/bg/store-1.webp",
    className:
      "top-[0%] left-[-14%] w-[62vw] max-w-[300px] sm:left-[-4%] sm:w-[32vw] sm:max-w-[450px]",
    drift: -58,
    rot: -5,
    rotDrift: 2.5,
    swell: 0.13,
    opacity: 0.22,
  },
  {
    src: "/storefront/photos/bg/store-6.webp",
    className:
      "bottom-[5%] left-[-14%] w-[60vw] max-w-[290px] sm:bottom-[4%] sm:left-[-4%] sm:w-[30vw] sm:max-w-[430px]",
    drift: 40,
    rot: -4,
    rotDrift: -2,
    swell: 0.1,
    opacity: 0.19,
  },
  // ---- RIGHT EDGE (two, well apart) --------------------------------
  {
    src: "/storefront/photos/bg/store-2.webp",
    className:
      "top-[9%] right-[-14%] w-[62vw] max-w-[296px] sm:right-[-4%] sm:w-[31vw] sm:max-w-[440px]",
    drift: -50,
    rot: 5,
    rotDrift: -2.5,
    swell: 0.12,
    opacity: 0.21,
  },
  {
    src: "/storefront/photos/bg/store-5.webp",
    className:
      "bottom-[7%] right-[-15%] w-[58vw] max-w-[280px] sm:bottom-[6%] sm:right-[-5%] sm:w-[29vw] sm:max-w-[410px]",
    drift: 44,
    rot: -6,
    rotDrift: 2,
    swell: 0.1,
    opacity: 0.18,
  },
  // ---- BOTTOM CENTRE (large, mostly below the fold of the section) -
  {
    src: "/storefront/photos/bg/store-3.webp",
    className:
      "bottom-[-16%] left-1/2 w-[74vw] max-w-[340px] sm:bottom-[-19%] sm:w-[38vw] sm:max-w-[500px]",
    drift: 34,
    rot: -3,
    rotDrift: 1.5,
    swell: 0.14,
    opacity: 0.15,
    cx: true,
  },
];

export default function SeoPhotosBackdrop() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const section = root?.closest("section");
    if (!root || !section) return;

    const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-drift]"));
    // A light teal→sky wash sits over the photo with `soft-light` blend — enough
    // to pull it toward the section's palette while keeping the shot sharp and
    // readable, so the seven photos read as a cohesive, still-legible backdrop.
    const TINT =
      "linear-gradient(145deg,rgba(11,84,110,0.34) 0%,rgba(30,64,175,0.26) 52%,rgba(20,184,166,0.28) 100%)";
    const showImages = () => {
      for (const el of nodes) {
        if (el.dataset.src) {
          el.style.backgroundImage = `${TINT}, url(${el.dataset.src})`;
        }
      }
    };
    const lazyLoadImages = () => {
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            showImages();
            io.disconnect();
          }
        },
        { rootMargin: "700px 0px" }
      );
      io.observe(section);
      return () => io.disconnect();
    };

    const stopImagePreload = lazyLoadImages();

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return stopImagePreload;
    }
    type Plane = {
      el: HTMLElement;
      rot: number;
      tx: string;
      driftM: number;
      rotDriftM: number;
      swellM: number;
    };
    const allPlanes: Plane[] = nodes.map((el) => ({
      el,
      rot: Number(el.dataset.rot || 0),
      tx: el.dataset.cx ? "-50%" : "0",
      driftM: 0,
      rotDriftM: 0,
      swellM: 0,
    }));

    let imagesLoaded = false;
    let planes: Plane[] = allPlanes;
    let lastStep = NaN;

    const recompute = () => {
      const isMobile = window.innerWidth <= MOBILE_MAX_WIDTH;
      const factor = isMobile ? MOBILE_MOTION_FACTOR : 1;
      planes = allPlanes.filter((p, index) => {
        // Keep the mobile dolly to two opposite corners. Five filtered,
        // full-photo layers moving together cost far more GPU memory while
        // adding little depth on a narrow viewport.
        if (isMobile ? index !== 0 && index !== 3 : index % 2 !== 0) return false;
        const r = p.el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      for (const p of planes) {
        const el = p.el;
        p.driftM = Number(el.dataset.drift || 0) * LIGHT_MOTION_FACTOR * factor;
        p.rotDriftM = Number(el.dataset.rotDrift || 0) * LIGHT_MOTION_FACTOR * factor;
        p.swellM = Number(el.dataset.swell || 0) * LIGHT_MOTION_FACTOR * factor;
      }
      lastStep = NaN;
    };

    const transformAt = (plane: Plane, p: number) => {
      // centre-peak: 1 when the section is dead-centre, 0 at the scroll extremes
      const centreClose = 1 - Math.abs(p);
      const y = Math.round(p * plane.driftM * 100) / 100;
      const r = Math.round((plane.rot + p * plane.rotDriftM) * 1000) / 1000;
      const s = Math.round((1 + centreClose * plane.swellM) * 10000) / 10000;
      return `translate(${plane.tx},${y}px) rotate(${r}deg) scale(${s})`;
    };

    const apply = (progress: number) => {
      const step = Math.round(progress * 1024);
      if (step === lastStep) return;
      lastStep = step;
      const p = step / 1024;
      for (const plane of planes) plane.el.style.transform = transformAt(plane, p);
    };

    const loadImages = () => {
      if (imagesLoaded) return;
      imagesLoaded = true;
      showImages();
    };

    // Compositor path where supported: the transforms are handed to a CSS
    // scroll-driven animation once and nothing runs on scroll. The shared JS
    // controller below remains the fallback.
    // Static composition, like /partnership: every plane sits at its centred
    // pose — the one seen mid-scroll — and nothing moves with the scroll.
    // Scroll-linked motion of these filtered, semi-transparent layers was
    // recomposited on every frame (and ran per-frame JS where scroll
    // timelines are unsupported), which is what made the homepage scroll lag.
    // Depth: each moving plane gets its own vertical travel (the per-plane
    // amplitude this backdrop was designed with); globals.css translates it
    // on the backdrop's scroll timeline — compositor only, set once here.
    const markDepth = () => {
      for (const p of allPlanes) {
        delete p.el.dataset.plxDrift;
        p.el.style.removeProperty("--plx-drift");
      }
      for (const p of planes) {
        if (!p.driftM) continue;
        p.el.style.setProperty("--plx-drift", `${p.driftM}px`);
        p.el.dataset.plxDrift = "";
      }
    };
    let staticOn = false;
    let measuredWidth = window.innerWidth;
    const onResize = () => {
      if (window.innerWidth === measuredWidth) return;
      measuredWidth = window.innerWidth;
      recompute();
      if (staticOn) {
        apply(0);
        markDepth();
      }
    };

    const start = () => {
      if (staticOn) return;
      staticOn = true;
      recompute();
      apply(0);
      markDepth();
      window.addEventListener("resize", onResize, { passive: true });
      window.addEventListener("orientationchange", onResize);
    };
    const stop = () => {
      staticOn = false;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          loadImages();
          start();
        } else {
          stop();
        }
      },
      { rootMargin: "200px 0px" }
    );
    io.observe(section);

    return () => {
      stopImagePreload();
      io.disconnect();
      stop();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className="home-backdrop pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      {PHOTOS.map((photo) => (
        <div
          key={photo.src}
          data-drift={photo.drift}
          data-rot={photo.rot}
          data-rot-drift={photo.rotDrift}
          data-swell={photo.swell}
          data-src={photo.src}
          data-cx={photo.cx ? "1" : undefined}
          style={{
            aspectRatio: String(RATIO),
            ["--po" as string]: photo.opacity,
            backgroundBlendMode: "soft-light",
            filter: "grayscale(0.28) contrast(1.1) brightness(1.03) saturate(1.06)",
            maskImage:
              "radial-gradient(ellipse 88% 88% at 50% 50%, #000 56%, transparent 100%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 88% 88% at 50% 50%, #000 56%, transparent 100%)",
            transform: `translate(${photo.cx ? "-50%" : "0"}, 0) rotate(${photo.rot}deg)`,
          }}
          className={`seo-photo absolute bg-cover bg-center bg-no-repeat ${photo.className}`}
        />
      ))}
      {/* soft central wash — keeps the header text clean while the enlarged
          photos stay clearly visible along the edges */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_92%_78%_at_50%_44%,rgba(236,245,248,0.66)_0%,rgba(236,245,248,0.2)_52%,rgba(236,245,248,0.02)_78%,transparent_100%)]" />
    </div>
  );
}
