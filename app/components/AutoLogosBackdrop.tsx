"use client";

import { useEffect, useRef } from "react";

import { registerParallax } from "app/lib/parallax-controller";

// Atmospheric layer behind the car-picker. Each brand mark is a
// gradient-filled silhouette — the SVG is a CSS `mask`, the shape is filled
// with a chrome ramp, so it always reads as one clean, lightly polished
// colour regardless of the logo's own palette.
//
// Signature parallax — a DEPTH PUSH: `depth` 0 = far, 1 = near, keyed to a
// focal plane. Near marks rush toward the viewer (grow) as the section scrolls
// past, far marks recede, focal-plane marks hold at 1 — real 3-D layering, not
// one flat sheet sliding. Unlike the lateral spread of the manufacturers
// backdrop, the tumble of the categories one, or the centre swell of the SEO
// photos. Runs on the shared parallax controller (one scroll listener + one
// rAF for the whole page, IO-gated). Skipped for reduced motion.

type Layer = {
  src: string;
  ratio: number; // width / height so the box never distorts the mark
  tint: string; // background gradient the silhouette is cut from
  className: string; // position + responsive width (mobile-first)
  depth: number; // 0 far … 1 near — drives drift, rotation and scale
  dir: 1 | -1; // drift direction (top band up, bottom band down)
  rot: number; // resting rotation, deg
  opacity: number;
  cx?: boolean; // horizontal-centre (pair with `left-1/2`)
};

const MOBILE_MAX_WIDTH = 640;
const MOBILE_MOTION_FACTOR = 0.5;
// Per-plane motion across the section's transit. Marks in the top band drift
// up, the bottom band drifts down — the field opens outward on scroll and
// nothing collides.
const MAX_DRIFT = 82;
const MAX_ROT_SWING = 4;
// Scale is keyed to depth relative to a focal plane: marks nearer than
// FOCAL_PLANE grow as the section scrolls past (rush toward the viewer),
// marks farther than it recede, and marks on the focal plane hold at 1.
const FOCAL_PLANE = 0.4;
const SCALE_GAIN = 0.27;

// Chrome-style ramps: a bright specular band through the middle so each
// silhouette reads as a lightly polished metal cut-out, not a flat fill.
const BLUE =
  "linear-gradient(135deg,#173a8f 0%,#3f7fe6 30%,#bfe1ff 50%,#3f7fe0 62%,#1a4aa8 100%)";
const DEEP =
  "linear-gradient(140deg,#0f1f4a 0%,#25408a 30%,#6d92e0 50%,#233a80 64%,#101f46 100%)";
const STEEL =
  "linear-gradient(135deg,#2b3648 0%,#5a6a83 30%,#b3bfd0 50%,#54627b 64%,#2b3648 100%)";
const CYAN =
  "linear-gradient(135deg,#0b5f7e 0%,#12a0d6 32%,#aeeefc 50%,#12a0d6 64%,#0b5f7e 100%)";

