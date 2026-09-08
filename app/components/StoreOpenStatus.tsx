"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

function readStoreOpenState() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Kyiv",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const readPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const weekday = readPart("weekday");
  const currentMinutes = Number(readPart("hour")) * 60 + Number(readPart("minute"));
  const closingMinutes = weekday === "Sun" ? 16 * 60 : 18 * 60;

  return currentMinutes >= 8 * 60 && currentMinutes < closingMinutes;
}

/**
 * A deliberately small client island. The surrounding SEO/store section is
 * rendered as static server HTML, so React only hydrates the live opening
 * status instead of the complete below-fold section.
 */
export default function StoreOpenStatus() {
  const [isStoreOpen, setIsStoreOpen] = useState<boolean | null>(null);

  useEffect(() => {
    const updateStoreStatus = () => setIsStoreOpen(readStoreOpenState());

    updateStoreStatus();
    const intervalId = window.setInterval(updateStoreStatus, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const isClosed = isStoreOpen === false;

  return (
    <div
      className={`flex items-center justify-center gap-2 px-3 py-3.5 text-[12px] font-black transition-colors ${isClosed ? "bg-rose-50/70 text-rose-800" : "bg-emerald-50/60 text-emerald-800"}`}
      suppressHydrationWarning
    >
      <span
        className={`h-2.5 w-2.5 rounded-full shadow-[0_0_0_3px_rgba(15,23,42,0.06)] ${isClosed ? "bg-rose-500" : "bg-emerald-500"}`}
      />
      {isClosed ? (
        <XCircle className="h-4 w-4 text-rose-600" />
      ) : (
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
      )}
      {isStoreOpen === null ? "Перевіряємо…" : isStoreOpen ? "Працюємо" : "Зачинено"}
    </div>
  );
}
