"use client";

import { useEffect, useRef } from "react";

export default function ArticleReadingProgress() {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const article = document.getElementById("blog-reading-content");
    if (!article) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const bounds = article.getBoundingClientRect();
      const distance = Math.max(1, bounds.height - window.innerHeight * 0.5);
      const progress = Math.max(0, Math.min(1, -bounds.top / distance));
      if (bar.current) bar.current.style.transform = `scaleX(${progress})`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(article);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);
  return (
    <div className="blog-reading-progress" aria-hidden="true">
      <div ref={bar} />
    </div>
  );
}