// Laid out as a loose grid with real gaps. `dir` is -1 for everything in the
// top band and +1 for the bottom band, so on scroll the whole field breathes
// outward from the centre and marks never drift into one another.
// Laid out as an even scatter that never overlaps at any breakpoint: five
// marks hug the left edge, five hug the right, one (Mazda) is centred at the
// bottom. Each is on its own vertical band so no two marks share a row on the
// same side. Mobile keeps the same scatter, just smaller and pulled further
// off the edges so the single-column copy stays clear.
const LAYERS: Layer[] = [
  // ---- LEFT EDGE, top → bottom ----------------------------------------
  {
    src: "/Carlogo/KIA.svg",
    ratio: 1,
    tint: BLUE,
    className:
      "top-[2%] left-[-3%] w-[15vw] max-w-[54px] sm:top-[4%] sm:left-[2%] sm:w-[10vw] sm:max-w-[104px]",
    depth: 0.42,
    dir: -1,
    rot: -7,
    opacity: 0.2,
  },
  {
    src: "/Carlogo/Mitsubishi.svg",
    ratio: 1,
    tint: STEEL,
    className:
      "top-[16%] left-[-4%] w-[12vw] max-w-[44px] sm:top-[7%] sm:left-[27%] sm:w-[8vw] sm:max-w-[90px]",
    depth: 0.55,
    dir: -1,
    rot: 6,
    opacity: 0.17,
  },
  {
    src: "/Carlogo/Chevrolet.svg",
    ratio: 4115 / 2156,
    tint: STEEL,
    className:
      "top-[30%] left-[-14%] w-[34vw] max-w-[116px] sm:top-[27%] sm:left-[-6%] sm:w-[12vw] sm:max-w-[176px]",
    depth: 0.48,
    dir: -1,
    rot: 4,
    opacity: 0.17,
  },
  {
    src: "/Carlogo/Peugeot.svg",
    ratio: 390 / 290.4,
    tint: STEEL,
    className:
      "top-[48%] left-[-7%] w-[13vw] max-w-[50px] lg:top-[60%] lg:left-[3%] lg:w-[9vw] lg:max-w-[106px]",
    depth: 0.28,
    dir: -1,
    rot: -6,
    opacity: 0.14,
  },
  {
    // far anchor — wide faint wordmark, barely moves
    src: "/Carlogo/Volvo.svg",
    ratio: 800 / 110.066,
    tint: DEEP,
    className:
      "bottom-[22%] left-[-22%] w-[46vw] max-w-[150px] sm:bottom-[-11%] sm:left-[-9%] sm:w-[38vw] sm:max-w-[520px]",
    depth: 0.12,
    dir: 1,
    rot: -3,
    opacity: 0.12,
  },
  // ---- RIGHT EDGE, top → bottom --------------------------------------
  {
    // wide GEELY wordmark, mostly off the right edge
    src: "/Carlogo/Geely.svg",
    ratio: 150.81 / 24.973,
    tint: BLUE,
    className:
      "top-[7%] right-[-16%] w-[42vw] max-w-[148px] sm:top-[4%] sm:right-[-3%] sm:w-[23vw] sm:max-w-[290px]",
    depth: 0.92,
    dir: -1,
    rot: -5,
    opacity: 0.18,
  },
  {
    // leaping-jaguar silhouette — a distinctive positive-space shape, so it
    // never reads as a box (Daewoo's SVG was a knocked-out rectangle; Ford's
    // was a plain oval). Right edge on mobile, centred up top on desktop.
    src: "/Carlogo/Jaguar.svg",
    ratio: 1,
    tint: BLUE,
    className:
      "top-[19%] right-[-4%] w-[13vw] max-w-[46px] lg:top-[-4%] lg:right-auto lg:left-[40%] lg:w-[11vw] lg:max-w-[112px]",
    depth: 0.62,
    dir: -1,
    rot: -4,
    opacity: 0.13,
  },
  {
    src: "/Carlogo/Renault.svg",
    ratio: 500 / 437.523,
    tint: STEEL,
    className:
      "top-[37%] right-[-9%] w-[16vw] max-w-[64px] sm:top-[38%] sm:right-[-3%] sm:w-[12vw] sm:max-w-[118px]",
    depth: 0.66,
    dir: -1,
    rot: -8,
    opacity: 0.18,
  },
  {
    // bold angular "S" — reads as a mark, not a ring. Pulled up (was 58%/
    // 66%) and slightly smaller — DAF right below it sits at depth 0.9, so
    // it grows a lot as the section scrolls past (near marks rush toward
    // the viewer); the old resting gap was only enough at rest and closed
    // into an overlap once DAF scaled up mid-scroll.
    src: "/Carlogo/Suzuki.svg",
    ratio: 1,
    tint: CYAN,
    className:
      "top-[52%] right-[-10%] w-[13vw] max-w-[52px] sm:top-[58%] sm:right-[-6%] sm:w-[10vw] sm:max-w-[104px]",
    depth: 0.4,
    dir: 1,
    rot: -9,
    opacity: 0.16,
  },
  {
    // bold "DAF" lettering with its bar — never reads as a disc. Pulled up
    // off the very bottom edge (was bottom-2%) and trimmed a touch smaller
    // so it no longer meets Suzuki above it once its own depth-0.9 scroll
    // growth is factored in.
    src: "/Carlogo/DAF.svg",
    ratio: 1,
    tint: BLUE,
    className:
      "bottom-[8%] right-[-9%] w-[22vw] max-w-[76px] sm:bottom-[8%] sm:right-[-4%] sm:w-[12vw] sm:max-w-[150px]",
    depth: 0.9,
    dir: 1,
    rot: 7,
    opacity: 0.18,
  },
  // ---- BOTTOM CENTRE ------------------------------------------------
  {
    src: "/Carlogo/Mazda.svg",
    ratio: 225.017 / 38.219,
    tint: STEEL,
    className:
      "bottom-[9%] left-1/2 w-[38vw] max-w-[138px] sm:bottom-[12%] sm:w-[21vw] sm:max-w-[248px]",
    depth: 0.78,
    dir: 1,
    rot: -8,
    opacity: 0.16,
    cx: true,
  },
];

