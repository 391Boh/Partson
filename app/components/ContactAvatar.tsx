import { useId } from "react";

// Each manager gets a silhouette that hints at their role, on a tile of its own
// colour, so the list reads by face as well as by name.
export type ContactAvatarVariant = "sales" | "director" | "diagnostics" | "consultant";

const SKIN = "#eaf5fc";

const PALETTES: Record<ContactAvatarVariant, { from: string; to: string; hair: string; accent: string; body: string }> = {
  sales: { from: "#2dd4bf", to: "#0e6f86", hair: "#0b3a47", accent: "#ccfbf1", body: SKIN },
  director: { from: "#818cf8", to: "#1e3a8a", hair: "#141c3d", accent: "#fbbf24", body: "#1d2850" },
  diagnostics: { from: "#fbbf24", to: "#b4471a", hair: "#5a210c", accent: "#fde68a", body: SKIN },
  consultant: { from: "#a78bfa", to: "#2463d6", hair: "#22174d", accent: "#bae6fd", body: SKIN },
};

export default function ContactAvatar({ variant }: { variant: ContactAvatarVariant }) {
  const id = useId().replace(/:/g, "");
  const p = PALETTES[variant];

  return (
    <svg className="cw-contact-avatar-art" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={p.from} />
          <stop offset="1" stopColor={p.to} />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.5" cy="0.38" r="0.5">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="48" height="48" fill={`url(#${id}-bg)`} />
      <circle cx="24" cy="19" r="17" fill={`url(#${id}-glow)`} />

      {/* neck, shoulders and head */}
      <rect x="20.6" y="25" width="6.8" height="9" rx="3" fill={SKIN} opacity="0.92" />
      <path d="M6.5 49c0-9.6 7.8-16.2 17.5-16.2S41.5 39.4 41.5 49z" fill={p.body} />
      <ellipse cx="24" cy="19.2" rx="7.6" ry="8.4" fill={SKIN} />

      {variant === "sales" && (
        <>
          <path d="M16.3 18.4c-.5-6.2 3.3-9.9 7.8-9.9 5 0 8.5 3.3 7.6 9.6-1.3-3-4.3-4.6-7.8-4.7-3.3 0-6.1 1.6-7.6 5z" fill={p.hair} />
          <path d="M18.8 33.6 24 39.8l5.2-6.2" fill="none" stroke={p.to} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="29" y="38.6" width="6" height="3.4" rx="1" fill={p.from} />
        </>
      )}

      {variant === "director" && (
        <>
          <path d="M16.1 18.8c-.7-6.6 3.6-10.3 8.5-10.3 4.5 0 7.8 2.7 7.5 8.6-3-1.8-7.4-2.6-11.4-1.8-2 .4-3.6 1.8-4.6 3.5z" fill={p.hair} />
          <path d="M19 33.4 24 42l5-8.6c-1.5-.4-3.2-.6-5-.6s-3.5.2-5 .6z" fill={SKIN} />
          <path d="M23 34.6h2l1 6.4-2 2.6-2-2.6z" fill={p.accent} />
          <path d="M18.4 33.8 22.6 44M29.6 33.8 25.4 44" stroke="#0d1430" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
        </>
      )}

      {variant === "diagnostics" && (
        <>
          <path d="M15.8 17.4c0-5.6 3.7-9.2 8.2-9.2s8.2 3.6 8.2 9.2z" fill={p.hair} />
          <path d="M14.2 16.9h19.6c1.6 0 2.4.7 2 1.5-.3.6-1 .9-1.8.9H14c-.8 0-1.5-.3-1.8-.9-.4-.8.4-1.5 2-1.5z" fill={p.hair} />
          <circle cx="24" cy="12.6" r="1.5" fill={p.accent} />
          <path d="M17.2 34.6V49M30.8 34.6V49" stroke={p.hair} strokeWidth="2.4" strokeLinecap="round" />
          <rect x="20.6" y="39.4" width="6.8" height="5.4" rx="1.2" fill="none" stroke={p.hair} strokeWidth="1.4" />
        </>
      )}

      {variant === "consultant" && (
        <>
          <path d="M16.3 18c-.9-5.9 2.6-9.8 7-10 1.7-1.4 4.5-1.6 6.1.2 2.7 1 3.7 4.3 2.4 9.6-1.2-2.7-3.4-4.1-6.5-4.3-1.4.8-3.6 1.2-5.6 1-1.4.8-2.6 2-3.4 3.5z" fill={p.hair} />
          <path d="M17.4 23.4c1 3.9 3.6 5.6 6.6 5.6s5.6-1.7 6.6-5.6c-1.6 1.2-3.8 1.8-6.6 1.8s-5-.6-6.6-1.8z" fill={p.hair} />
          <path d="M14.6 19.6c0-6.6 4.2-10.9 9.4-10.9s9.4 4.3 9.4 10.9" fill="none" stroke={p.accent} strokeWidth="2" strokeLinecap="round" />
          <rect x="12.6" y="17.4" width="4" height="6.4" rx="1.8" fill={p.accent} />
          <rect x="31.4" y="17.4" width="4" height="6.4" rx="1.8" fill={p.accent} />
          <path d="M15.4 23.6c.3 3.4 2.8 5 6.2 5" fill="none" stroke={p.accent} strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="22.2" cy="28.6" r="1.5" fill={p.accent} />
          <path d="M21.4 34.4v5.2M26.6 34.4v5.2" stroke={p.to} strokeWidth="1.3" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
