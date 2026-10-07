"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

export default function PartnershipVisual() {
  const scene = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scene.current;
    if (!node) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let visible = true;
    const update = () => {
      frame = 0;
      if (motion.matches) {
        node.style.setProperty("--partner-parallax", "0px");
        return;
      }
      const top = node.getBoundingClientRect().top;
      node.style.setProperty("--partner-parallax", `${Math.max(-55, Math.min(80, -top * .14))}px`);
    };
    const schedule = () => {
      if (visible && !frame) frame = requestAnimationFrame(update);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) schedule();
    });
    observer.observe(node);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    motion.addEventListener("change", update);
    schedule();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      motion.removeEventListener("change", update);
    };
  }, []);

  return (
    <div ref={scene} className="partner-hero-art" aria-hidden="true">
      <div className="partner-hero-photo">
        <Image src="/images/partnership-workshop-v1.webp" alt="" fill sizes="100vw" preload />
      </div>
      <div className="partner-hero-shade" />
      <div className="partner-orbit partner-orbit--one" />
      <div className="partner-orbit partner-orbit--two" />
    </div>
  );
}
