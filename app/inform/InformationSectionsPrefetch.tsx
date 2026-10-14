"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { scheduleBackgroundTask } from "app/lib/schedule-background-task";

/**
 * Prefetches every information section once the page is idle. Link only
 * prefetches what is in the viewport, and on phones the section tabs sit in a
 * horizontal strip mostly off screen: a click on a section that was not
 * prefetched waited on the network instead of switching (and animating) at
 * once.
 */
export default function InformationSectionsPrefetch({ paths }: { paths: string[] }) {
  const router = useRouter();
  const key = paths.join("|");

  useEffect(() => {
    return scheduleBackgroundTask(() => {
      for (const path of key.split("|")) router.prefetch(path);
    });
  }, [key, router]);

  return null;
}
