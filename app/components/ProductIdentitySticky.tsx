"use client";

import { useEffect, useRef, type ReactNode } from "react";

export default function ProductIdentitySticky({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    const page = element?.closest<HTMLElement>(".product-page");
    if (!element || !page) return;
    const measure = () => page.style.setProperty("--product-identity-height", `${element.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => { observer.disconnect(); page.style.removeProperty("--product-identity-height"); };
  }, []);
  return <div ref={ref} className="product-identity-sticky product-overview-sticky"><div className="product-identity-content">{children}</div></div>;
}
