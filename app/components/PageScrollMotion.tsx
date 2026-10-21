"use client";

import { useEffect, useRef, type RefObject } from "react";
import { usePathname } from "next/navigation";
import { installPageScrollMotion } from "app/lib/page-scroll-motion";
import { scheduleBackgroundTask } from "app/lib/schedule-background-task";

export default function PageScrollMotion({ rootRef }: { rootRef: RefObject<HTMLElement | null> }) {
  const pathname = usePathname();
  const hasInstalledRef = useRef(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || pathname === "/") return;

    let uninstall: (() => void) | undefined;
    const install = () => {
      hasInstalledRef.current = true;
      uninstall = installPageScrollMotion(root);
    };

    // On the first page load the page content below this layout can hydrate
    // later than the layout (its own Suspense boundary). Marking motion
    // targets/scenes with data-* attributes before that made React report a
    // hydration attribute mismatch (e.g. data-page-motion-scene on the
    // /inform hero). The motion is decorative, so wait for load + idle;
    // client navigations have nothing to hydrate and install immediately.
    if (hasInstalledRef.current) {
      install();
      return () => uninstall?.();
    }
    const cancel = scheduleBackgroundTask(install);
    return () => {
      cancel();
      uninstall?.();
    };
  }, [pathname, rootRef]);

  return null;
}
