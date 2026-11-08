"use client";

import { useEffect, useRef, useState } from "react";

import { whenScrollSettles } from "app/lib/when-scroll-settles";

type Props = { src: string };

/** Native lazy iframes can fetch thousands of pixels ahead of the viewport,
 * competing with the homepage hero and the panorama. Google's scripts also
 * stall a scroll that merely passes by, so wait until the frame is on screen
 * and the page has come to rest. */
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
    let cancelSettle: (() => void) | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      cancelSettle?.();
      if (!entry?.isIntersecting) return;
      cancelSettle = whenScrollSettles(() => {
        observer.disconnect();
        setNearby(true);
      });
    }, { threshold: 0.1 });
    observer.observe(frame);
    return () => {
      observer.disconnect();
      cancelSettle?.();
    };
  }, []);

  return (
    <div className="home-store-map-frame" ref={frameRef}>
      {nearby && <iframe src={src} title="Google Maps — магазин PartsON, Львів, Перфецького, 8" loading="eager" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />}
      <noscript><iframe src={src} title="Карта магазину PartsON у Львові" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen /></noscript>
    </div>
  );
}
