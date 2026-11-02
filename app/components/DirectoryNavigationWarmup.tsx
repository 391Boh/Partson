"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { directoryBackground, type DirectorySection } from "app/lib/directory-appearance";
import { canPrefetchRoute, prefetchRoute } from "app/lib/route-prefetch";
import { scheduleBackgroundTask } from "app/lib/schedule-background-task";

const sections: DirectorySection[] = ["auto", "groups", "manufacturers"];
const warmedPhotos = new Set<DirectorySection>();

/** Only the two neighbouring directories, after the current page has loaded.
 * The shared route registry also deduplicates hover, focus and touch intent. */
export default function DirectoryNavigationWarmup({ current }: { current: DirectorySection }) {
  const router = useRouter();

  useEffect(() => {
    if (!canPrefetchRoute()) return;
    const queue = sections.filter(section => section !== current);
    const cancellations: Array<() => void> = [];
    let cancelled = false;
    const warmNext = () => {
      if (cancelled || !canPrefetchRoute()) return;
      const section = queue.shift();
      if (!section) return;
      prefetchRoute(router, `/${section}`);
      if (!warmedPhotos.has(section)) {
        warmedPhotos.add(section);
        const photo = new Image();
        const { src, srcSet, sizes } = directoryBackground(section);
        photo.fetchPriority = "low";
        photo.decoding = "async";
        photo.sizes = sizes;
        photo.srcset = srcSet;
        photo.onerror = () => warmedPhotos.delete(section);
        photo.src = src;
      }
      if (queue.length) cancellations.push(scheduleBackgroundTask(warmNext, { delayMs: 350 }));
    };
    cancellations.push(scheduleBackgroundTask(warmNext, { delayMs: 250 }));
    return () => {
      cancelled = true;
      cancellations.forEach(cancel => cancel());
    };
  }, [current, router]);

  return null;
}
