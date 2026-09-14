"use client";

import { useEffect, useRef } from "react";

import {
  getCenteredParallaxProgress,
  registerParallax,
} from "app/lib/parallax-controller";

// Atmospheric layer behind the category browser: catalog product photos with
// the studio background cut out (public/Parts/cutout/*), so only the bare
// part floats on the light panel. Each drifts / rotates / zooms a little as
// the section scrolls through the viewport.
//
// The scroll math runs through the shared parallax controller (one scroll
// listener + one rAF for the whole page, geometry measured off the hot path,
// frame-rate-independent easing, IntersectionObserver-gated so it does zero
// work while the section is off screen).
//
// Rendered as background-image divs with a locked aspect-ratio (no stretch);
// photos are only fetched once the section nears the viewport. aria-hidden /
// pointer-events-none, and all motion is skipped under prefers-reduced-motion.

type Part = {
  src: string;
  ratio: number; // width / height, so the box can never distort the photo
  className: string; // corner position + responsive width (mobile-first)
  drift: number; // px of vertical travel across the section's scroll (desktop)
  rot: number; // resting rotation, deg
  rotDrift: number; // extra rotation swung across the scroll, deg
  zoom: number; // growth from when the part enters to when it leaves
  opacity: number;
  // horizontal-centre this layer (pair with `left-1/2` in className); the
  // -50% X shift is baked into the transform so the parallax doesn't drop it
  cx?: boolean;
};

// On phones only two opposite-edge parts move (see the effect below); the
// remaining pieces stay as stable depth anchors. Everything is smaller and
// pulled toward the edges, with a light opacity bump in globals.css.
const MOBILE_MAX_WIDTH = 640;
const MOBILE_MOTION_FACTOR = 0.5;

// Signature parallax — an ORBITAL TUMBLE: rotation is the lead motion (each
// part slowly spins as the section passes) with only a light vertical drift and
// a grow-on-entry. Unlike the depth push of the car-picker, the lateral spread
// of the manufacturers, or the centre swell of the SEO photos.
const ROT_GAIN = 1.9;
const DRIFT_DAMP = 0.52;
const ZOOM_DAMP = 0.82;

