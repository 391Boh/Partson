"use client";

import { useEffect, useRef } from "react";

import { registerParallax } from "app/lib/parallax-controller";

// The gradient tint / vignette layers stay static, folded into one
// background-image on the wrapper below them (see hero.tsx). The photo needs
// its own transformable element for the scroll-driven drift + zoom, driven by
// the shared parallax controller: one scroll listener + one rAF for the whole
// page, no per-frame layout reads, and the element is promoted only while the
// hero is on screen.
const MAX_SHIFT_PX = 48;
const MAX_PAN_PX = 12;
const MAX_SCALE_DELTA = 0.07;
const BASE_SCALE = 1.025;
// More steps than the eye can distinguish at this travel distance only create
// extra style invalidations. The photo stays smooth at 240 positions, while
// the two ambient planes update at a cheaper 60-position cadence.
const PHOTO_PROGRESS_STEPS = 240;
const AMBIENT_PROGRESS_STEPS = 60;

export default function HeroParallaxBackground() {
  const photoRef = useRef<HTMLDivElement>(null);
  const spotlightRef = useRef<HTMLSpanElement>(null);
  const sweepRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const photo = photoRef.current;
    const spotlight = spotlightRef.current;
    const sweep = sweepRef.current;
    const section = photo?.closest("section") as HTMLElement | null;
    if (!photo || !spotlight || !sweep || !section) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let motionFactor = window.innerWidth <= 640 ? 0.46 : 1;
    const desktopMotion = window.matchMedia("(min-width: 641px)");
    const documentRoot = document.documentElement;
    let handle: ReturnType<typeof registerParallax> | null = null;
    let lastPhotoStep = NaN;
    let lastAmbientStep = NaN;
    let animateAmbient =
      desktopMotion.matches &&
      !documentRoot.classList.contains("reduce-scroll-effects");

    const syncAmbientBudget = () => {
      const nextMotionFactor = desktopMotion.matches ? 1 : 0.46;
      const next =
        desktopMotion.matches &&
        !documentRoot.classList.contains("reduce-scroll-effects");
      if (next === animateAmbient && nextMotionFactor === motionFactor) return;
      motionFactor = nextMotionFactor;
      animateAmbient = next;
      lastPhotoStep = NaN;
      lastAmbientStep = NaN;
      spotlight.style.willChange = next && handle ? "transform, opacity" : "";
      sweep.style.willChange = next && handle ? "transform, opacity" : "";
    };

    const apply = (progress: number) => {
      // Quantisation removes imperceptible sub-pixel writes at the end of the
      // easing tail. Even on a 120 Hz display this still gives more visual
      // steps than the viewport has useful scroll samples.
      const photoStep = Math.round(progress * PHOTO_PROGRESS_STEPS);
      if (photoStep === lastPhotoStep) return;
      lastPhotoStep = photoStep;

      const p = photoStep / PHOTO_PROGRESS_STEPS;
      const cinematic = p * p * (3 - 2 * p); // smoothstep, no abrupt edges
      const shiftY = cinematic * MAX_SHIFT_PX * motionFactor;
      const panX = (cinematic - 0.35) * MAX_PAN_PX * motionFactor;
      const scale = BASE_SCALE + cinematic * MAX_SCALE_DELTA * motionFactor;

      photo.style.transform = `translate3d(${panX.toFixed(2)}px,${shiftY.toFixed(2)}px,0) scale(${scale.toFixed(4)})`;

      // The ambient planes move much less than the photo. Updating them at a
      // quarter of the photo's cadence preserves the depth effect while
      // avoiding two extra full-hero compositor writes on most frames.
      // Phones and the adaptive low-power mode animate only the photo: one
      // compositor write retains depth without moving two full-viewport
      // gradient textures on every frame.
      if (!animateAmbient) return;
      const ambientStep = Math.round(progress * AMBIENT_PROGRESS_STEPS);
      if (ambientStep === lastAmbientStep) return;
      lastAmbientStep = ambientStep;
      const ambientProgress = ambientStep / AMBIENT_PROGRESS_STEPS;
      const ambientCinematic = ambientProgress * ambientProgress * (3 - 2 * ambientProgress);
      const lightX = (0.5 - ambientCinematic) * 34 * motionFactor;
      const lightY = ambientCinematic * -12 * motionFactor;
      spotlight.style.transform = `translate3d(${lightX.toFixed(2)}px,${lightY.toFixed(2)}px,0) scale(${(1 + ambientCinematic * 0.08).toFixed(4)})`;
      spotlight.style.opacity = (0.52 + (1 - ambientCinematic) * 0.24).toFixed(3);

      const sweepX = -18 + ambientCinematic * 36;
      sweep.style.transform = `translate3d(${sweepX.toFixed(2)}%,0,0) scale(1.22)`;
      sweep.style.opacity = (0.12 + Math.sin(ambientCinematic * Math.PI) * 0.46).toFixed(3);
    };

    const start = () => {
      if (handle) {
        handle.refresh();
        return;
      }
      photo.style.willChange = "transform";
      if (animateAmbient) {
        spotlight.style.willChange = "transform, opacity";
        sweep.style.willChange = "transform, opacity";
      }
      handle = registerParallax({
        el: section,
        // 0 while the hero sits at the top of the page, ramping to 1 as it
        // scrolls up out of the viewport.
        compute: (scrollY, _vh, top, height) =>
          Math.min(Math.max((scrollY - top) / height, 0), 1),
        apply,
        // A very short shared easing half-life removes trackpad/wheel steps
        // while still keeping the camera visually attached to the page.
        ease: true,
        heavy: true,
      });
    };
    const stop = () => {
      if (!handle) return;
      handle.release();
      handle = null;
      photo.style.willChange = "";
      spotlight.style.willChange = "";
      sweep.style.willChange = "";
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) start();
        else stop();
      },
      { rootMargin: "150px 0px" }
    );
    io.observe(section);

    desktopMotion.addEventListener("change", syncAmbientBudget);
    const classObserver = new MutationObserver(syncAmbientBudget);
    classObserver.observe(documentRoot, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      desktopMotion.removeEventListener("change", syncAmbientBudget);
      classObserver.disconnect();
      io.disconnect();
      stop();
    };
  }, []);

  // The scale-in / fade entrance lives on this wrapper so it composes with —
  // rather than fights — the JS parallax written onto the photo.
  return (
    <div
      aria-hidden="true"
      className="hero-photo-in pointer-events-none absolute inset-0 z-0"
    >
      <div
        ref={photoRef}
        className="hero-photo absolute inset-0"
        style={{
          backgroundSize: "cover",
          backgroundPosition: "center 38%",
          backgroundRepeat: "no-repeat",
          transform: `translate3d(0, 0, 0) scale(${BASE_SCALE})`,
        }}
      />
      <span ref={spotlightRef} className="hero-parallax-spotlight absolute inset-0" />
      <span ref={sweepRef} className="hero-parallax-sweep absolute inset-0" />
    </div>
  );
}
