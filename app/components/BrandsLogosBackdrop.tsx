"use client";

import { useEffect, useRef } from "react";

import {
  getCenteredParallaxProgress,
  registerParallax,
} from "app/lib/parallax-controller";

// Atmospheric layer behind the manufacturers picker — parts-maker wordmarks as
// CSS masks filled with a chrome ramp. Even, non-overlapping scatter (four down
// each edge, two mid-height in the centre, one centred at the bottom).
//
// Signature parallax — a LATERAL SPREAD: as the section scrolls through the
// viewport the whole field opens outward horizontally (left marks slide left,
// right marks slide right) and tilts away from centre, then closes back as the
// section leaves. A sideways "iris" motion — nothing like the depth push of the
// car-picker or the tumble of the categories backdrop.

type Layer = {
  src: string;
  ratio: number; // width / height so the box never distorts the mark
  tint: string;
  className: string; // position + responsive width (mobile-first)
  depth: number; // 0 far … 1 near — scales how far the mark spreads / tilts
  side: 1 | -1 | 0; // which way it slides: -1 left, +1 right, 0 stays (centre)
  rot: number;
  opacity: number;
  cx?: boolean;
};

const MOBILE_MAX_WIDTH = 640;
const MOBILE_MOTION_FACTOR = 0.5;
const MAX_SPREAD = 76;
const MAX_Y_BOB = 24;
const MAX_ROT_TILT = 3.5;

// Chrome-style ramps — a bright specular band mid-gradient so each wordmark
// reads as a lightly polished metal cut-out.
const BLUE =
  "linear-gradient(135deg,#173a8f 0%,#3f7fe6 30%,#bfe1ff 50%,#3f7fe0 62%,#1a4aa8 100%)";
const DEEP =
  "linear-gradient(140deg,#0f1f4a 0%,#25408a 30%,#6d92e0 50%,#233a80 64%,#101f46 100%)";
const STEEL =
  "linear-gradient(135deg,#2b3648 0%,#5a6a83 30%,#b3bfd0 50%,#54627b 64%,#2b3648 100%)";

// Eleven marks: four down the left edge, four down the right, two mid-height in
// the centre (so the middle no longer reads empty), one centred at the bottom.
// Each sits on its own vertical band (as a % of section height, so the spacing
// holds at every width) and every mark carries an explicit value at both
// breakpoints — no mark ever falls back to a mobile position that a desktop
// sibling has already moved into.
const LAYERS: Layer[] = [
  // ---- LEFT EDGE, top → bottom ----------------------------------------
  {
    src: "/Brands/CONTITECH.svg",
    ratio: 217.7 / 39.6,
    tint: BLUE,
    className:
      "top-[3%] left-[-4%] w-[38vw] max-w-[128px] sm:left-[0%] sm:w-[19vw] sm:max-w-[220px]",
    depth: 0.45,
    side: -1,
    rot: -4,
    opacity: 0.16,
  },
  {
    src: "/Brands/HENGST%20FILTER.svg",
    ratio: 156 / 60,
    tint: STEEL,
    className:
      "top-[26%] left-[-7%] w-[26vw] max-w-[92px] sm:left-[-3%] sm:w-[12vw] sm:max-w-[150px]",
    depth: 0.55,
    side: -1,
    rot: 5,
    opacity: 0.14,
  },
  {
    src: "/Brands/TOPRAN.svg",
    ratio: 254 / 68,
    tint: STEEL,
    className:
      "top-[52%] left-[-6%] w-[26vw] max-w-[92px] sm:left-[-2%] sm:w-[11vw] sm:max-w-[140px]",
    depth: 0.4,
    side: -1,
    rot: 4,
    opacity: 0.14,
  },
  {
    // wide faint anchor — mostly off the bottom-left edge
    src: "/Brands/METZGER.svg",
    ratio: 810.265 / 65.654,
    tint: DEEP,
    className:
      "bottom-[-3%] left-[-14%] w-[54vw] max-w-[180px] sm:left-[-6%] sm:w-[34vw] sm:max-w-[420px]",
    depth: 0.15,
    side: -1,
    rot: -3,
    opacity: 0.12,
  },
  // ---- RIGHT EDGE, top → bottom -------------------------------------
  {
    src: "/Brands/Delphi.svg",
    ratio: 653.63 / 252.61,
    tint: BLUE,
    className:
      "top-[5%] right-[-9%] w-[32vw] max-w-[112px] sm:right-[-3%] sm:w-[15vw] sm:max-w-[210px]",
    depth: 0.9,
    side: 1,
    rot: -5,
    opacity: 0.15,
  },
  {
    src: "/Brands/STELLOX.svg",
    ratio: 242 / 84,
    tint: STEEL,
    className:
      "top-[30%] right-[-10%] w-[30vw] max-w-[100px] sm:right-[-2%] sm:w-[12vw] sm:max-w-[158px]",
    depth: 0.5,
    side: 1,
    rot: -7,
    opacity: 0.15,
  },
  {
    src: "/Brands/SOGEFI.svg",
    ratio: 255.1 / 49.4,
    tint: STEEL,
    className:
      "top-[56%] right-[-8%] w-[28vw] max-w-[96px] sm:right-[-3%] sm:w-[12vw] sm:max-w-[158px]",
    depth: 0.42,
    side: 1,
    rot: 5,
    opacity: 0.14,
  },
  {
    // bold "GSP" wordmark — mostly off the bottom-right edge
    src: "/Brands/GSP.svg",
    ratio: 369.04 / 110.99,
    tint: BLUE,
    className:
      "bottom-[2%] right-[-10%] w-[34vw] max-w-[116px] sm:right-[-2%] sm:w-[15vw] sm:max-w-[200px]",
    depth: 0.85,
    side: 1,
    rot: 6,
    opacity: 0.14,
  },
  // ---- CENTRE, mid-height (fills the gap between the two edges) ------
  {
    src: "/Brands/Filtron.svg",
    ratio: 203.22748 / 40,
    tint: STEEL,
    className:
      "top-[24%] left-[38%] w-[30vw] max-w-[104px] sm:left-[40%] sm:w-[15vw] sm:max-w-[168px]",
    depth: 0.35,
    side: -1,
    rot: 3,
    opacity: 0.12,
  },
  {
    src: "/Brands/SHAFER.svg",
    ratio: 195.413 / 35.213,
    tint: STEEL,
    className:
      "top-[48%] left-[52%] w-[28vw] max-w-[98px] sm:left-[54%] sm:w-[13vw] sm:max-w-[148px]",
    depth: 0.45,
    side: 1,
    rot: -4,
    opacity: 0.12,
  },
  // ---- BOTTOM CENTRE ----------------------------------------------
  {
    src: "/Brands/TRISCAN.svg",
    ratio: 272 / 32,
    tint: STEEL,
    className:
      "bottom-[14%] left-1/2 w-[44vw] max-w-[150px] sm:bottom-[16%] sm:w-[24vw] sm:max-w-[280px]",
    depth: 0.75,
    side: 0,
    rot: -6,
    opacity: 0.14,
    cx: true,
  },
];

