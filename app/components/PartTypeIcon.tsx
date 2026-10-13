import type { ReactNode } from "react";

import { resolvePartIconKind, type PartIconKind } from "app/lib/part-icon-kind";

// Schematic line icons for auto-part groups: one 24×24 grid, 1.6px round
// strokes in currentColor, so they sit next to lucide icons and take the
// colour of whatever tile holds them. Server- and client-safe (no hooks).

const ICONS: Record<PartIconKind, ReactNode> = {
  "brake-disc": (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.2" />
      <circle cx="12" cy="6.2" r=".7" />
      <circle cx="17.8" cy="12" r=".7" />
      <circle cx="12" cy="17.8" r=".7" />
      <circle cx="6.2" cy="12" r=".7" />
    </>
  ),
  "brake-pad": (
    <>
      <path d="M3.5 16.5a8.5 8.5 0 0 1 17 0h-3.6a4.9 4.9 0 0 0-9.8 0z" />
      <path d="M3.5 19.5h17" />
      <path d="M8 12.2l-1.6-1.6M16 12.2l1.6-1.6" />
    </>
  ),
  "brake-drum": (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="5.5" />
      <circle cx="12" cy="12" r="1.6" />
      <path d="M12 3.5v2.5M12 18v2.5" />
    </>
  ),
  caliper: (
    <>
      <path d="M5 5.5h8.5a5 5 0 0 1 5 5v3a5 5 0 0 1-5 5H5z" />
      <path d="M5 9.5h7M5 14.5h7" />
      <circle cx="15.5" cy="12" r="1.2" />
    </>
  ),
  hose: (
    <>
      <path d="M5 6.5c5 0 3 11 9 11h2" />
      <path d="M8 6.5c3.6 0 1.6 8 6 8h2" />
      <path d="M3.5 5v3M16 13v6M18.5 13.5h2v5h-2" />
    </>
  ),
  cable: (
    <>
      <path d="M6.5 18H9c5 0 8-3 8-6.5a3.5 3.5 0 0 0-7 0c0 3.5 3 6.5 8 6.5h.5" />
      <path d="M3 16.5h3.5v3H3zM18.5 16.5H21v3h-2.5z" />
    </>
  ),
  filter: (
    <>
      <path d="M6.5 6.5c0-1.4 2.5-2.5 5.5-2.5s5.5 1.1 5.5 2.5v11c0 1.4-2.5 2.5-5.5 2.5s-5.5-1.1-5.5-2.5z" />
      <path d="M6.5 6.5c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5" />
      <path d="M9.5 9v8.6M12 9.2v8.8M14.5 9v8.6" />
    </>
  ),
  shock: (
    <>
      <circle cx="12" cy="3.8" r="1.6" />
      <path d="M12 5.4V10" />
      <rect x="8.8" y="10" width="6.4" height="8.2" rx="1.2" />
      <path d="M7.5 10h9" />
      <circle cx="12" cy="20.4" r="1.4" />
    </>
  ),
  spring: (
    <>
      <path d="M7 4h10M7 20h10" />
      <path d="M17 4L7 7.2l10 3.2-10 3.2 10 3.2L7 20" />
    </>
  ),
  mount: (
    <>
      <rect x="5" y="8.5" width="14" height="7" rx="2.5" />
      <path d="M8 8.5v-2M16 8.5v-2M12 15.5V20M9.5 20h5" />
      <path d="M3.5 6.5h17" />
    </>
  ),
  bearing: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="5.5" r="1.3" />
      <circle cx="17.6" cy="8.8" r="1.3" />
      <circle cx="17.6" cy="15.2" r="1.3" />
      <circle cx="12" cy="18.5" r="1.3" />
      <circle cx="6.4" cy="15.2" r="1.3" />
      <circle cx="6.4" cy="8.8" r="1.3" />
    </>
  ),
  bushing: (
    <>
      <ellipse cx="9" cy="12" rx="5" ry="7" />
      <ellipse cx="9" cy="12" rx="2" ry="3" />
      <path d="M9 5h7c2.8 0 5 3.1 5 7s-2.2 7-5 7H9" />
    </>
  ),
  "ball-joint": (
    <>
      <circle cx="8.5" cy="8.5" r="4.5" />
      <path d="M11.7 11.7l6 6" />
      <path d="M16 19.5l3.5-3.5 1.5 1.5-3.5 3.5z" />
    </>
  ),
  link: (
    <>
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="5.5" r="2.5" />
      <path d="M7.3 16.7l9.4-9.4" />
      <path d="M5.5 18.5h.01M18.5 5.5h.01" />
    </>
  ),
  boot: (
    <>
      <path d="M9 3.5h6" />
      <path d="M9.5 3.5L8 6.5l3 2.5-4 2.5 4 2.5-5 3h12l-5-3 4-2.5-4-2.5 3-2.5-1.5-3" />
      <path d="M6 17h12v3.5H6z" />
    </>
  ),
  driveshaft: (
    <>
      <path d="M7 12h10" />
      <path d="M3 9.5c2.5 0 4 1.1 4 2.5s-1.5 2.5-4 2.5z" />
      <path d="M21 9.5c-2.5 0-4 1.1-4 2.5s1.5 2.5 4 2.5z" />
      <path d="M10 10v4M14 10v4" />
    </>
  ),
  clutch: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.6" />
      <path d="M12 3v2M21 12h-2M12 21v-2M3 12h2" />
    </>
  ),
  gearbox: (
    <>
      <path d="M6 6v12M12 6v12M18 6v6M6 12h12" />
      <circle cx="6" cy="5" r="1.3" />
      <circle cx="12" cy="5" r="1.3" />
      <circle cx="18" cy="5" r="1.3" />
      <circle cx="6" cy="19" r="1.3" />
      <circle cx="12" cy="19" r="1.3" />
    </>
  ),
  belt: (
    <>
      <circle cx="7" cy="12" r="4" />
      <circle cx="17.5" cy="12" r="2.8" />
      <path d="M7 6.5l10.5 2.2M7 17.5l10.5-2.2" />
      <path d="M7 4.5c-4.2 0-6 3.4-6 7.5s1.8 7.5 6 7.5M17.5 7.8c2.6.4 4 2 4 4.2s-1.4 3.8-4 4.2" />
    </>
  ),
  pulley: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="5.5" />
      <circle cx="12" cy="12" r="1.8" />
      <path d="M12 3.5v-1M20.5 12h1M12 20.5v1M3.5 12h-1" />
    </>
  ),
  gasket: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3.5" />
      <rect x="7.5" y="9" width="9" height="6" rx="2" />
      <circle cx="5.5" cy="7.5" r=".7" />
      <circle cx="18.5" cy="7.5" r=".7" />
      <circle cx="5.5" cy="16.5" r=".7" />
      <circle cx="18.5" cy="16.5" r=".7" />
    </>
  ),
  "spark-plug": (
    <>
      <path d="M10.5 2.5h3v4h-3z" />
      <path d="M9 6.5h6v5H9z" />
      <path d="M8.5 11.5h7l-1 2.5h-5z" />
      <path d="M10 14h4v4h-4z" />
      <path d="M12 18v2.5h2.5" />
    </>
  ),
  coil: (
    <>
      <rect x="7" y="3" width="10" height="4" rx="1" />
      <path d="M8.5 7v9a3.5 3.5 0 0 0 7 0V7" />
      <path d="M8.5 9.5h7M8.5 12h7M8.5 14.5h7" />
      <path d="M12 19.5V22" />
    </>
  ),
  bulb: (
    <>
      <path d="M8.5 14.5c-1.6-1.2-2.5-3-2.5-5a6 6 0 0 1 12 0c0 2-.9 3.8-2.5 5" />
      <path d="M8.5 14.5h7v2.5h-7z" />
      <path d="M9.5 19.5h5M10.5 22h3" />
      <path d="M10.5 9.5l1.5 2 1.5-2" />
    </>
  ),
  headlight: (
    <>
      <path d="M13 5.5c4.4 0 8 2.9 8 6.5s-3.6 6.5-8 6.5h-1.5v-13z" />
      <path d="M3 8.5h5.5M3 12h5.5M3 15.5h5.5" />
    </>
  ),
  switch: (
    <>
      <rect x="3" y="7.5" width="18" height="9" rx="4.5" />
      <circle cx="16.5" cy="12" r="2.6" />
      <path d="M7 12h3" />
    </>
  ),
  sensor: (
    <>
      <path d="M9 3h6v4H9z" />
      <path d="M10 7h4v8l-2 2.5-2-2.5z" />
      <path d="M12 17.5V21" />
      <path d="M17.5 9.5a5 5 0 0 1 0 5M19.8 7.5a8 8 0 0 1 0 9" />
    </>
  ),
  electric: (
    <>
      <path d="M13 2.5L5.5 13.5h6l-1 8 7.5-11h-6z" />
    </>
  ),
  wiper: (
    <>
      <path d="M3.5 19a10 10 0 0 1 17 0" />
      <path d="M12 19L17.5 6.5" />
      <path d="M15 5.5l5.2 2.3" />
      <circle cx="12" cy="19" r="1.2" />
    </>
  ),
  pump: (
    <>
      <circle cx="12" cy="13" r="6.5" />
      <circle cx="12" cy="13" r="1.6" />
      <path d="M12 6.5V3h4M12 11.4c0-2 1.2-3.3 3-3.6M13.4 14c1.8.6 2.5 2.2 2 3.9M10.6 13.6c-1.7.9-3.4.6-4.3-.9" />
    </>
  ),
  radiator: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />
      <path d="M7.5 5.5v13M11 5.5v13M14.5 5.5v13M18 5.5v13" />
      <path d="M3.5 3v2.5M20.5 18.5V21" />
    </>
  ),
  fan: (
    <>
      <circle cx="12" cy="12" r="1.8" />
      <path d="M12 10.2c-.8-3.2.3-6.2 3-6.7 2.4-.4 3.4 2.6 1 4.8-1.2 1.1-2.6 1.6-4 1.9" />
      <path d="M13.6 12.9c3.1.9 5 3.4 4 5.9-.8 2.2-4 1.6-4.6-1.6-.3-1.6 0-3 .6-4.3" />
      <path d="M10.4 12.9c-2.3 2.3-5.4 2.8-7 .7-1.4-1.9.7-4.3 3.7-3.2 1.5.5 2.6 1.5 3.3 2.5" />
    </>
  ),
  thermostat: (
    <>
      <path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z" />
      <path d="M12 9v7" />
      <path d="M17 6h3M17 9.5h2M17 13h3" />
    </>
  ),
  reservoir: (
    <>
      <path d="M5 8.5h14v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
      <path d="M9 8.5V5.5h6v3" />
      <path d="M8 6.5h8" />
      <path d="M5 13.5h14" strokeDasharray="2 2" />
    </>
  ),
  oil: (
    <>
      <path d="M12 3.5c3 4 5.5 6.9 5.5 10a5.5 5.5 0 0 1-11 0c0-3.1 2.5-6 5.5-10z" />
      <path d="M9.5 14a2.5 2.5 0 0 0 2.5 2.5" />
    </>
  ),
  turbo: (
    <>
      <path d="M12 12a2 2 0 1 1 2-2" />
      <path d="M14 10a4 4 0 1 1-4-4" />
      <path d="M10 6a6.5 6.5 0 1 1-6.5 6.5V21h6" />
    </>
  ),
  fuel: (
    <>
      <path d="M5 20.5V5a1.5 1.5 0 0 1 1.5-1.5h6A1.5 1.5 0 0 1 14 5v15.5" />
      <path d="M3.5 20.5h12M7.5 7.5h4" />
      <path d="M14 10h2a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 0 3 0V8l-2.5-2.5" />
    </>
  ),
  steering: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M9.6 11.3L3.4 9.8M14.4 11.3l6.2-1.5M12 14.5V21" />
    </>
  ),
  mirror: (
    <>
      <path d="M5 7.5c0-1.7 1.3-3 3-3h9.5a2 2 0 0 1 2 2v6.5a3 3 0 0 1-3 3H8.5A3.5 3.5 0 0 1 5 12.5z" />
      <path d="M8 16v3.5H4.5" />
      <path d="M9 8.5l3-1" />
    </>
  ),
  body: (
    <>
      <path d="M3 15.5v-3l2-1 2.5-4h8l3 4 2.5 1v3z" />
      <circle cx="7.5" cy="16" r="2" />
      <circle cx="16.5" cy="16" r="2" />
      <path d="M8.5 11.5h8M12 7.5v4" />
    </>
  ),
  "air-con": (
    <>
      <path d="M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6" />
      <path d="M9.5 4L12 6.5 14.5 4M9.5 20l2.5-2.5 2.5 2.5" />
    </>
  ),
  engine: (
    <>
      <path d="M5.5 9h3V6.5h7V9h2l2 2.5V16h-2v2.5h-9L6 16H5.5z" />
      <path d="M5.5 11H3v4h2.5M19.5 12h1.5v3h-1.5" />
      <path d="M9 4.5h5" />
    </>
  ),
  kit: (
    <>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z" />
    </>
  ),
  part: (
    <>
      <path d="M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z" />
      <circle cx="12" cy="12" r="3.2" />
    </>
  ),
};

export default function PartTypeIcon({
  label,
  parents = [],
  kind,
  size = 22,
  className = "",
}: {
  label?: string;
  parents?: Array<string | null | undefined>;
  kind?: PartIconKind;
  size?: number;
  className?: string;
}) {
  const resolved = kind ?? resolvePartIconKind(label || "", ...parents);
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      data-part-icon={resolved}
    >
      {ICONS[resolved]}
    </svg>
  );
}