// An even, non-overlapping scatter: three parts down the left edge, three down
// the right, brake pads centred at the bottom. Each sits on its own vertical
// band so no two share a row on the same side, at any breakpoint. Mobile keeps
// the layout, just smaller and pulled further off the edges.
const PARTS: Part[] = [
  // ---- LEFT EDGE, top → bottom ---------------------------------------
  {
    // cabin filter
    src: "/Parts/cutout/filtr.webp",
    ratio: 1414 / 926,
    className:
      "top-[2%] left-[-16%] w-[34vw] max-w-[116px] sm:top-[3%] sm:left-[-4%] sm:w-[14vw] sm:max-w-[185px]",
    drift: -44,
    rot: 8,
    rotDrift: 2,
    zoom: 0.07,
    opacity: 0.09,
  },
  {
    // shock absorber — tall
    src: "/Parts/cutout/amort.webp",
    ratio: 1229 / 1061,
    className:
      "top-[26%] left-[-15%] w-[32vw] max-w-[104px] min-w-[78px] sm:top-[28%] sm:left-[-6%] sm:w-[16vw] sm:max-w-[185px] sm:min-w-[120px]",
    drift: 50,
    rot: 11,
    rotDrift: -2.5,
    zoom: 0.07,
    opacity: 0.11,
  },
  {
    // engine mount — deepest / slowest layer
    src: "/Parts/cutout/podush.webp",
    ratio: 1419 / 1153,
    className:
      "top-[60%] left-[-14%] w-[30vw] max-w-[102px] min-w-[74px] lg:top-[58%] lg:left-[-3%] lg:w-[17vw] lg:max-w-[220px] lg:min-w-[150px]",
    drift: -24,
    rot: -8,
    rotDrift: 1.5,
    zoom: 0.05,
    opacity: 0.09,
  },
  // ---- RIGHT EDGE, top → bottom -------------------------------------
  {
    // timing-belt kit — the wide piece
    src: "/Parts/cutout/grm.webp",
    ratio: 1461 / 873,
    className:
      "-top-[2%] right-[-20%] w-[52vw] max-w-[200px] sm:-top-[6%] sm:right-[-8%] sm:w-[34vw] sm:max-w-[400px] sm:min-w-[240px]",
    drift: -66,
    rot: -6,
    rotDrift: 2,
    zoom: 0.07,
    opacity: 0.11,
  },
  {
    // oil filter — compact, round
    src: "/Parts/cutout/masl.webp",
    ratio: 1003 / 868,
    className:
      "top-[42%] right-[-11%] w-[26vw] max-w-[92px] sm:top-[47%] sm:right-[-1%] sm:w-[11vw] sm:max-w-[148px]",
    drift: 42,
    rot: -9,
    rotDrift: 3,
    zoom: 0.08,
    opacity: 0.1,
  },
  {
    // tie-rod end
    src: "/Parts/cutout/nakon.webp",
    ratio: 1325 / 906,
    className:
      "bottom-[13%] right-[-14%] w-[38vw] max-w-[128px] sm:bottom-[-5%] sm:right-[1%] sm:w-[25vw] sm:max-w-[320px] sm:min-w-[190px]",
    drift: 54,
    rot: 7,
    rotDrift: 2.5,
    zoom: 0.06,
    opacity: 0.1,
  },
  // ---- BOTTOM CENTRE ----------------------------------------------
  {
    // brake pads — fills the empty band under the grid
    src: "/Parts/cutout/kol.webp",
    ratio: 567 / 382,
    className:
      "bottom-[1%] left-1/2 w-[42vw] max-w-[146px] min-w-[120px] sm:bottom-[-4%] sm:w-[23vw] sm:max-w-[250px] sm:min-w-[160px]",
    drift: 60,
    rot: 6,
    rotDrift: -2.5,
    zoom: 0.06,
    opacity: 0.09,
    cx: true,
  },
];

