"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";

export default function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  const shell = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const previous = previousPath.current;
    previousPath.current = pathname;
    // Initial paint and query/filter updates stay immediate. Entering/leaving
    // information pages already activates React's native view transitions.
    // Animating the live DOM during its snapshot would capture a dimmed page.
    if (previous === pathname) return;
    const hasInformationTransition = previous?.startsWith("/inform/") || pathname?.startsWith("/inform/");
    if (hasInformationTransition && typeof document.startViewTransition === "function") return;
    if ((document as Document & { activeViewTransition?: unknown }).activeViewTransition) return;
    const node = shell.current;
    if (!node?.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Opacity preserves fixed/sticky containing blocks; moving the entire page
    // would temporarily displace product tabs and floating controls. No exit
    // delay, hidden default, remount or per-frame JavaScript is required.
    const animation = node.animate([{ opacity: 0.72 }, { opacity: 1 }], {
      duration: 180,
      easing: "cubic-bezier(0.16, 1, 0.3, 1)",
    });
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const stop = () => { if (motion.matches) animation.cancel(); };
    motion.addEventListener("change", stop);
    return () => {
      animation.cancel();
      motion.removeEventListener("change", stop);
    };
  }, [pathname]);

  return <div ref={shell} className="route-transition-shell">{children}</div>;
}
