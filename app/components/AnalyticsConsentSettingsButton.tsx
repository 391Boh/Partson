"use client";

import { openAnalyticsConsentSettings } from "app/lib/gtm";

export default function AnalyticsConsentSettingsButton({
  className = "",
  label = "Налаштувати cookies",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={openAnalyticsConsentSettings}
      className={className}
    >
      {label}
    </button>
  );
}