export default function BrandsLogosBackdrop() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const section = root?.closest("section") ?? root?.parentElement;
    if (!root || !section) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    type Plane = {
      el: HTMLElement;
      rot: number;
      cx: boolean;
      // coefficients folded with depth + mobile factor, refreshed on resize only
      spreadM: number; // px outward at |progress| = 1
      yBobM: number;
      rotTiltM: number;
    };

    const allPlanes: Plane[] = Array.from(
      root.querySelectorAll<HTMLElement>("[data-parallax]")
    ).map((el) => ({
      el,
      rot: Number(el.dataset.rot || 0),
      cx: el.dataset.cx === "1",
      spreadM: 0,
      yBobM: 0,
      rotTiltM: 0,
    }));

    let handle: ReturnType<typeof registerParallax> | null = null;
    let planes: Plane[] = allPlanes;
    let lastStep = NaN;

    const recompute = () => {
      const isMobile = window.innerWidth <= MOBILE_MAX_WIDTH;
      const factor = isMobile ? MOBILE_MOTION_FACTOR : 1;
      planes = allPlanes.filter((p, index) => {
        // One left and one right wordmark are enough to express the lateral
        // spread on phones without promoting the whole logo field.
        if (isMobile ? index !== 1 && index !== 8 : index % 2 !== 0) return false;
        const r = p.el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      for (const p of planes) {
        const el = p.el;
        const depth = Number(el.dataset.depth || 0);
        const side = el.dataset.side === "-1" ? -1 : el.dataset.side === "1" ? 1 : 0;
        p.spreadM = side * depth * MAX_SPREAD * factor;
        p.yBobM = depth * MAX_Y_BOB * factor;
        p.rotTiltM = side * depth * MAX_ROT_TILT * factor;
      }
      lastStep = NaN;
    };

    const apply = (progress: number) => {
      const step = Math.round(progress * 320);
      if (step === lastStep) return;
      lastStep = step;
      const p = step / 320;
      const absP = p < 0 ? -p : p; // spread opens at both scroll extremes
      for (const plane of planes) {
        const x = Math.round(absP * plane.spreadM * 100) / 100;
        const y = Math.round(p * plane.yBobM * 100) / 100;
        const r =
          Math.round((plane.rot - absP * plane.rotTiltM) * 1000) / 1000;
        const tx = plane.cx ? `calc(-50% + ${x}px)` : `${x}px`;
        plane.el.style.transform = `translate3d(${tx},${y}px,0) rotate(${r}deg)`;
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
        if (entries.some((e) => e.isIntersecting)) start();
        else stop();
      },
      { rootMargin: "180px 0px" }
    );
    io.observe(section);

    return () => {
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
      {/* hairline dot-grid on the deepest moving plane */}
      <div
        data-parallax
        data-depth="0.22"
        data-side="0"
        style={{ transform: "translate3d(0,0,0)" }}
        className="home-scroll-decor absolute -inset-y-[8%] inset-x-0 opacity-[0.42] transition-opacity duration-[900ms] ease-out group-hover/brandcars:opacity-70 bg-[radial-gradient(rgba(37,99,235,0.12)_1px,transparent_1.5px)] bg-[length:27px_27px] [mask-image:linear-gradient(to_bottom,transparent_0%,#000_22%,#000_82%,transparent_100%)]"
      />

      <div className="home-parallax-layer absolute inset-0">
        {LAYERS.map((logo) => (
          <div
            key={logo.src}
            data-parallax
            data-depth={logo.depth}
            data-side={logo.side}
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
            className={`brands-logos-mark absolute ${logo.className}`}
          />
        ))}
      </div>

      {/* plain horizontal top wash so the heading + search stay legible */}
      <div className="absolute inset-x-0 top-0 h-40 bg-[linear-gradient(to_bottom,rgba(241,246,255,0.62)_0%,rgba(241,246,255,0.12)_62%,transparent_100%)] sm:h-48" />

      {/* fine grain */}
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
