import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle,
  Info,
  Lightbulb,
  Phone,
  type LucideIcon,
} from 'lucide-react';

// ─── Контакти ──────────────────────────────────────────────────────────────
export const PHONE_RAW = '+380634211851';
export const PHONE_DISPLAY = '+38 (063) 421-18-51';
export const DIAGNOSTICS_PHONE_RAW = '+380934804261';
export const DIAGNOSTICS_PHONE_DISPLAY = '+38 (093) 480-42-61';
export const ADDRESS = 'Львів, вул. Перфецького, 8';
export const MAPS_URL = 'https://www.google.com/maps/place/PartsON/@49.8177181,24.0058222,14.15z/data=!4m6!3m5!1s0x473ae70feda65713:0x9fd600e7cfbd0edd!8m2!3d49.8140387!4d23.9892492!16s%2Fg%2F11y4t3x15h?entry=ttu&g_ep=EgoyMDI2MDUxNy4wIKXMDSoASAFQAw%3D%3D';
export const MAPS_EMBED_URL = 'https://www.google.com/maps?cid=11517394092669341405&output=embed';
export const VIBER_URL = 'https://connect.viber.com/business/36969536-f36d-11f0-84df-f601f1189001';

export type TocItem = { id: string; label: string };

// ─── Тони ──────────────────────────────────────────────────────────────────
// Card chrome stays neutral (site-wide directory card language); only icon
// tiles and markers pick up a tone so sections stay scannable.
export type Tone = 'sky' | 'teal' | 'amber' | 'cyan' | 'rose' | 'indigo' | 'slate';

const TONE = {
  sky:    { tile: 'border-sky-200 bg-sky-50 text-sky-700',          mark: 'text-sky-500',    num: 'from-sky-500 to-cyan-500' },
  teal:   { tile: 'border-teal-200 bg-teal-50 text-teal-700',       mark: 'text-teal-500',   num: 'from-teal-500 to-emerald-500' },
  amber:  { tile: 'border-amber-200 bg-amber-50 text-amber-700',    mark: 'text-amber-500',  num: 'from-amber-500 to-orange-500' },
  cyan:   { tile: 'border-cyan-200 bg-cyan-50 text-cyan-700',       mark: 'text-cyan-500',   num: 'from-cyan-500 to-sky-500' },
  rose:   { tile: 'border-rose-200 bg-rose-50 text-rose-700',       mark: 'text-rose-500',   num: 'from-rose-500 to-pink-500' },
  indigo: { tile: 'border-indigo-200 bg-indigo-50 text-indigo-700', mark: 'text-indigo-500', num: 'from-indigo-500 to-sky-500' },
  slate:  { tile: 'border-slate-300 bg-slate-100 text-slate-600',   mark: 'text-slate-500',  num: 'from-slate-600 to-slate-400' },
} as const;

// ─── Інлайн-елементи ───────────────────────────────────────────────────────
export const Strong = ({ children }: { children: ReactNode }) => (
  <strong className="font-semibold text-slate-800">{children}</strong>
);

export const AddressMapLink = ({ className = '' }: { className?: string }) => (
  <a
    href={MAPS_URL}
    target="_blank"
    rel="noreferrer"
    className={`font-semibold text-slate-800 underline decoration-sky-300/70 underline-offset-4 transition hover:text-sky-700 hover:decoration-sky-500 ${className}`}
  >
    {ADDRESS}
  </a>
);

export const PartsOnLink = ({ className = '' }: { className?: string }) => (
  <Link
    href="/"
    className={`font-semibold text-sky-800 underline decoration-sky-300/70 underline-offset-4 transition hover:text-sky-600 hover:decoration-sky-500 ${className}`}
  >
    PartsON
  </Link>
);

export const InlineLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link
    href={href}
    className="font-semibold text-sky-800 underline decoration-sky-300/70 underline-offset-4 transition hover:text-sky-600 hover:decoration-sky-500"
  >
    {children}
  </Link>
);

