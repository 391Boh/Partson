"use client";

import { useId, type ReactNode } from "react";
import {
  BatteryCharging,
  CarFront,
  Check,
  Cog,
  Crown,
  Disc3,
  Fuel,
  Gauge,
  Handshake,
  KeyRound,
  Lock,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { findAvatarFrame, PROFILE_AVATAR_FRAMES, type AvatarTier } from "app/lib/profile-appearance";
import { useAvatarMotion } from "app/lib/use-avatar-motion";
export type { AvatarTier } from "app/lib/profile-appearance";

type AvatarDefinition = {
  id: string;
  tier: AvatarTier;
  label: string;
};

type BasicAvatar = AvatarDefinition & { tier: "basic"; icon: LucideIcon; tone: string };
type ArtAvatar = AvatarDefinition & { tier: "partner" | "admin"; art: (uid: string) => ReactNode };

const BASIC_AVATARS: BasicAvatar[] = [
  { id: "wrench", tier: "basic", label: "Ключ", icon: Wrench, tone: "from-sky-400 to-blue-600" },
  { id: "car", tier: "basic", label: "Авто", icon: CarFront, tone: "from-teal-400 to-cyan-700" },
  { id: "cog", tier: "basic", label: "Шестерня", icon: Cog, tone: "from-slate-400 to-slate-700" },
  { id: "gauge", tier: "basic", label: "Прилади", icon: Gauge, tone: "from-indigo-400 to-indigo-700" },
  { id: "fuel", tier: "basic", label: "Пальне", icon: Fuel, tone: "from-amber-400 to-orange-600" },
  { id: "battery", tier: "basic", label: "Акумулятор", icon: BatteryCharging, tone: "from-emerald-400 to-emerald-700" },
  { id: "brake", tier: "basic", label: "Гальма", icon: Disc3, tone: "from-rose-400 to-red-600" },
  { id: "key", tier: "basic", label: "Ключ запалювання", icon: KeyRound, tone: "from-violet-400 to-purple-700" },
];

const polar = (cx: number, cy: number, r: number, deg: number) => {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)] as const;
};

const round = (value: number) => Math.round(value * 100) / 100;

const gearPath = (cx: number, cy: number, outer: number, inner: number, teeth: number) => {
  const step = 360 / teeth;
  const points: string[] = [];
  for (let i = 0; i < teeth; i += 1) {
    const a = i * step;
    for (const [r, d] of [[inner, -step * 0.32], [outer, -step * 0.2], [outer, step * 0.2], [inner, step * 0.32]] as const) {
      const [x, y] = polar(cx, cy, r, a + d);
      points.push(`${round(x)} ${round(y)}`);
    }
  }
  return `M${points.join(" L")} Z`;
};

const arcPath = (cx: number, cy: number, r: number, from: number, to: number) => {
  const [x1, y1] = polar(cx, cy, r, from);
  const [x2, y2] = polar(cx, cy, r, to);
  return `M${round(x1)} ${round(y1)} A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${round(x2)} ${round(y2)}`;
};

