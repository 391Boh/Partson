"use client";

import { useEffect, useRef, useState } from "react";

type Props = { src: string };

/** Native lazy iframes can fetch thousands of pixels ahead of the viewport,
 * competing with the homepage hero and the panorama. Keep a tighter boundary. */
export default function StoreLocationMap({ src }: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [nearby, setNearby] = useState(false);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    if (typeof IntersectionObserver === "undefined") {
      setNearby(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      setNearby(true);
    }, { rootMargin: "200px 0px" });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="home-store-map-frame" ref={frameRef}>
      {nearby && <iframe src={src} title="Google Maps — магазин PartsON, Львів, Перфецького, 8" loading="eager" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />}
      <noscript><iframe src={src} title="Карта магазину PartsON у Львові" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen /></noscript>
    </div>
  );
}