export const ViberIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden="true">
    <path d="M11.918.002a23.04 23.04 0 0 1 5.455.784C20.147 1.77 22.393 3.66 23.238 6.49c.514 1.764.733 3.596.758 5.437.044 3.22-.45 6.31-2.287 9.012-1.498 2.198-3.672 3.334-6.233 3.72-1.338.2-2.695.224-4.046.236-.604.006-1.208-.036-1.811-.065-.193-.01-.36.05-.518.162-1.065.755-2.136 1.5-3.204 2.252-.153.107-.31.208-.498.196-.33-.022-.448-.277-.448-.573v-2.773c0-.206-.07-.32-.261-.412-2.163-1.045-3.49-2.803-4.035-5.118C.247 16.53.03 14.447.002 12.36c-.031-2.277.258-4.498 1.19-6.6C2.32 3.138 4.566 1.595 7.38.882A19.77 19.77 0 0 1 11.918.002zm5.27 13.567s.863.085 1.32-.528c.444-.592.616-1.57-.098-2.716-.71-1.14-2.06-2.45-2.96-2.8-.905-.35-1.438.23-1.6.448-.16.218-.345.437-.443.66-.134.304-.022.57.122.76.567.76 1.218 1.47 1.73 2.12.31.39.22.865-.066 1.13-.18.165-.468.38-.716.47-.264.094-.43-.1-.596-.28-.74-.82-1.516-1.62-2.26-2.44-.433-.474-.97-1.006-1.27-1.58-.33-.625-.15-1.254.195-1.786.13-.2.276-.39.41-.587.35-.504.3-.936-.087-1.417C9.7 5.04 9.002 4.24 8.37 3.64c-.317-.3-.718-.44-1.13-.29-.48.17-.96.46-1.34.84-.47.47-.72 1.08-.7 1.78.023.79.207 1.537.48 2.265 1.06 2.84 2.82 5.22 5.1 7.08 1.104.903 2.38 1.614 3.73 2.06.744.246 1.5.36 2.27.22.79-.147 1.35-.6 1.63-1.34.13-.34.17-.7.09-1.047a.988.988 0 0 0-.312-.54z" />
  </svg>
);

// ─── Блок статті (H2 + якір для змісту) ────────────────────────────────────
export const Block = ({
  id,
  kicker,
  title,
  lead,
  children,
}: {
  id: string;
  kicker?: string;
  title: ReactNode;
  lead?: ReactNode;
  children: ReactNode;
}) => (
  <section id={id} aria-labelledby={`${id}-title`} className="info-reveal scroll-mt-28">
    <header className="mb-5 max-w-3xl">
      {kicker ? (
        <p className="directory-kicker flex items-center gap-2 text-[10.5px] uppercase text-slate-500">
          <span className="info-accent-dot h-1.5 w-1.5 rounded-full" aria-hidden="true" />
          {kicker}
        </p>
      ) : null}
      <h2 id={`${id}-title`} className="mt-2 text-[22px] text-slate-900 sm:text-[27px]">
        {title}
      </h2>
      {lead ? (
        <p className="mt-2.5 text-[15px] font-medium leading-7 text-slate-600">{lead}</p>
      ) : null}
    </header>
    {children}
  </section>
);

// ─── Абзаци ────────────────────────────────────────────────────────────────
export const Prose = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`max-w-3xl space-y-4 text-[15px] font-medium leading-[1.8] text-slate-600 ${className}`}>
    {children}
  </div>
);

