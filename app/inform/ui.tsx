import type { CSSProperties, ReactNode } from 'react';
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
// A tone only tints a panel and its markers, so neighbouring panels read as
// different kinds of information without each getting its own shadowed card.
export type Tone = 'sky' | 'teal' | 'amber' | 'cyan' | 'rose' | 'indigo' | 'slate';

const TONE = {
  sky:    { panel: 'border-sky-100 bg-sky-50/60',       mark: 'text-sky-600' },
  teal:   { panel: 'border-teal-100 bg-teal-50/60',     mark: 'text-teal-600' },
  amber:  { panel: 'border-amber-100 bg-amber-50/70',   mark: 'text-amber-600' },
  cyan:   { panel: 'border-cyan-100 bg-cyan-50/60',     mark: 'text-cyan-700' },
  rose:   { panel: 'border-rose-100 bg-rose-50/60',     mark: 'text-rose-600' },
  indigo: { panel: 'border-indigo-100 bg-indigo-50/55', mark: 'text-indigo-600' },
  slate:  { panel: 'border-slate-200 bg-slate-50/80',   mark: 'text-slate-500' },
} as const;

// ─── Інлайн-елементи ───────────────────────────────────────────────────────
export const Strong = ({ children }: { children: ReactNode }) => (
  <strong className="font-semibold text-[#13202f]">{children}</strong>
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
// A consistent heading and generous spacing group each section.
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
  <section
    id={id}
    aria-labelledby={`${id}-title`}
    className="info-text-section relative scroll-mt-28"
  >
    <div className="info-section-body min-w-0">
      <header className="info-section-heading mb-8 max-w-[46rem]">
        {kicker ? (
          <p className="info-read info-section-kicker mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12px] info-read-accent">
            {kicker}
          </p>
        ) : null}
        <h2 id={`${id}-title`} className="text-[23px] leading-[1.2] text-[#13202f] sm:text-[28px]">
          {title}
        </h2>
        {lead ? (
          <p className="info-read mt-3 text-[16.5px] leading-[1.7]">{lead}</p>
        ) : null}
      </header>
      <div className="info-section-content space-y-8">{children}</div>
    </div>
  </section>
);

// ─── Абзаци ────────────────────────────────────────────────────────────────
export const Prose = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div
    className={`info-read info-prose max-w-[42rem] space-y-4 text-[16px] leading-[1.8] [&>p:first-child]:text-[17px] [&>p:first-child]:leading-[1.75] ${className}`}
  >
    {children}
  </div>
);

// ─── Панель ────────────────────────────────────────────────────────────────
// Accent icons distinguish the types of information inside each section.
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
  <article className={`info-content-card flex h-full flex-col rounded-[20px] border p-5 sm:p-6 ${TONE[tone].panel} ${className}`}>
    <h3 className="flex items-center gap-3 text-[17px] leading-[1.3] text-[#13202f] sm:text-[18px]">
      <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] border border-white bg-white/90 shadow-sm ${TONE[tone].mark}`}>
        <Icon size={21} strokeWidth={1.9} aria-hidden="true" />
      </span>
      <span className="min-w-0 break-words">{title}</span>
    </h3>
    <div className="info-read mt-5 text-[15.5px] leading-[1.8]">{children}</div>
  </article>
);

// ─── Списки ────────────────────────────────────────────────────────────────
export const Li = ({ icon: Icon = CheckCircle, tone = 'sky', children }: { icon?: LucideIcon; tone?: Tone; children: ReactNode }) => (
  <li className="info-list-item flex items-start gap-3">
    <span className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-white/90 ${TONE[tone].mark}`}>
      <Icon size={15} strokeWidth={2} aria-hidden="true" />
    </span>
    <span className="info-read min-w-0 text-[15.5px] leading-[1.7]">{children}</span>
  </li>
);

export const List = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <ul className={`space-y-4 ${className}`}>{children}</ul>
);

// ─── Кроки ─────────────────────────────────────────────────────────────────
// A real sequence, so it gets numbers — on one connected track rather than a
// row of identical cards: horizontal from md, a vertical line on phones.
export type Step = { title: string; text: ReactNode };

