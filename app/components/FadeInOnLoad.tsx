"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Lazy images in a server-rendered block used to pop in when they arrived.
// This wrapper fades in only the images that are still loading when it
// mounts: already-decoded images (cache, above the fold) stay as they are,
// so nothing that is visible ever disappears. No JS → images just show.
export default function FadeInOnLoad({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const cleanups: Array<() => void> = [];
    for (const img of Array.from(root.querySelectorAll("img"))) {
      if (img.complete && img.naturalWidth > 1) continue;
      img.dataset.fade = "pending";
      const done = () => {
        img.dataset.fade = "in";
      };
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
      cleanups.push(() => {
        img.removeEventListener("load", done);
        img.removeEventListener("error", done);
      });
    }
    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

  return <span ref={ref} className={className ?? "contents"}>{children}</span>;
}