// ─── Картка ────────────────────────────────────────────────────────────────
export const Card = ({
  title,
  icon: Icon,
  tone = 'sky',
  children,
  className = '',
}: {
  title: ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) => (
  <article
    className={`group relative isolate flex h-full flex-col overflow-hidden rounded-[22px] border border-slate-200/80 bg-[linear-gradient(152deg,#ffffff_0%,rgba(248,250,252,0.96)_100%)] p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06),inset_0_1px_0_#fff] transition-[transform,border-color,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_24px_52px_rgba(15,23,42,0.09),0_8px_22px_rgba(14,165,233,0.08)] sm:p-6 ${className}`}
  >
    <span className="info-hero-sheen pointer-events-none absolute inset-x-6 top-0 h-[2px] rounded-full opacity-0 transition-opacity duration-300 group-hover:opacity-90" aria-hidden="true" />
    <div className="mb-4 flex items-center gap-3.5">
      <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border shadow-[0_8px_18px_rgba(15,23,42,0.05),inset_0_1px_0_rgba(255,255,255,0.9)] transition-transform duration-300 group-hover:scale-105 ${TONE[tone].tile}`}>
        <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <h3 className="min-w-0 flex-1 text-[17px] leading-[1.25] text-slate-900 sm:text-[18px]">{title}</h3>
    </div>
    <div className="text-[14.5px] font-medium leading-7 text-slate-600">{children}</div>
  </article>
);

// ─── Списки ────────────────────────────────────────────────────────────────
export const Li = ({ icon: Icon = CheckCircle, tone = 'sky', children }: { icon?: LucideIcon; tone?: Tone; children: ReactNode }) => (
  <li className="flex items-start gap-2.5">
    <span className={`mt-[5px] shrink-0 ${TONE[tone].mark}`}>
      <Icon size={15} strokeWidth={2} aria-hidden="true" />
    </span>
    <span className="min-w-0 text-[14.5px] font-medium leading-7 text-slate-600">{children}</span>
  </li>
);

export const List = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <ul className={`space-y-2.5 ${className}`}>{children}</ul>
);

// ─── Кроки ─────────────────────────────────────────────────────────────────
export type Step = { title: string; text: ReactNode };

export const Steps = ({ steps, tone = 'sky' }: { steps: Step[]; tone?: Tone }) => (
  <ol className={`relative grid gap-3 ${steps.length >= 4 ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-3'}`}>
    {steps.map((step, index) => (
      <li
        key={step.title}
        className="group relative flex gap-4 rounded-[20px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)] transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_18px_40px_rgba(14,165,233,0.1)] md:flex-col md:gap-3 md:p-5"
      >
        <span
          className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-gradient-to-br text-[15px] font-black text-white shadow-[0_10px_22px_rgba(14,165,233,0.25)] ${TONE[tone].num}`}
          aria-hidden="true"
        >
          {index + 1}
        </span>
        <div className="min-w-0">
          <h3 className="text-[16px] leading-snug text-slate-900">{step.title}</h3>
          <p className="mt-1.5 text-[14px] font-medium leading-6 text-slate-600">{step.text}</p>
        </div>
      </li>
    ))}
  </ol>
);

// ─── Виноска ───────────────────────────────────────────────────────────────
const CALLOUT = {
  info: { icon: Info,          box: 'border-sky-200 bg-sky-50/80',     icon_: 'bg-white text-sky-600 border-sky-200',     title: 'text-sky-900' },
  tip:  { icon: Lightbulb,     box: 'border-teal-200 bg-teal-50/80',   icon_: 'bg-white text-teal-600 border-teal-200',   title: 'text-teal-900' },
  warn: { icon: AlertTriangle, box: 'border-amber-200 bg-amber-50/80', icon_: 'bg-white text-amber-600 border-amber-200', title: 'text-amber-900' },
} as const;

export const Callout = ({
  tone = 'info',
  title,
  children,
  className = '',
}: {
  tone?: keyof typeof CALLOUT;
  title: string;
  children: ReactNode;
  className?: string;
}) => {
  const c = CALLOUT[tone];
  const Icon = c.icon;
  return (
    <aside className={`flex gap-3.5 rounded-[18px] border p-4 sm:p-5 ${c.box} ${className}`}>
      <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border shadow-sm ${c.icon_}`}>
        <Icon size={17} strokeWidth={2} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className={`text-[14.5px] font-extrabold ${c.title}`}>{title}</p>
        <div className="mt-1 text-[14px] font-medium leading-6 text-slate-700">{children}</div>
      </div>
    </aside>
  );
};

// ─── Таблиця порівняння ────────────────────────────────────────────────────
export const DataTable = ({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: string[];
  rows: ReactNode[][];
}) => (
  <div className="overflow-hidden rounded-[20px] border border-slate-200/80 bg-white/95 shadow-[0_14px_36px_rgba(15,23,42,0.055)]">
    <div className="overflow-x-auto [scrollbar-width:thin]">
      <table className="w-full min-w-[620px] border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="bg-[linear-gradient(135deg,#f0f9ff,#f0fdfa)]">
            {head.map((cell) => (
              <th
                key={cell}
                scope="col"
                className="border-b border-slate-200/80 px-4 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-slate-500"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="transition-colors hover:bg-sky-50/50">
              {row.map((cell, cellIndex) =>
                cellIndex === 0 ? (
                  <th
                    key={cellIndex}
                    scope="row"
                    className="border-b border-slate-100 px-4 py-3.5 align-top text-[14px] font-bold text-slate-900"
                  >
                    {cell}
                  </th>
                ) : (
                  <td
                    key={cellIndex}
                    className="border-b border-slate-100 px-4 py-3.5 align-top text-[14px] font-medium leading-6 text-slate-600"
                  >
                    {cell}
                  </td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// ─── Кнопки контактів ──────────────────────────────────────────────────────
export const ContactButtons = ({ phoneLabel }: { phoneLabel?: string }) => (
  <div className="flex flex-wrap gap-2.5">
    <a
      href={`tel:${PHONE_RAW}`}
      className="inline-flex min-h-11 items-center gap-2.5 rounded-xl border border-sky-200 bg-sky-50 px-4 text-[14px] font-bold text-sky-900 shadow-[0_8px_18px_rgba(14,165,233,0.08)] transition hover:-translate-y-0.5 hover:bg-sky-100 active:translate-y-0"
    >
      <Phone size={15} strokeWidth={2} className="shrink-0 text-sky-600" aria-hidden="true" />
      {phoneLabel ? `${phoneLabel}: ` : ''}
      {PHONE_DISPLAY}
    </a>
    <a
      href={VIBER_URL}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-11 items-center gap-2.5 rounded-xl border border-violet-200 bg-violet-50 px-4 text-[14px] font-bold text-violet-900 shadow-[0_8px_18px_rgba(139,92,246,0.08)] transition hover:-translate-y-0.5 hover:bg-violet-100 active:translate-y-0"
    >
      <span className="text-violet-500"><ViberIcon /></span>
      Написати у Viber
    </a>
  </div>
);