export const Steps = ({ steps }: { steps: Step[]; tone?: Tone }) => (
  <ol
    className={`info-step-track relative grid gap-6 md:gap-5 ${
      steps.length >= 4 ? 'md:grid-cols-4' : steps.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'
    }`}
    style={{ '--steps': Math.min(Math.max(steps.length, 2), 4) } as CSSProperties}
  >
    {steps.map((step, index) => (
      <li key={step.title} className="info-step-card relative flex gap-4 rounded-[18px] border border-slate-200/80 bg-white/90 p-5 md:flex-col md:gap-3.5">
        <span
          className="info-accent-bg relative z-[1] inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[14px] font-bold text-white ring-[5px] ring-[#f3f8fb]"
          aria-hidden="true"
        >
          {index + 1}
        </span>
        <div className="min-w-0 pt-1 md:pt-0">
          <h3 className="text-[16.5px] leading-snug text-[#13202f]">{step.title}</h3>
          <p className="info-read mt-1.5 text-[15px] leading-[1.65]">{step.text}</p>
        </div>
      </li>
    ))}
  </ol>
);

// ─── Виноска ───────────────────────────────────────────────────────────────
const CALLOUT = {
  info: { icon: Info,          box: 'border-sky-400 bg-sky-50/80',     icon_: 'text-sky-600',   title: 'text-sky-950' },
  tip:  { icon: Lightbulb,     box: 'border-teal-400 bg-teal-50/80',   icon_: 'text-teal-600',  title: 'text-teal-950' },
  warn: { icon: AlertTriangle, box: 'border-amber-400 bg-amber-50/90', icon_: 'text-amber-600', title: 'text-amber-950' },
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
    <aside
      className={`info-callout rounded-[18px] border-l-[3px] py-4 pl-4 pr-5 sm:pl-5 ${
        /\bmax-w-/.test(className) ? '' : 'max-w-[46rem]'
      } ${c.box} ${className}`}
    >
      <p className={`flex items-center gap-2 text-[15.5px] font-bold ${c.title}`}>
        <Icon size={17} strokeWidth={2} className={`shrink-0 ${c.icon_}`} aria-hidden="true" />
        {title}
      </p>
      <div className="info-read mt-1.5 text-[15px] leading-[1.7]">{children}</div>
    </aside>
  );
};

// ─── Таблиця порівняння ────────────────────────────────────────────────────
// A table from sm up; on phones each row becomes a small stacked block with
// the column name before every value, instead of a sideways-scrolling grid.
export const DataTable = ({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: string[];
  rows: ReactNode[][];
}) => (
  <div className="overflow-hidden rounded-[18px] border border-[#d9e3ec] bg-white/90">
    <table className="info-read w-full border-collapse text-left">
      <caption className="sr-only">{caption}</caption>
      <thead className="hidden sm:table-header-group">
        <tr className="border-b border-[#d9e3ec] bg-[color:color-mix(in_srgb,var(--info-a)_7%,white)]">
          {head.map((cell) => (
            <th key={cell} scope="col" className="px-4 py-3 text-[13.5px] font-semibold text-[#13202f]">
              {cell}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr
            key={rowIndex}
            className="block border-b border-[#e6edf3] px-4 py-3.5 last:border-b-0 sm:table-row sm:p-0 sm:even:bg-slate-50/60"
          >
            {row.map((cell, cellIndex) =>
              cellIndex === 0 ? (
                <th
                  key={cellIndex}
                  scope="row"
                  className="block pb-1.5 text-[15.5px] font-semibold leading-6 text-[#13202f] sm:table-cell sm:px-4 sm:py-3.5 sm:align-top sm:text-[15px]"
                >
                  {cell}
                </th>
              ) : (
                <td
                  key={cellIndex}
                  data-label={head[cellIndex]}
                  className="grid grid-cols-[minmax(84px,38%)_minmax(0,1fr)] gap-3 py-0.5 text-[14.5px] leading-6 before:text-[13px] before:text-slate-500 before:content-[attr(data-label)] sm:table-cell sm:px-4 sm:py-3.5 sm:align-top sm:text-[15px] sm:before:content-none"
                >
                  <span className="min-w-0">{cell}</span>
                </td>
              )
            )}
          </tr>
        ))}
      </tbody>
    </table>
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
