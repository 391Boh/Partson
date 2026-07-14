"use client";

import { useReportWebVitals } from "next/web-vitals";
import { pushAnalyticsEvent } from "app/lib/gtm";

export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    const normalizedValue =
      metric.name === "CLS"
        ? Math.round(metric.value * 1000)
        : Math.round(metric.value);

    pushAnalyticsEvent("web_vitals", {
      metric_name: metric.name,
      value: normalizedValue,
      metric_value: metric.value,
      metric_id: metric.id,
      metric_delta: metric.delta,
      metric_rating: metric.rating,
      non_interaction: true,
    });
  });
  return null;
}
