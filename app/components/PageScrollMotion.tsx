"use client";

import { useEffect, type RefObject } from "react";
import { usePathname } from "next/navigation";
import { installPageScrollMotion } from "app/lib/page-scroll-motion";

export default function PageScrollMotion({ rootRef }: { rootRef: RefObject<HTMLElement | null> }) {
  const pathname = usePathname();
  useEffect(() => {
    if (!rootRef.current) return;
    return installPageScrollMotion(rootRef.current);
  }, [pathname, rootRef]);
  return null;
}