// Shared paint for the partner set: deep workshop navy with a teal glow,
// brushed-steel parts.
function PartnerDefs({ uid }: { uid: string }) {
  return (
    <defs>
      <radialGradient id={`${uid}-bg`} cx="35%" cy="25%" r="85%">
        <stop offset="0" stopColor="#1d4a63" />
        <stop offset="0.55" stopColor="#0e2638" />
        <stop offset="1" stopColor="#06121c" />
      </radialGradient>
      <linearGradient id={`${uid}-steel`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#f1f5f9" />
        <stop offset="0.45" stopColor="#a8b6c6" />
        <stop offset="1" stopColor="#5b6b7d" />
      </linearGradient>
      <radialGradient id={`${uid}-glow`} cx="50%" cy="55%" r="50%">
        <stop offset="0" stopColor="#2dd4bf" stopOpacity="0.45" />
        <stop offset="1" stopColor="#2dd4bf" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

function PartnerFrame({ uid, children }: { uid: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <PartnerDefs uid={uid} />
      <rect width="64" height="64" fill={`url(#${uid}-bg)`} />
      <circle cx="32" cy="34" r="26" fill={`url(#${uid}-glow)`} />
      {children}
    </svg>
  );
}

// Admin set: carbon fibre and gold.
function AdminFrame({ uid, children }: { uid: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <pattern id={`${uid}-carbon`} width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="#0c0d10" />
          <rect width="3" height="3" fill="#1c1f25" />
          <rect x="3" y="3" width="3" height="3" fill="#1c1f25" />
        </pattern>
        <linearGradient id={`${uid}-gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff7d1" />
          <stop offset="0.35" stopColor="#fcd34d" />
          <stop offset="0.7" stopColor="#f59e0b" />
          <stop offset="1" stopColor="#92400e" />
        </linearGradient>
        <radialGradient id={`${uid}-shine`} cx="30%" cy="18%" r="70%">
          <stop offset="0" stopColor="#fbbf24" stopOpacity="0.32" />
          <stop offset="1" stopColor="#fbbf24" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="64" height="64" fill={`url(#${uid}-carbon)`} />
      <rect width="64" height="64" fill={`url(#${uid}-shine)`} />
      {children}
    </svg>
  );
}

const PARTNER_AVATARS: ArtAvatar[] = [
  {
    id: "partner-turbo",
    tier: "partner",
    label: "Турбіна",
    art: (uid) => (
      <PartnerFrame uid={uid}>
        <circle cx="32" cy="33" r="21" fill="#0b1b28" stroke={`url(#${uid}-steel)`} strokeWidth="3.5" />
        {Array.from({ length: 9 }, (_, i) => (
          <path
            key={i}
            d="M32 33 C33 26 37 20 44 17"
            fill="none"
            stroke={`url(#${uid}-steel)`}
            strokeWidth="2.6"
            strokeLinecap="round"
            transform={`rotate(${i * 40} 32 33)`}
          />
        ))}
        <circle cx="32" cy="33" r="5" fill="#2dd4bf" stroke="#e2fdf8" strokeWidth="1.5" />
      </PartnerFrame>
    ),
  },
  {
    id: "partner-brake",
    tier: "partner",
    label: "Гальмівний диск",
    art: (uid) => (
      <PartnerFrame uid={uid}>
        <circle cx="30" cy="34" r="21" fill={`url(#${uid}-steel)`} />
        <circle cx="30" cy="34" r="21" fill="none" stroke="#334155" strokeWidth="1" />
        {Array.from({ length: 12 }, (_, i) => {
          const [x, y] = polar(30, 34, 15.5, i * 30 + (i % 2) * 6);
          return <circle key={i} cx={round(x)} cy={round(y)} r="1.3" fill="#475569" />;
        })}
        <circle cx="30" cy="34" r="9" fill="#64748b" stroke="#cbd5e1" strokeWidth="1" />
        {Array.from({ length: 5 }, (_, i) => {
          const [x, y] = polar(30, 34, 5.5, i * 72);
          return <circle key={i} cx={round(x)} cy={round(y)} r="1.2" fill="#1e293b" />;
        })}
        <path d={arcPath(30, 34, 19, 15, 95)} fill="none" stroke="#dc2626" strokeWidth="9" strokeLinecap="round" />
        <path d={arcPath(30, 34, 19, 25, 85)} fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
      </PartnerFrame>
    ),
  },
  {
    id: "partner-piston",
    tier: "partner",
    label: "Поршень",
    art: (uid) => (
      <PartnerFrame uid={uid}>
        <path d="M27 34 L24 52 M37 34 L40 52" stroke="#64748b" strokeWidth="5" strokeLinecap="round" />
        <circle cx="32" cy="53" r="7" fill="none" stroke={`url(#${uid}-steel)`} strokeWidth="4" />
        <rect x="18" y="12" width="28" height="25" rx="4" fill={`url(#${uid}-steel)`} />
        <path d="M18 17.5 H46 M18 21.5 H46" stroke="#334155" strokeWidth="1.6" />
        <circle cx="32" cy="29.5" r="3.5" fill="#1e293b" stroke="#cbd5e1" strokeWidth="1" />
        <path d="M20 12.8 H44" stroke="#2dd4bf" strokeWidth="1.4" strokeLinecap="round" />
      </PartnerFrame>
    ),
  },
  {
    id: "partner-wheel",
    tier: "partner",
    label: "Колесо",
    art: (uid) => (
      <PartnerFrame uid={uid}>
        <circle cx="32" cy="33" r="24" fill="#16191e" />
        {Array.from({ length: 24 }, (_, i) => {
          const [x1, y1] = polar(32, 33, 19.5, i * 15);
          const [x2, y2] = polar(32, 33, 23.5, i * 15 + 5);
          return <line key={i} x1={round(x1)} y1={round(y1)} x2={round(x2)} y2={round(y2)} stroke="#3b434e" strokeWidth="2.2" />;
        })}
        <circle cx="32" cy="33" r="14" fill={`url(#${uid}-steel)`} />
        {Array.from({ length: 5 }, (_, i) => {
          const [x, y] = polar(32, 33, 12.5, i * 72);
          return <line key={i} x1="32" y1="33" x2={round(x)} y2={round(y)} stroke="#475569" strokeWidth="3.4" strokeLinecap="round" />;
        })}
        <circle cx="32" cy="33" r="3.8" fill="#2dd4bf" stroke="#0f172a" strokeWidth="1" />
      </PartnerFrame>
    ),
  },
  {
    id: "partner-spark",
    tier: "partner",
    label: "Свіча запалювання",
    art: (uid) => (
      <PartnerFrame uid={uid}>
        <rect x="29" y="7" width="6" height="6" rx="1.5" fill={`url(#${uid}-steel)`} />
        <path d="M26 13 H38 L37 31 H27 Z" fill="#f8fafc" />
        <path d="M26.5 17 H37.5 M26.7 21 H37.3 M26.9 25 H37.1" stroke="#cbd5e1" strokeWidth="1.4" />
        <path d="M23 31 H41 L39 38 H25 Z" fill={`url(#${uid}-steel)`} />
        <rect x="27" y="38" width="10" height="10" fill="#94a3b8" />
        <path d="M27 40.5 H37 M27 43.5 H37 M27 46.5 H37" stroke="#475569" strokeWidth="1.1" />
        <path d="M32 48 V52 H36" fill="none" stroke="#cbd5e1" strokeWidth="1.6" />
        <path d="M33 56 L36 53.5 L38 57 L41 54 L40 59" fill="none" stroke="#fbbf24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </PartnerFrame>
    ),
  },
  {
    id: "partner-speed",
    tier: "partner",
    label: "Спідометр",
    art: (uid) => (
      <PartnerFrame uid={uid}>
        <path d={arcPath(32, 36, 21, -125, 125)} fill="none" stroke="#1e3a4c" strokeWidth="5" strokeLinecap="round" />
        <path d={arcPath(32, 36, 21, -125, 60)} fill="none" stroke="#2dd4bf" strokeWidth="5" strokeLinecap="round" />
        <path d={arcPath(32, 36, 21, 75, 125)} fill="none" stroke="#ef4444" strokeWidth="5" strokeLinecap="round" />
        {Array.from({ length: 11 }, (_, i) => {
          const angle = -125 + i * 25;
          const [x1, y1] = polar(32, 36, 14.5, angle);
          const [x2, y2] = polar(32, 36, 16.5, angle);
          return <line key={i} x1={round(x1)} y1={round(y1)} x2={round(x2)} y2={round(y2)} stroke="#cbd5e1" strokeWidth="1.3" />;
        })}
        <line x1="32" y1="36" x2={round(polar(32, 36, 17, 82)[0])} y2={round(polar(32, 36, 17, 82)[1])} stroke="#f8fafc" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="32" cy="36" r="3.6" fill={`url(#${uid}-steel)`} />
        <text x="32" y="53" textAnchor="middle" fontSize="7" fontWeight="800" fill="#99f6e4" fontFamily="system-ui, sans-serif">PRO</text>
      </PartnerFrame>
    ),
  },
];

const ADMIN_AVATARS: ArtAvatar[] = [
  {
    id: "admin-crown-gear",
    tier: "admin",
    label: "Головна шестерня",
    art: (uid) => (
      <AdminFrame uid={uid}>
        <path d={gearPath(32, 34, 23, 19, 12)} fill={`url(#${uid}-gold)`} />
        <circle cx="32" cy="34" r="13.5" fill="#111318" />
        <path d="M23.5 39 L22 28 L27.5 32 L32 25 L36.5 32 L42 28 L40.5 39 Z" fill={`url(#${uid}-gold)`} />
        <rect x="23.5" y="40" width="17" height="3" rx="1.2" fill={`url(#${uid}-gold)`} />
      </AdminFrame>
    ),
  },
  {
    id: "admin-flag",
    tier: "admin",
    label: "Фініш",
    art: (uid) => (
      <AdminFrame uid={uid}>
        <defs>
          <clipPath id={`${uid}-flag`}>
            <path d="M19 12 C27 8 35 16 46 11 V33 C35 38 27 30 19 34 Z" />
          </clipPath>
        </defs>
        <g clipPath={`url(#${uid}-flag)`}>
          <rect x="17" y="6" width="32" height="32" fill="#f8fafc" />
          {Array.from({ length: 36 }, (_, i) => {
            const col = i % 6;
            const row = Math.floor(i / 6);
            return (col + row) % 2 === 0 ? (
              <rect key={i} x={17 + col * 5.4} y={6 + row * 5.4} width="5.4" height="5.4" fill="#111318" />
            ) : null;
          })}
        </g>
        <path d="M19 12 C27 8 35 16 46 11 V33 C35 38 27 30 19 34 Z" fill="none" stroke={`url(#${uid}-gold)`} strokeWidth="1.4" />
        <rect x="16" y="9" width="3.4" height="47" rx="1.7" fill={`url(#${uid}-gold)`} />
        <circle cx="17.7" cy="9" r="2.6" fill={`url(#${uid}-gold)`} />
      </AdminFrame>
    ),
  },
  {
    id: "admin-shield",
    tier: "admin",
    label: "Щит PartsON",
    art: (uid) => (
      <AdminFrame uid={uid}>
        <path d="M32 8 L50 14 V30 C50 42 42 50 32 56 C22 50 14 42 14 30 V14 Z" fill={`url(#${uid}-gold)`} />
        <path d="M32 12.5 L46 17 V30 C46 40 39.5 46.5 32 51 C24.5 46.5 18 40 18 30 V17 Z" fill="#111318" />
        <path d="M35 17 L25 34 H31.5 L28.5 47 L39.5 28 H33 Z" fill={`url(#${uid}-gold)`} />
      </AdminFrame>
    ),
  },
  {
    id: "admin-wheel",
    tier: "admin",
    label: "Кермо",
    art: (uid) => (
      <AdminFrame uid={uid}>
        <circle cx="32" cy="33" r="21" fill="none" stroke={`url(#${uid}-gold)`} strokeWidth="5" />
        <circle cx="32" cy="33" r="21" fill="none" stroke="#fff7d1" strokeWidth="0.8" strokeDasharray="2 4" opacity="0.6" />
        <path d="M12 31 C20 28 26 28 28 33 M52 31 C44 28 38 28 36 33 M32 39 V53" stroke={`url(#${uid}-gold)`} strokeWidth="5" strokeLinecap="round" fill="none" />
        <circle cx="32" cy="34" r="7.5" fill="#111318" stroke={`url(#${uid}-gold)`} strokeWidth="2.4" />
        <path d="M32 29.6 L33.3 32.6 L36.5 32.8 L34 34.9 L34.8 38 L32 36.3 L29.2 38 L30 34.9 L27.5 32.8 L30.7 32.6 Z" fill={`url(#${uid}-gold)`} />
      </AdminFrame>
    ),
  },
];

export const PROFILE_AVATARS: (BasicAvatar | ArtAvatar)[] = [
  ...BASIC_AVATARS,
  ...PARTNER_AVATARS,
  ...ADMIN_AVATARS,
];

export const findProfileAvatar = (id: string | null | undefined) =>
  id ? PROFILE_AVATARS.find((avatar) => avatar.id === id) ?? null : null;

export const canUseAvatarTier = (
  tier: AvatarTier,
  access: { isPartner: boolean; isAdmin: boolean }
) => tier === "basic" || access.isAdmin || (tier === "partner" && access.isPartner);

type ProfileAvatarProps = {
  avatarId: string | null;
  initial: string;
  className?: string;
  frameId?: string | null;
  motionTier?: AvatarTier;
  animated?: boolean;
};

/** Art, achievement frame and account animation are independent choices. */
export function ProfileAvatar({ avatarId, initial, className = "", frameId = null, motionTier, animated = true }: ProfileAvatarProps) {
  const uid = useId().replace(/:/g, "");
  const avatar = findProfileAvatar(avatarId);
  const tier = motionTier ?? avatar?.tier ?? "basic";
  const ref = useAvatarMotion(animated);
  const frame = findAvatarFrame(frameId);
  const Icon = avatar?.tier === "basic" ? avatar.icon : null;
  return (
    <span ref={ref} className={`profile-avatar profile-avatar--${avatar?.tier ?? "initial"} ${className}`}
      data-motion-tier={tier} data-frame={frame?.tone ?? "default"} data-animated={animated}>
      <span className={`profile-avatar-face ${avatar?.tier === "basic" ? `bg-gradient-to-br ${avatar.tone}` : !avatar ? "bg-gradient-to-br from-sky-400 via-sky-500 to-blue-600" : ""}`}>
        <span className="profile-avatar-glyph">
          {Icon ? <Icon strokeWidth={2.1} aria-hidden="true" /> : avatar && avatar.tier !== "basic" ? avatar.art(uid) : initial}
        </span>
      </span>
    </span>
  );
}

export function ProfileAvatarFramesPicker({ selectedId, avatarId, initial, totalSpent, saving, onSelect, motionTier, statusError = false }: {
  selectedId: string | null; avatarId: string | null; initial: string;
  statusError?: boolean; motionTier?: AvatarTier; totalSpent: number | null; saving: boolean; onSelect: (id: string | null) => void;
}) {
  return <div className="profile-frame-picker">
    <p className="profile-frame-hint">Рамки відкриваються за сумою ваших замовлень. Оберіть стиль для свого аватара.</p>
    <div className="profile-frame-grid">
      {[null, ...PROFILE_AVATAR_FRAMES].map(frame => {
        const unlocked = !frame || (totalSpent !== null && totalSpent >= frame.threshold);
        const selected = selectedId === (frame?.id ?? null);
        const label = frame?.finish ?? "Класична";
        return <button key={frame?.id ?? "default"} type="button" className="profile-frame-option"
          aria-pressed={selected} disabled={saving || !unlocked}
          aria-label={`${label}${!unlocked && frame ? ` — від ${frame.threshold.toLocaleString("uk-UA")} грн` : ""}`}
          onClick={() => onSelect(frame?.id ?? null)}>
          <ProfileAvatar avatarId={avatarId} initial={initial} frameId={frame?.id} motionTier={motionTier} animated={false} />
          <span className="profile-frame-copy"><strong>{label}</strong><span>{frame ? frame.label : "Ваш базовий стиль"}</span>
            {frame && <small>{frame.threshold.toLocaleString("uk-UA")} грн</small>}</span>
          {selected ? <Check size={15} aria-hidden="true" /> : !unlocked ? <Lock size={14} aria-hidden="true" /> : null}
        </button>;
      })}
    </div>
    {totalSpent === null && !statusError && <p className="profile-frame-hint" role="status">Перевіряємо доступні рамки…</p>}
  </div>;
}

type ProfileAvatarPickerProps = {
  selectedId: string | null;
  initial: string;
  isPartner: boolean;
  isAdmin: boolean;
  saving: boolean;
  onSelect: (id: string | null) => void;
};

function PickerOption({
  id,
  label,
  initial,
  selected,
  locked,
  disabled,
  onSelect,
}: {
  id: string | null;
  label: string;
  initial: string;
  selected: boolean;
  locked: boolean;
  disabled: boolean;
  onSelect: (id: string | null) => void;
}) {
  return (
    <button
      type="button"
      className="profile-avatar-option"
      aria-pressed={selected}
      aria-label={locked ? `${label} — доступно партнерам` : label}
      title={label}
      disabled={locked || disabled}
      onClick={() => onSelect(id)}
    >
      <ProfileAvatar avatarId={id} initial={initial} animated={false} />
      {selected && (
        <span className="profile-avatar-option-check" aria-hidden="true">
          <Check size={11} strokeWidth={3} />
        </span>
      )}
      {locked && (
        <span className="profile-avatar-option-lock" aria-hidden="true">
          <Lock size={14} strokeWidth={2.4} />
        </span>
      )}
    </button>
  );
}

export function ProfileAvatarPicker({
  selectedId,
  initial,
  isPartner,
  isAdmin,
  saving,
  onSelect,
}: ProfileAvatarPickerProps) {
  const partnerUnlocked = isPartner || isAdmin;
  const option = (avatar: BasicAvatar | ArtAvatar, locked = false) => (
    <PickerOption
      key={avatar.id}
      id={avatar.id}
      label={avatar.label}
      initial={initial}
      selected={selectedId === avatar.id}
      locked={locked}
      disabled={saving}
      onSelect={onSelect}
    />
  );

  return (
    <div className="profile-avatar-picker" aria-busy={saving}>
      <section className="profile-avatar-group">
        <h3 className="profile-avatar-group-title">Базові</h3>
        <div className="profile-avatar-grid">
          <PickerOption
            id={null}
            label="Перша літера імені"
            initial={initial}
            selected={!selectedId}
            locked={false}
            disabled={saving}
            onSelect={onSelect}
          />
          {BASIC_AVATARS.map((avatar) => option(avatar))}
        </div>
      </section>

      <section className="profile-avatar-group profile-avatar-group--partner">
        <h3 className="profile-avatar-group-title">
          <Handshake size={13} aria-hidden="true" />
          Партнерські
        </h3>
        <div className="profile-avatar-grid">
          {PARTNER_AVATARS.map((avatar) => option(avatar, !partnerUnlocked))}
        </div>
        {!partnerUnlocked && (
          <p className="profile-avatar-group-note">
            Відкриваються разом зі статусом партнера PartsON.
          </p>
        )}
      </section>

      {isAdmin && (
        <section className="profile-avatar-group profile-avatar-group--admin">
          <h3 className="profile-avatar-group-title">
            <Crown size={13} aria-hidden="true" />
            Адміністраторські
          </h3>
          <div className="profile-avatar-grid">
            {ADMIN_AVATARS.map((avatar) => option(avatar))}
          </div>
        </section>
      )}
    </div>
  );
}