export default function TovarPartsBackdrop() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const section = root?.closest("section");
    if (!root || !section) return;

    const nodes = Array.from(
      root.querySelectorAll<HTMLElement>("[data-drift]")
    );
    const showImages = () => {
      for (const el of nodes) {
        if (el.dataset.src) el.style.backgroundImage = `url(${el.dataset.src})`;
      }
    };
    // Fetch the cut-out photos only once the section is near the viewport so
    // they never compete with the hero image / LCP on load. Used by every
    // path below.
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

    // Start fetching before motion is activated. Decoding a group of WebPs on
    // the same frame that the first transform is applied causes a visible
    // one-off hitch on mid-range devices.
    const stopImagePreload = lazyLoadImages();

    // Reduced motion → parts sit at rest, only the images are loaded.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return stopImagePreload;
    }

    type Plane = {
      el: HTMLElement;
      rot: number;
      tx: string;
      // motion coefficients folded with the mobile factor — refreshed on
      // resize only, never per frame
      driftM: number;
      rotDriftM: number;
      zoomM: number;
    };
    const allPlanes: Plane[] = nodes.map((el) => ({
      el,
      rot: Number(el.dataset.rot || 0),
      tx: el.dataset.cx ? "-50%" : "0",
      driftM: 0,
      rotDriftM: 0,
      zoomM: 0,
    }));

    let handle: ReturnType<typeof registerParallax> | null = null;
    let imagesLoaded = false;
    // Only animate the parts actually painted at this breakpoint; quantise the
    // progress so the easing filter's sub-pixel tail stops rewriting transforms.
    let planes: Plane[] = allPlanes;
    let lastStep = NaN;

    const recompute = () => {
      const isMobile = window.innerWidth <= MOBILE_MAX_WIDTH;
      const factor = isMobile ? MOBILE_MOTION_FACTOR : 1;
      planes = allPlanes.filter((p, index) => {
        // Two opposite-edge parts keep the orbital tumble visible on phones;
        // the other five remain stable depth anchors.
        if (isMobile ? index !== 0 && index !== 4 : index % 2 !== 0) return false;
        const r = p.el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      for (const p of planes) {
        const el = p.el;
        p.driftM = Number(el.dataset.drift || 0) * DRIFT_DAMP * factor;
        p.rotDriftM = Number(el.dataset.rotDrift || 0) * ROT_GAIN * factor;
        p.zoomM = Number(el.dataset.zoom || 0) * ZOOM_DAMP * factor;
      }
      lastStep = NaN;
    };

    const apply = (progress: number) => {
      const step = Math.round(progress * 320);
      if (step === lastStep) return;
      lastStep = step;
      const p = step / 320;
      const enter = (p + 1) / 2; // 0 entering → 1 leaving
      for (const plane of planes) {
        const y = Math.round(p * plane.driftM * 100) / 100;
        const r = Math.round((plane.rot + p * plane.rotDriftM) * 1000) / 1000;
        const s = Math.round((1 + enter * plane.zoomM) * 10000) / 10000;
        plane.el.style.transform = `translate3d(${plane.tx},${y}px,0) rotate(${r}deg) scale(${s})`;
      }
    };

    // The cut-out photos are only fetched once the section is near the
    // viewport, so they never compete with the hero image / LCP on load.
    const loadImages = () => {
      if (imagesLoaded) return;
      imagesLoaded = true;
      showImages();
    };

    let measuredWidth = window.innerWidth;
    const onResize = () => {
      if (window.innerWidth === measuredWidth) return;
      measuredWidth = window.innerWidth;
      recompute();
    };

    // Only run the effect while the section is anywhere near the viewport —
    // off-screen it leaves the shared loop and drops its compositor layers.
    const start = () => {
      if (handle) {
        handle.refresh();
        return;
      }
      recompute();
      for (const p of planes) p.el.style.willChange = "transform";
      window.addEventListener("resize", onResize, { passive: true });
      window.addEventListener("orientationchange", onResize);
      handle = registerParallax({
        el: section as HTMLElement,
        heavy: true,
        // -1 while the section sits just below the fold, 0 centred, +1 once it
        // has scrolled up past the top.
        compute: getCenteredParallaxProgress,
        apply,
      });
    };
    const stop = () => {
      if (!handle) return;
      handle.release();
      handle = null;
      for (const p of allPlanes) p.el.style.willChange = "";
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
      // Tight margin: the parallax only needs to be live while the section is
      // near the viewport. A wide margin kept it (and its compositor layers)
      // running at the same time as the car-picker's backdrop just above.
      { rootMargin: "150px 0px" }
    );
    io.observe(section);

    return () => {
      stopImagePreload();
      io.disconnect();
      stop();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      {PARTS.map((part) => (
        <div
          key={part.src}
          data-drift={part.drift}
          data-rot={part.rot}
          data-rot-drift={part.rotDrift}
          data-zoom={part.zoom}
          data-src={part.src}
          data-cx={part.cx ? "1" : undefined}
          style={{
            aspectRatio: String(part.ratio),
            ["--po" as string]: part.opacity,
            transform: `translate3d(${part.cx ? "-50%" : "0"}, 0, 0) rotate(${part.rot}deg)`,
          }}
          className={`tovar-part absolute bg-contain bg-center bg-no-repeat [filter:grayscale(0.22)] ${part.className}`}
        />
      ))}
      {/* gentle top wash so the heading / lead / search read cleanly, plus a
          soft edge vignette — tuned to the section's own light gradient */}
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(239,246,255,0.7)_0%,rgba(239,246,255,0.28)_26%,transparent_44%),radial-gradient(ellipse_125%_105%_at_50%_54%,transparent_0%,transparent_50%,rgba(236,248,251,0.5)_100%)]" />
    </div>
  );
}