export default function AutoLogosBackdrop() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const section = root?.closest("section") ?? root?.parentElement;
    if (!root || !section) return;

    // Marks (masks + tint) render from the JSX itself; this effect only wires
    // the scroll parallax, and only when motion is allowed.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    type Plane = {
      el: HTMLElement;
      depth: number;
      dir: number;
      rot: number;
      tx: string;
      // motion coefficients, folded with the mobile factor — refreshed only
      // on resize, never per frame
      driftM: number;
      rotSwingM: number;
      scaleSwingM: number;
    };

    const allPlanes: Plane[] = Array.from(
      root.querySelectorAll<HTMLElement>("[data-parallax]")
    ).map((el) => ({
      el,
      depth: Number(el.dataset.depth || 0),
      dir: el.dataset.dir === "-1" ? -1 : 1,
      rot: Number(el.dataset.rot || 0),
      tx: el.dataset.cx ? "-50%" : "0",
      driftM: 0,
      rotSwingM: 0,
      scaleSwingM: 0,
    }));

    let handle: ReturnType<typeof registerParallax> | null = null;
    // Only the marks actually painted at the current breakpoint get animated —
    // on phones ~half the field is `display:none`, and writing a transform to a
    // hidden node still costs a style-recalc entry every frame.
    let planes: Plane[] = allPlanes;
    // Quantise progress to ~0.003 steps (sub-pixel at the widest drift). This
    // collapses the long sub-pixel tail of the easing filter — dozens of frames
    // that would rewrite every transform for motion the eye can't see.
    let lastStep = NaN;

    const recompute = () => {
      const factor =
        window.innerWidth <= MOBILE_MAX_WIDTH ? MOBILE_MOTION_FACTOR : 1;
      // Half the marks move and half remain as stable depth anchors. The eye
      // still reads several planes, while each frame writes only six styles.
      planes = allPlanes.filter((p, index) => {
        if (index % 2 !== 0) return false;
        const r = p.el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      for (const p of planes) {
        p.driftM = p.depth * MAX_DRIFT * p.dir * factor;
        p.rotSwingM = p.depth * MAX_ROT_SWING * p.dir * factor;
        // >0 for near planes (grow as the section leaves), <0 for far ones
        p.scaleSwingM = (p.depth - FOCAL_PLANE) * SCALE_GAIN * factor;
      }
      lastStep = NaN; // force the next frame to write
    };

    const apply = (progress: number) => {
      const step = Math.round(progress * 320);
      if (step === lastStep) return;
      lastStep = step;
      const p = step / 320;
      for (const plane of planes) {
        const y = Math.round(p * plane.driftM * 100) / 100;
        const r =
          Math.round((plane.rot + p * plane.rotSwingM) * 1000) / 1000;
        const s = Math.round((1 + p * plane.scaleSwingM) * 10000) / 10000;
        plane.el.style.transform = `translate3d(${plane.tx},${y}px,0) rotate(${r}deg) scale(${s})`;
      }
    };

    let measuredWidth = window.innerWidth;
    const onResize = () => {
      if (window.innerWidth === measuredWidth) return;
      measuredWidth = window.innerWidth;
      recompute();
    };

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
        compute: (scrollY, vh, top, height) => {
          const centre = top - scrollY + height / 2;
          return Math.max(
            -1,
            Math.min(1, (vh / 2 - centre) / (vh / 2 + height / 2))
          );
        },
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

    // Phones: the marks stay at their resting transform. A scroll-linked
    // transform on ~10 masked / gradient layers is the biggest single source of
    // compositor stutter on mobile GPUs, and the parallax barely reads at that
    // width. The effect installs only above the breakpoint, and follows the
    // viewport across it.
    const coarse = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`);
    let io: IntersectionObserver | null = null;

    const install = () => {
      if (io) return;
      io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) start();
          else stop();
        },
        { rootMargin: "180px 0px" }
      );
      io.observe(section);
    };
    const uninstall = () => {
      io?.disconnect();
      io = null;
      stop();
    };

    const sync = () => (coarse.matches ? uninstall() : install());
    sync();
    coarse.addEventListener("change", sync);

    return () => {
      coarse.removeEventListener("change", sync);
      uninstall();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      {/* hairline dot-grid on the deepest moving plane — a slow counter-drift
          gives the whole panel a floor to move against; brightens on hover.
          The mask is a very wide, gradual vignette so the dot field has no
          visible edge (earlier tighter masks read as a faint oval). */}
      <div
        data-parallax
        data-depth="0.28"
        data-dir="-1"
        style={{ transform: "translate3d(0,0,0)" }}
        className="home-scroll-decor absolute -inset-y-[8%] inset-x-0 opacity-[0.42] transition-opacity duration-[900ms] ease-out group-hover/auto:opacity-70 bg-[radial-gradient(rgba(37,99,235,0.12)_1px,transparent_1.5px)] bg-[length:27px_27px] [mask-image:linear-gradient(to_bottom,transparent_0%,#000_22%,#000_82%,transparent_100%)]"
      />

      <div className="home-parallax-layer absolute inset-0">
        {LAYERS.map((logo) => (
          <div
            key={logo.src}
            data-parallax
            data-depth={logo.depth}
            data-dir={logo.dir}
            data-rot={logo.rot}
            data-cx={logo.cx ? "1" : undefined}
            style={{
              aspectRatio: String(logo.ratio),
              ["--mo" as string]: logo.opacity,
              backgroundImage: logo.tint,
              maskImage: `url(${logo.src})`,
              maskSize: "contain",
              maskPosition: "center",
              maskRepeat: "no-repeat",
              WebkitMaskImage: `url(${logo.src})`,
              WebkitMaskSize: "contain",
              WebkitMaskPosition: "center",
              WebkitMaskRepeat: "no-repeat",
              transform: `translate3d(${logo.cx ? "-50%" : "0"}, 0, 0) rotate(${logo.rot}deg)`,
            }}
            className={`auto-logos-mark absolute ${logo.className}`}
          />
        ))}
      </div>

      {/* light wash over the top strip where the intro / search sit — a plain
          horizontal band (never reads as a shape) so the heading + search stay
          legible over whatever marks pass underneath */}
      <div className="absolute inset-x-0 top-0 h-40 bg-[linear-gradient(to_bottom,rgba(241,246,255,0.62)_0%,rgba(241,246,255,0.12)_62%,transparent_100%)] sm:h-48" />

      {/* fine grain — a static, printed-paper texture over the whole panel */}
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          backgroundSize: "170px 170px",
        }}
      />
    </div>
  );
}
