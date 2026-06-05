"use client";

import { useReportWebVitals } from "next/web-vitals";

export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    if (typeof window === "undefined") return;
    const dl = (window as Window & { dataLayer?: unknown[] }).dataLayer;
    if (!Array.isArray(dl)) return;
    dl.push({
      event: "web_vitals",
      event_category: "Web Vitals",
      event_action: metric.name,
      event_value: Math.round(metric.value),
      metric_id: metric.id,
      metric_delta: Math.round(metric.delta),
      metric_rating: metric.rating,
    });
  });
  return null;
}
