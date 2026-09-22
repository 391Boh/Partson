"use client";

import { useEffect } from "react";

// Versioned because the old mode completely froze component parallax. The
// current mode keeps it visible at a capped cadence, so old measurements are
// no longer representative after the lighter transform tuning.
const STORAGE_KEY = "partson:reduced-scroll-effects:v2";
// Was 1400ms: on genuinely weak hardware the first scroll gesture of the
// session always ran at full quality for the whole sampling window before
// this could react — the very stutters it exists to prevent. Shortened so
// the fallback (devices that pass the synchronous hardware check below but
// are still slow — thermal throttling, a busy background tab) reacts faster;
// 10 samples is still easily reached inside 900ms at any frame rate worth
// distinguishing.
const SAMPLE_DURATION_MS = 900;
const SLOW_FRAME_MS = 28;
const SLOW_FRAME_LIMIT = 4;
// Cheap, synchronous, no-scroll-needed pre-check for hardware that's all but
// certain to struggle: low core count or low RAM. Catches the case the frame
// sampler structurally can't — a weak device's *first* scroll of the session,
// before any frames have even been measured. `deviceMemory` is Chromium-only
// (undefined elsewhere); `hardwareConcurrency` is universal but absent means
// "unknown," not "fast," so an undefined value never trips this on its own.
// Conservative on purpose — plenty of perfectly capable mid-range laptops
// report 4 logical cores, so that alone isn't "weak." 2 or fewer is a much
// safer signal to act on without a real frame-time sample backing it up.
const LOW_CORE_COUNT = 2;
const LOW_DEVICE_MEMORY_GB = 4;

const isLikelyWeakDevice = () => {
  const cores = navigator.hardwareConcurrency;
  if (typeof cores === "number" && cores > 0 && cores <= LOW_CORE_COUNT) return true;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (typeof memory === "number" && memory > 0 && memory <= LOW_DEVICE_MEMORY_GB) return true;
  return false;
};

/**
 * Keeps the visual quality adaptive instead of assuming every desktop GPU can
 * composite the same number of masks, filters and transformed layers. The
 * check runs once, writes no React state and never touches layout.
 */
export default function ScrollPerformanceGuard() {
  useEffect(() => {
    const root = document.documentElement;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    root.classList.remove("reduce-scroll-effects");

    try {
      if (window.sessionStorage.getItem(STORAGE_KEY) === "1") {
        root.classList.add("reduce-scroll-effects");
        return;
      }
    } catch {}

    // Small screens can also struggle: apply the same measured budget on
    // mobile instead of excluding the devices most sensitive to dropped frames.
    if (isLikelyWeakDevice()) {
      root.classList.add("reduce-scroll-effects");
      try {
        window.sessionStorage.setItem(STORAGE_KEY, "1");
      } catch {}
      return;
    }

    let raf = 0;
    let startedAt = 0;
    let previousFrame = 0;
    let slowFrames = 0;
    let samples = 0;
    let sampling = false;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      sampling = false;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", startSampling);

      if (samples >= 10 && slowFrames >= SLOW_FRAME_LIMIT) {
        root.classList.add("reduce-scroll-effects");
        try {
          window.sessionStorage.setItem(STORAGE_KEY, "1");
        } catch {}
      }
    };

    const sample = (now: number) => {
      if (!sampling) return;
      if (previousFrame > 0) {
        const delta = now - previousFrame;
        // Ignore tab switches / debugger pauses; they say nothing about GPU
        // scroll performance and would otherwise force the low-quality mode.
        if (delta < 150) {
          samples += 1;
          if (delta > SLOW_FRAME_MS) slowFrames += 1;
        }
      }
      previousFrame = now;

      if (now - startedAt >= SAMPLE_DURATION_MS) {
        finish();
        return;
      }
      raf = requestAnimationFrame(sample);
    };

    function startSampling() {
      if (sampling || finished) return;
      sampling = true;
      startedAt = performance.now();
      previousFrame = 0;
      raf = requestAnimationFrame(sample);
    }

    window.addEventListener("scroll", startSampling, { passive: true });
    return () => {
      finished = true;
      sampling = false;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", startSampling);
    };
  }, []);

  return null;
}
