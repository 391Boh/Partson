"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { preconnect } from "react-dom";

type EmbedState = "idle" | "loading" | "ready" | "error";
const LOAD_TIMEOUT_MS = 15_000;

export function conserveStoreEmbedData() {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return Boolean(connection?.saveData || ["slow-2g", "2g"].includes(connection?.effectiveType ?? ""));
}

/** Reserve the frame immediately; warm connections and load remote content separately. */
export function useStoreEmbed(src: string, autoLoad = false) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<EmbedState>("idle");
  const [attempt, setAttempt] = useState(0);
  const warm = useCallback(() => {
    preconnect(new URL(src).origin);
    preconnect("https://maps.gstatic.com", { crossOrigin: "anonymous" });
    preconnect("https://maps.googleapis.com", { crossOrigin: "anonymous" });
  }, [src]);
  const load = useCallback(() => {
    warm();
    setState(previous => previous === "idle" ? "loading" : previous);
  }, [warm]);
  const retry = useCallback(() => {
    warm();
    setAttempt(previous => previous + 1);
    setState("loading");
  }, [warm]);
  const release = useCallback(() => setState("idle"), []);
  const onLoad = useCallback(() => setState(previous => previous === "loading" ? "ready" : previous), []);
  const onError = useCallback(() => setState(previous => previous === "loading" ? "error" : previous), []);

  useEffect(() => {
    if (state !== "loading") return;
    const timeout = window.setTimeout(onError, LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [state, attempt, onError]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const conserveData = conserveStoreEmbedData();
    if (conserveData && !autoLoad) return;
    const warmMargin = conserveData ? 0 : 900;
    const loadMargin = conserveData ? 0 : 320;
    if (typeof IntersectionObserver === "undefined") {
      // Keep the below-fold frame lazy even without an observer.
      let frameId = 0;
      let warmed = false;
      const check = () => {
        frameId = 0;
        const bounds = frame.getBoundingClientRect();
        if (bounds.bottom < 0) return;
        if (!conserveData && !warmed && bounds.top < innerHeight + warmMargin) {
          warmed = true;
          warm();
          if (!autoLoad) {
            window.removeEventListener("scroll", schedule);
            window.removeEventListener("resize", schedule);
          }
        }
        if (autoLoad && bounds.top < innerHeight + loadMargin) {
          load();
          window.removeEventListener("scroll", schedule);
          window.removeEventListener("resize", schedule);
        }
      };
      const schedule = () => { if (!frameId) frameId = window.requestAnimationFrame(check); };
      window.addEventListener("scroll", schedule, { passive: true });
      window.addEventListener("resize", schedule);
      check();
      return () => {
        window.removeEventListener("scroll", schedule);
        window.removeEventListener("resize", schedule);
        if (frameId) window.cancelAnimationFrame(frameId);
      };
    }
    const warmObserver = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      warmObserver.disconnect();
      if (!conserveData) warm();
    }, { rootMargin: `${warmMargin}px 0px` });
    warmObserver.observe(frame);
    const loadObserver = autoLoad ? new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      loadObserver?.disconnect();
      load();
    }, { rootMargin: `${loadMargin}px 0px` }) : null;
    loadObserver?.observe(frame);
    return () => { warmObserver.disconnect(); loadObserver?.disconnect(); };
  }, [autoLoad, load, warm]);

  return { frameRef, state, attempt, warm, load, retry, release, onLoad, onError, active: state === "loading" || state === "ready" };
}
