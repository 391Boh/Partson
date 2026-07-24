import { memo, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Award,
  Activity,
  AlertTriangle,
  Building2,
  Car,
  CheckCircle,
  Clock,
  Cpu,
  CreditCard,
  Gauge,
  Info,
  MapPin,
  MessageCircle,
  Navigation,
  Package,
  Route,
  Phone,
  RefreshCcw,
  ShieldCheck,
  Star,
  Store,
  Truck,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

import {
  getInformationPath,
  informationSections,
  type InformationSectionKey,
} from './section-config';
import DiagnosticsConsultationForm from './DiagnosticsConsultationForm';
import AnalyticsConsentSettingsButton from 'app/components/AnalyticsConsentSettingsButton';
import {
  catalogPageBackgroundClass,
  directoryBadgeClass,
  directoryCompactMetricAccentClass,
  directoryCompactMetricClass,
  directoryPanelClass,
} from 'app/components/catalog-directory-styles';

// ─── Константи контактів ───────────────────────────────────────────────────
const PHONE_RAW = '+380634211851';
const PHONE_DISPLAY = '+38 (063) 421-18-51';
const DIAGNOSTICS_PHONE_RAW = '+380934804261';
const DIAGNOSTICS_PHONE_DISPLAY = '+38 (093) 480-42-61';
const ADDRESS = 'Львів, вул. Перфецького, 8';
const MAPS_URL = 'https://www.google.com/maps/place/PartsON/@49.8177181,24.0058222,14.15z/data=!4m6!3m5!1s0x473ae70feda65713:0x9fd600e7cfbd0edd!8m2!3d49.8140387!4d23.9892492!16s%2Fg%2F11y4t3x15h?entry=ttu&g_ep=EgoyMDI2MDUxNy4wIKXMDSoASAFQAw%3D%3D';
const MAPS_EMBED_URL = 'https://www.google.com/maps?cid=11517394092669341405&output=embed';
const VIBER_URL = 'https://connect.viber.com/business/36969536-f36d-11f0-84df-f601f1189001';
const DELIVERY_CITIES = [
  'Київ',
  'Харків',
  'Одеса',
  'Дніпро',
  'Запоріжжя',
  'Івано-Франківськ',
  'Тернопіль',
  'Рівне',
  'Луцьк',
  'Ужгород',
  'Чернівці',
  'Вінниця',
] as const;

// ─── Типи ──────────────────────────────────────────────────────────────────
type InfoCardProps = {
  title: ReactNode;
  icon: LucideIcon;
  accent?: 'sky' | 'emerald' | 'amber' | 'violet' | 'cyan' | 'rose' | 'slate';
  featured?: boolean;
  children: ReactNode;
};

type InformationPageClientProps = {
  initialSectionKey: InformationSectionKey;
};

// ─── Іконки вкладок ────────────────────────────────────────────────────────
const iconMap: Record<InformationSectionKey, LucideIcon> = {
  delivery: Truck,
  payment: CreditCard,
  about: Info,
  location: MapPin,
  privacy: ShieldCheck,
  warranty: Award,
  returns: RefreshCcw,
  diagnostics: Wrench,
};

const tabs = informationSections.map((s) => ({ ...s, icon: iconMap[s.key] }));

const AddressMapLink = ({ className = '' }: { className?: string }) => (
  <a
    href={MAPS_URL}
    target="_blank"
    rel="noreferrer"
    className={`font-semibold text-slate-700 underline decoration-sky-300/70 underline-offset-4 transition hover:text-sky-700 hover:decoration-sky-500 ${className}`}
  >
    {ADDRESS}
  </a>
);

const PartsOnLink = ({ className = '' }: { className?: string }) => (
  <Link
    href="/"
    className={`font-semibold text-sky-800 underline decoration-sky-300/70 underline-offset-4 transition hover:text-sky-600 hover:decoration-sky-500 ${className}`}
  >
    PartsON
  </Link>
);

// ─── Стилі акцентів ────────────────────────────────────────────────────────
// Card chrome stays neutral (matches the site-wide directory card language);
// only the icon tile picks up a touch of color so sections stay scannable
// without turning the page into a seven-color rainbow.
const ACCENT = {
  sky:     { wrap: 'border-sky-200     bg-sky-50      text-sky-700' },
  emerald: { wrap: 'border-teal-200    bg-teal-50     text-teal-700' },
  amber:   { wrap: 'border-amber-200   bg-amber-50    text-amber-700' },
  violet:  { wrap: 'border-slate-300   bg-slate-100   text-slate-600' },
  cyan:    { wrap: 'border-cyan-200    bg-cyan-50     text-cyan-700' },
  rose:    { wrap: 'border-rose-200    bg-rose-50     text-rose-700' },
  slate:   { wrap: 'border-slate-300   bg-slate-100   text-slate-600' },
} as const;

// ─── Компонент картки ──────────────────────────────────────────────────────
const InfoCard = memo(function InfoCard({ title, icon: Icon, accent = 'sky', featured = false, children }: InfoCardProps) {
  const a = ACCENT[accent];
  return (
    <article
      className={`group relative isolate flex h-full flex-col overflow-hidden rounded-[22px] border bg-[radial-gradient(circle_at_100%_0%,rgba(186,230,253,0.18),transparent_38%),radial-gradient(circle_at_0%_100%,rgba(153,246,228,0.10),transparent_42%),linear-gradient(148deg,rgba(255,255,255,0.995)_0%,rgba(248,251,254,0.98)_58%,rgba(244,249,249,0.95)_100%)] p-4 shadow-[0_16px_34px_rgba(15,23,42,0.075),0_4px_12px_rgba(14,116,144,0.045),inset_0_1px_0_rgba(255,255,255,0.98)] ring-1 ring-white/90 transition-[border-color,box-shadow,background-color] duration-300 ease-out hover:border-cyan-300/80 hover:shadow-[0_22px_42px_rgba(14,165,233,0.13),0_7px_18px_rgba(13,148,136,0.07),inset_0_1px_0_rgba(255,255,255,1)] sm:p-5 ${
        featured ? 'border-cyan-200/90 ring-cyan-100/80' : 'border-slate-200/85'
      }`}
    >
      <span className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/75 to-transparent opacity-70 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="relative z-10">
        <div className="mb-3.5 flex items-start gap-3 sm:items-center">
          <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] border shadow-[0_8px_18px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.9)] ${a.wrap}`}>
            <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <h2 className="directory-card-title min-w-0 flex-1 text-[16px] leading-tight text-slate-950">{title}</h2>
        </div>
        <div className="text-[13.5px] font-medium leading-6 text-slate-600">{children}</div>
      </div>
    </article>
  );
});

// ─── Пункт списку ──────────────────────────────────────────────────────────
const Li = ({ icon: Icon, cls, children }: { icon: LucideIcon; cls: string; children: ReactNode }) => (
  <li className="flex items-start gap-2.5">
    <span className={`mt-1 shrink-0 ${cls}`}><Icon size={15} strokeWidth={1.9} aria-hidden="true" /></span>
    <span className="text-[13.5px] font-medium leading-6 text-slate-600">{children}</span>
  </li>
);

// ─── Іконка Viber ──────────────────────────────────────────────────────────
const ViberIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden="true">
    <path d="M11.918.002a23.04 23.04 0 0 1 5.455.784C20.147 1.77 22.393 3.66 23.238 6.49c.514 1.764.733 3.596.758 5.437.044 3.22-.45 6.31-2.287 9.012-1.498 2.198-3.672 3.334-6.233 3.72-1.338.2-2.695.224-4.046.236-.604.006-1.208-.036-1.811-.065-.193-.01-.36.05-.518.162-1.065.755-2.136 1.5-3.204 2.252-.153.107-.31.208-.498.196-.33-.022-.448-.277-.448-.573v-2.773c0-.206-.07-.32-.261-.412-2.163-1.045-3.49-2.803-4.035-5.118C.247 16.53.03 14.447.002 12.36c-.031-2.277.258-4.498 1.19-6.6C2.32 3.138 4.566 1.595 7.38.882A19.77 19.77 0 0 1 11.918.002zm5.27 13.567s.863.085 1.32-.528c.444-.592.616-1.57-.098-2.716-.71-1.14-2.06-2.45-2.96-2.8-.905-.35-1.438.23-1.6.448-.16.218-.345.437-.443.66-.134.304-.022.57.122.76.567.76 1.218 1.47 1.73 2.12.31.39.22.865-.066 1.13-.18.165-.468.38-.716.47-.264.094-.43-.1-.596-.28-.74-.82-1.516-1.62-2.26-2.44-.433-.474-.97-1.006-1.27-1.58-.33-.625-.15-1.254.195-1.786.13-.2.276-.39.41-.587.35-.504.3-.936-.087-1.417C9.7 5.04 9.002 4.24 8.37 3.64c-.317-.3-.718-.44-1.13-.29-.48.17-.96.46-1.34.84-.47.47-.72 1.08-.7 1.78.023.79.207 1.537.48 2.265 1.06 2.84 2.82 5.22 5.1 7.08 1.104.903 2.38 1.614 3.73 2.06.744.246 1.5.36 2.27.22.79-.147 1.35-.6 1.63-1.34.13-.34.17-.7.09-1.047a.988.988 0 0 0-.312-.54z" />
  </svg>
);

// ─── Вкладки ───────────────────────────────────────────────────────────────
const DeliveryTab = () => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
    <div className="sm:col-span-2">
      <InfoCard title="Доставка автозапчастин у Львові та в кожне місто України" icon={Route} accent="sky" featured>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(260px,0.9fr)]">
          <div className="space-y-3">
            <p>
              <PartsOnLink /> організовує доставку автозапчастин у Львові та відправляє
              замовлення по всій Україні. Для клієнтів у Львові доступний самовивіз з{" "}
              <AddressMapLink className="text-sky-700" />, а для інших міст — доставка у
              відділення, поштомат або адресно через перевізника.
            </p>
            <p>
              Відправляємо запчастини для ТО, підвіски, гальмівної системи, двигуна,
              електроніки та інших товарних груп у Київ, Харків, Одесу, Дніпро,
              Івано-Франківськ, Тернопіль, Рівне, Луцьк та інші населені пункти України.
            </p>
          </div>

          <div className="rounded-2xl border border-sky-100 bg-[linear-gradient(145deg,rgba(255,255,255,0.95),rgba(240,249,255,0.9))] p-3 shadow-[0_12px_26px_rgba(14,165,233,0.08)]">
            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-sky-700">
              Міста доставки
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DELIVERY_CITIES.map((city) => (
                <span
                  key={city}
                  className="rounded-full border border-sky-100 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 shadow-sm"
                >
                  {city}
                </span>
              ))}
              <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700 shadow-sm">
                та кожне місто України
              </span>
            </div>
          </div>
        </div>
      </InfoCard>
    </div>

    <InfoCard title="Доставка по Україні" icon={Truck} accent="sky">
      <ul className="space-y-3">
        <Li icon={Package} cls="text-sky-500"><strong className="font-semibold text-slate-700">Нова Пошта</strong> — у відділення або адресна доставка</Li>
        <Li icon={Truck} cls="text-sky-500"><strong className="font-semibold text-slate-700">Укрпошта</strong> та <strong className="font-semibold text-slate-700">Meest</strong> — за запитом клієнта</Li>
        <Li icon={Clock} cls="text-sky-500">Відправка зазвичай <strong className="font-semibold text-slate-700">1–2 робочих дні</strong> після підтвердження</Li>
      </ul>
    </InfoCard>

    <InfoCard title="Доставка у Львові" icon={MapPin} accent="emerald" featured>
      <ul className="space-y-3">
        <Li icon={Navigation} cls="text-emerald-500">Доставка по Львову <strong className="font-semibold text-slate-700">за домовленістю</strong> з менеджером</Li>
        <Li icon={Building2} cls="text-emerald-500">Самовивіз з магазину <AddressMapLink className="text-emerald-700" /> за попереднім підтвердженням</Li>
        <Li icon={Store} cls="text-emerald-500">Можна узгодити отримання у день підтвердження, якщо товар є в наявності у Львові</Li>
      </ul>
    </InfoCard>

    <InfoCard title="Вартість доставки" icon={Wallet} accent="amber">
      <ul className="space-y-3">
        <Li icon={CheckCircle} cls="text-amber-500">По Україні — за <strong className="font-semibold text-slate-700">тарифами Нової Пошти</strong> залежно від ваги та розмірів посилки</Li>
        <Li icon={CheckCircle} cls="text-amber-500">По Львову — <strong className="font-semibold text-slate-700">за домовленістю</strong></Li>
      </ul>
    </InfoCard>

    <InfoCard title="Пакування та перевірка" icon={ShieldCheck} accent="cyan">
      <ul className="space-y-3">
        <Li icon={ShieldCheck} cls="text-cyan-500">Посилене пакування для <strong className="font-semibold text-slate-700">крихких і габаритних</strong> позицій</Li>
        <Li icon={CheckCircle} cls="text-cyan-500">Рекомендуємо перевіряти комплектність і стан посилки <strong className="font-semibold text-slate-700">під час отримання</strong></Li>
      </ul>
    </InfoCard>
  </div>
);

const PaymentTab = () => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
    <section className="relative overflow-hidden rounded-[24px] border border-emerald-100 bg-[radial-gradient(circle_at_100%_0%,rgba(52,211,153,0.13),transparent_38%),linear-gradient(145deg,rgba(255,255,255,0.99),rgba(240,253,250,0.94))] p-4 shadow-[0_16px_36px_rgba(15,23,42,0.07)] sm:col-span-2 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">
            Платіжний партнер
          </p>
          <h2 className="mt-1.5 text-lg font-black tracking-tight text-slate-900">
            Захищена онлайн-оплата через LiqPay
          </h2>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-600">
            Дані картки вводяться безпосередньо у захищеній формі LiqPay.
            PartsON не отримує і не зберігає номер картки, строк її дії або CVV-код.
          </p>
        </div>
        <a
          href="https://www.liqpay.ua/"
          target="_blank"
          rel="noreferrer"
          aria-label="Офіційний сайт LiqPay"
          className="shrink-0 rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition-[border-color,box-shadow] hover:border-emerald-200 hover:shadow-[0_12px_26px_rgba(16,185,129,0.10)]"
        >
          <Image
            src="/liqpay-logo.svg"
            alt="LiqPay"
            width={500}
            height={104}
            className="h-[25px] w-auto"
            priority
          />
        </a>
      </div>
    </section>

    <InfoCard title="Онлайн-оплата картою" icon={CreditCard} accent="emerald" featured>
      <ul className="space-y-3">
        <Li icon={CheckCircle} cls="text-emerald-500"><strong className="font-semibold text-slate-700">Visa / Mastercard</strong> через захищену платіжну форму LiqPay</Li>
        <Li icon={ShieldCheck} cls="text-emerald-500">Комісія платіжного сервісу не додається до вартості замовлення</Li>
        <Li icon={CheckCircle} cls="text-emerald-500">Замовлення вважається оплаченим після отримання успішного статусу від LiqPay</Li>
      </ul>
    </InfoCard>

    <InfoCard title="Оплата при отриманні" icon={Wallet} accent="amber">
      <ul className="space-y-3">
        <Li icon={Package} cls="text-amber-500">{"Оплата "}<strong className="font-semibold text-slate-700">у відділенні Нової Пошти</strong>{" або кур'єру після огляду"}</Li>
        <Li icon={CheckCircle} cls="text-amber-500">Можливість оглянути товар перед оплатою</Li>
      </ul>
    </InfoCard>

    <InfoCard title="Безготівковий розрахунок" icon={Building2} accent="sky">
      <ul className="space-y-3">
        <Li icon={CheckCircle} cls="text-sky-500">Повний пакет документів для <strong className="font-semibold text-slate-700">СТО, ФОП та компаній</strong></Li>
        <Li icon={Award} cls="text-sky-500">Рахунок, накладна, акт виконаних робіт</Li>
      </ul>
    </InfoCard>

    <InfoCard title="Гарантія та повернення" icon={RefreshCcw} accent="rose">
      <ul className="space-y-3">
        <Li icon={CheckCircle} cls="text-rose-500">Правила, строки та порядок оформлення описані на сторінці <Link href="/inform/returns" className="font-semibold text-slate-700 underline decoration-rose-300 underline-offset-4">«Повернення»</Link></Li>
        <Li icon={ShieldCheck} cls="text-rose-500">Умови отримання і тарифи перевізників наведені у розділі <Link href="/inform/delivery" className="font-semibold text-slate-700 underline decoration-rose-300 underline-offset-4">«Доставка»</Link></Li>
      </ul>
    </InfoCard>
  </div>
);

const AboutTab = () => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
    <div className="sm:col-span-2">
      <section className="relative overflow-hidden rounded-[28px] border border-sky-100/90 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(240,249,255,0.92)_54%,rgba(224,242,254,0.86))] p-3 shadow-[0_18px_44px_rgba(14,116,144,0.12)] ring-1 ring-white/80 sm:p-4 lg:p-5">
        <span className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-sky-200/32 blur-3xl" />
        <span className="pointer-events-none absolute -bottom-20 left-12 h-48 w-48 rounded-full bg-emerald-100/42 blur-3xl" />

        <div className="relative grid gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(300px,0.92fr)] lg:items-stretch">
          <div className="flex min-w-0 flex-col justify-between gap-4 rounded-[22px] border border-white/80 bg-white/68 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_12px_28px_rgba(14,165,233,0.08)] backdrop-blur sm:p-5">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-sky-800">
                <Star size={13} strokeWidth={2} aria-hidden="true" />
                Магазин у Львові
              </p>
              <h2 className="mt-3 font-display-italic text-[1.45rem] font-black leading-tight text-slate-950 sm:text-[1.9rem]">
                <PartsOnLink className="font-black" /> — точний підбір автозапчастин з першого разу
              </h2>
              <p className="mt-3 max-w-3xl text-[14px] font-medium leading-7 text-slate-600">
                Уточнюємо авто, перевіряємо сумісність деталі ще до оплати і пропонуємо оригінал
                або перевірений аналог — щоб ремонт не затягувався через помилку з підбором.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <span className="rounded-2xl border border-sky-100 bg-sky-50/86 px-3 py-3 shadow-sm">
                <span className="block text-[20px] font-black leading-none text-sky-800">20+</span>
                <span className="mt-1 block text-[11px] font-bold leading-snug text-slate-600">років досвіду на ринку</span>
              </span>
              <span className="rounded-2xl border border-emerald-100 bg-emerald-50/86 px-3 py-3 shadow-sm">
                <span className="block text-[20px] font-black leading-none text-emerald-800">VIN</span>
                <span className="mt-1 block text-[11px] font-bold leading-snug text-slate-600">перевірка сумісності</span>
              </span>
              <span className="rounded-2xl border border-cyan-100 bg-cyan-50/86 px-3 py-3 shadow-sm">
                <span className="block text-[20px] font-black leading-none text-cyan-800">UA</span>
                <span className="mt-1 block text-[11px] font-bold leading-snug text-slate-600">доставка по Україні</span>
              </span>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <a
                href={`tel:${PHONE_RAW}`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-[13px] font-extrabold text-sky-800 shadow-[0_10px_20px_rgba(14,165,233,0.08)] transition hover:bg-sky-100"
              >
                <Phone size={15} strokeWidth={2} aria-hidden="true" />
                Богдан: {PHONE_DISPLAY}
              </a>
              <a
                href={MAPS_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-center text-[13px] font-extrabold text-emerald-800 shadow-[0_10px_20px_rgba(16,185,129,0.08)] transition hover:bg-emerald-100"
              >
                <MapPin size={15} strokeWidth={2} aria-hidden="true" />
                Перфецького, 8
              </a>
            </div>
          </div>

          <figure className="relative min-h-[300px] overflow-hidden rounded-[24px] border border-sky-100/90 bg-sky-50 shadow-[0_18px_38px_rgba(14,165,233,0.14)] ring-1 ring-white/80">
            <Image
              src="/storefront/photos/partson-store-1.jpg"
              alt="Магазин автозапчастин PartsON у Львові на вул. Перфецького, 8"
              fill
              sizes="(min-width: 1024px) 360px, 100vw"
              className="object-cover"
            />
            <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/72 via-slate-950/28 to-transparent px-4 pb-4 pt-12 text-white">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-sky-100">
                Фото магазину <PartsOnLink className="text-sky-100" />
              </p>
              <p className="mt-1 text-sm font-extrabold">Львів, вул. Перфецького, 8</p>
            </figcaption>
          </figure>
        </div>
      </section>
    </div>

    <InfoCard title="Підбір і сумісність" icon={Users} accent="emerald">
      <ul className="space-y-3">
        <Li icon={CheckCircle} cls="text-emerald-500">Підбір запчастин за VIN-кодом, артикулом, кодом товару або параметрами авто.</Li>
        <Li icon={ShieldCheck} cls="text-emerald-500">Перевірка сумісності перед замовленням, щоб зменшити ризик помилки.</Li>
        <Li icon={MessageCircle} cls="text-emerald-500">Консультація по оригіналах, аналогах, наявності, термінах і ціні.</Li>
      </ul>
    </InfoCard>

    <InfoCard title="Категорії автозапчастин" icon={Car} accent="sky">
      <ul className="space-y-3">
        <Li icon={Wrench} cls="text-sky-500">Деталі для ТО, фільтри, оливи, ремені, ролики, свічки та витратні матеріали.</Li>
        <Li icon={Package} cls="text-sky-500">Підвіска, гальмівна система, двигун, охолодження, кузовні елементи й автоелектроніка.</Li>
        <Li icon={Star} cls="text-sky-500">Брендові запчастини та якісні аналоги для популярних європейських, японських і корейських авто.</Li>
      </ul>
    </InfoCard>

    <InfoCard title="Магазин у Львові" icon={Building2} accent="violet">
      <ul className="space-y-3">
        <Li icon={MapPin} cls="text-violet-500">Магазин <PartsOnLink className="text-violet-700" /> знаходиться у Львові за адресою <AddressMapLink className="text-violet-700" />.</Li>
        <Li icon={Clock} cls="text-violet-500">Можна отримати консультацію, оглянути товар і забрати замовлення самовивозом.</Li>
        <Li icon={Truck} cls="text-violet-500">Для клієнтів з інших міст працює доставка автозапчастин по Україні.</Li>
      </ul>
    </InfoCard>

    <InfoCard title="Підтримка після замовлення" icon={MessageCircle} accent="cyan">
      <ul className="space-y-3">
        <Li icon={Phone} cls="text-cyan-500">Менеджер зорієнтує по статусу замовлення, доставці, оплаті та можливих замінах.</Li>
        <Li icon={RefreshCcw} cls="text-cyan-500">Допоможемо з гарантійними питаннями, поверненням або обміном відповідно до умов товару.</Li>
        <Li icon={Award} cls="text-cyan-500">Наша мета — не просто продати деталь, а допомогти закрити ремонтну задачу правильно.</Li>
      </ul>
    </InfoCard>
  </div>
);

const diagnosticsBrandModels = [
  { brand: 'Audi', models: ['A3', 'A4', 'A5', 'A6', 'Q3', 'Q5', 'Q7'] },
  { brand: 'BMW', models: ['1 Series', '3 Series', '5 Series', 'X1', 'X3', 'X5'] },
  { brand: 'Mercedes-Benz', models: ['A-Class', 'C-Class', 'E-Class', 'GLA', 'GLC', 'Vito', 'Sprinter'] },
  { brand: 'Volkswagen', models: ['Golf', 'Passat', 'Polo', 'Tiguan', 'Touareg', 'Transporter', 'Caddy'] },
  { brand: 'Skoda', models: ['Fabia', 'Octavia', 'Superb', 'Rapid', 'Kodiaq', 'Karoq'] },
  { brand: 'Seat', models: ['Ibiza', 'Leon', 'Altea', 'Ateca', 'Tarraco'] },
  { brand: 'Opel', models: ['Astra', 'Vectra', 'Insignia', 'Zafira', 'Corsa', 'Vivaro'] },
  { brand: 'Ford', models: ['Fiesta', 'Focus', 'Mondeo', 'Kuga', 'Transit', 'S-Max'] },
  { brand: 'Renault', models: ['Clio', 'Megane', 'Scenic', 'Laguna', 'Logan', 'Duster', 'Trafic'] },
  { brand: 'Peugeot', models: ['206', '207', '308', '3008', '5008', 'Partner', 'Boxer'] },
  { brand: 'Citroen', models: ['C3', 'C4', 'C5', 'Berlingo', 'Jumpy', 'Jumper'] },
  { brand: 'Toyota', models: ['Yaris', 'Corolla', 'Camry', 'Avensis', 'RAV4', 'Land Cruiser'] },
  { brand: 'Lexus', models: ['IS', 'ES', 'GS', 'NX', 'RX', 'LX'] },
  { brand: 'Nissan', models: ['Micra', 'Juke', 'Qashqai', 'X-Trail', 'Note', 'Navara'] },
  { brand: 'Mazda', models: ['2', '3', '5', '6', 'CX-3', 'CX-5', 'CX-7'] },
  { brand: 'Honda', models: ['Civic', 'Accord', 'CR-V', 'HR-V', 'Jazz'] },
  { brand: 'Hyundai', models: ['i20', 'i30', 'Elantra', 'Sonata', 'Tucson', 'Santa Fe'] },
  { brand: 'Kia', models: ['Rio', 'Ceed', 'Cerato', 'Sportage', 'Sorento', 'Optima'] },
  { brand: 'Mitsubishi', models: ['Lancer', 'Outlander', 'Pajero', 'ASX', 'L200'] },
  { brand: 'Volvo', models: ['S40', 'S60', 'S80', 'V50', 'V70', 'XC60', 'XC90'] },
  { brand: 'Fiat', models: ['500', 'Panda', 'Punto', 'Doblo', 'Ducato'] },
  { brand: 'Jeep', models: ['Renegade', 'Compass', 'Cherokee', 'Grand Cherokee', 'Wrangler'] },
  { brand: 'Chevrolet', models: ['Aveo', 'Lacetti', 'Cruze', 'Captiva', 'Orlando'] },
];

const diagnosticsVisualCards = [
  {
    icon: Gauge,
    label: 'Двигун',
    text: 'ECU, Check Engine, паливна система',
    tone: 'from-sky-500/18 via-cyan-400/10 to-white/72 text-sky-700 border-sky-200/70',
  },
  {
    icon: Cpu,
    label: 'Електроніка',
    text: 'OBD-II/EOBD, блоки керування, CAN',
    tone: 'from-indigo-500/16 via-sky-400/10 to-white/72 text-indigo-700 border-indigo-200/70',
  },
  {
    icon: Activity,
    label: 'Датчики',
    text: 'MAF/MAP, ABS, кисень, температура',
    tone: 'from-amber-500/16 via-sky-400/10 to-white/72 text-amber-700 border-amber-200/70',
  },
] as const;

const DiagnosticsTab = () => (
  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
    <div className="lg:col-span-2">
      <InfoCard title="Комп'ютерна діагностика авто у Львові" icon={Wrench} accent="sky" featured>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.84fr)] lg:items-stretch">
          <div className="flex h-full flex-col justify-between gap-3 rounded-2xl border border-sky-100/90 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94)_46%,rgba(240,249,255,0.9))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_32px_rgba(14,165,233,0.08)] ring-1 ring-white/80 sm:p-4">
            <div className="space-y-3">
              <div className="space-y-3">
                <span className="inline-flex w-fit items-center gap-2 rounded-full border border-sky-200 bg-white px-3 py-1 text-[10.5px] font-black uppercase tracking-[0.14em] text-sky-800 shadow-sm">
                  <Cpu size={13} strokeWidth={2} aria-hidden="true" />
                  OBD-II / ECU / Check Engine
                </span>
                <div className="space-y-2">
                  <div className="grid grid-cols-[minmax(0,1fr)_74px] items-center gap-3 sm:grid-cols-[minmax(0,1fr)_92px]">
                    <h3 className="text-balance text-[24px] font-black leading-[1.08] text-slate-950 sm:text-[30px]">
                      Діагностика, яка знаходить причину несправності
                    </h3>
                    <figure className="grid h-[74px] w-[74px] place-items-center justify-self-end rounded-2xl border border-sky-100 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(224,242,254,0.86))] p-2 shadow-[0_10px_22px_rgba(14,165,233,0.1)] ring-1 ring-white/80 sm:h-[92px] sm:w-[92px] sm:p-2.5">
                      <Image
                        src="/Katlogo/datchyky_ta_elektronika.png"
                        alt="Комп'ютерна діагностика електроніки авто у Львові"
                        width={512}
                        height={512}
                        sizes="92px"
                        className="h-12 w-12 object-contain drop-shadow-[0_10px_16px_rgba(14,116,144,0.14)] sm:h-16 sm:w-16"
                      />
                    </figure>
                  </div>
                  <p className="text-[13.5px] leading-6 text-slate-600">
                    <PartsOnLink /> проводить <strong className="font-semibold text-slate-800">комп&apos;ютерну діагностику авто у Львові</strong>
                    {" "}для швидкого пошуку причин помилок і несправностей. Підключаємося через
                    OBD-II/EOBD, перевіряємо електронні блоки, розшифровуємо коди Check Engine,
                    ABS, ESP, SRS, АКПП та пояснюємо, що варто ремонтувати першим.
                  </p>
                </div>
                <p className="rounded-xl border border-sky-100 bg-white/78 px-3 py-2 text-[12.5px] font-semibold leading-relaxed text-slate-600 shadow-sm">
                  Діагностика корисна перед купівлею авто, після ремонту, при збільшеній витраті
                  пального, втраті тяги, ривках, аварійному режимі коробки або появі індикаторів
                  на панелі приладів.
                </p>
                <ul className="grid gap-1.5 text-[12.5px] font-semibold leading-relaxed text-slate-600 sm:grid-cols-2">
                  <Li icon={CheckCircle} cls="text-sky-500">Зчитування та розшифрування активних, збережених і періодичних помилок.</Li>
                  <Li icon={Activity} cls="text-sky-500">Перегляд параметрів у реальному часі: датчики, паливо, температура, напруга.</Li>
                  <Li icon={Route} cls="text-sky-500">Можливий виїзд по Львову або за межі міста за домовленістю.</Li>
                  <Li icon={Package} cls="text-sky-500">Після перевірки підбираємо потрібні запчастини під конкретну причину.</Li>
                </ul>
              </div>

              <div className="grid gap-2 sm:grid-cols-3" aria-label="Основні напрямки діагностики">
                {diagnosticsVisualCards.map((item) => {
                  const Icon = item.icon;

                  return (
                    <figure
                      key={item.label}
                      className={`relative min-h-[86px] overflow-hidden rounded-xl border bg-gradient-to-br p-2.5 shadow-[0_8px_18px_rgba(14,165,233,0.08)] ring-1 ring-white/70 transition-[border-color,box-shadow] duration-200 hover:shadow-[0_12px_24px_rgba(14,165,233,0.12)] ${item.tone}`}
                    >
                      <figcaption className="relative flex h-full items-center gap-2.5 sm:flex-col sm:items-start sm:justify-between">
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/80 bg-white/48 text-current shadow-[inset_0_1px_0_rgba(255,255,255,0.86),0_7px_16px_rgba(15,23,42,0.07)] backdrop-blur-md">
                          <Icon size={20} strokeWidth={1.9} aria-hidden="true" />
                        </span>
                        <span className="block min-w-0">
                          <span className="block text-[12.5px] font-black leading-tight text-slate-900">
                            {item.label}
                          </span>
                          <span className="mt-0.5 block text-[11px] font-semibold leading-snug text-slate-600">
                            {item.text}
                          </span>
                        </span>
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-2 text-[12px] font-semibold leading-relaxed text-slate-600 sm:grid-cols-2">
              <span className="relative overflow-hidden rounded-xl border border-amber-300/90 bg-[linear-gradient(135deg,rgba(255,251,235,0.98),rgba(254,243,199,0.94))] px-3 py-2.5 shadow-[0_10px_24px_rgba(245,158,11,0.14)] ring-1 ring-amber-100">
                <span className="relative flex items-start gap-2.5">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-white/75 text-amber-600 shadow-sm">
                    <Wallet size={15} strokeWidth={2} aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] font-black uppercase tracking-[0.08em] text-amber-700">
                      Вартість
                    </span>
                    <span className="mt-0.5 block text-[13px] font-black leading-snug text-slate-900">
                      За домовленістю
                    </span>
                    <span className="mt-0.5 block text-[11.5px] font-semibold leading-snug text-slate-600">
                      Після уточнення авто й симптомів.
                    </span>
                  </span>
                </span>
              </span>
              <span className="rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-2">
                Виїзд: Львів або за межі міста, орієнтовно від 500 грн.
              </span>
            </div>
          </div>
          <aside
            className="relative grid h-full content-start gap-3 self-stretch overflow-hidden rounded-[22px] border border-sky-100/90 bg-[linear-gradient(150deg,rgba(255,255,255,0.99)_0%,rgba(248,250,252,0.96)_48%,rgba(224,242,254,0.88)_100%)] p-3 text-slate-700 shadow-[0_16px_34px_rgba(14,116,144,0.1)] ring-1 ring-white/80 sm:p-3.5"
            aria-label="Запис на комп'ютерну діагностику авто"
          >
            <div className="relative rounded-[18px] border border-sky-100/90 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_10px_22px_rgba(14,165,233,0.08)] backdrop-blur-md">
              <p className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[10.5px] font-black uppercase tracking-[0.12em] text-sky-800">
                <Wrench size={13} strokeWidth={2} aria-hidden="true" />
                Запис на діагностику
              </p>
              <h3 className="mt-2 text-[20px] font-black leading-tight text-slate-900 sm:text-[22px]">
                Залиште заявку — уточнимо симптоми й час візиту
              </h3>
              <p className="mt-1.5 text-[12.5px] font-semibold leading-relaxed text-slate-600">
                Передзвонимо, підкажемо що підготувати, зорієнтуємо по вартості та за потреби
                одразу підберемо запчастини після перевірки.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <a
                href={`tel:${DIAGNOSTICS_PHONE_RAW}`}
                aria-label={`Подзвонити Роману для запису на комп'ютерну діагностику: ${DIAGNOSTICS_PHONE_DISPLAY}`}
                className="inline-flex min-h-10 flex-col items-center justify-center gap-0.5 rounded-xl border border-sky-200 bg-white px-4 py-2.5 text-center shadow-[0_10px_22px_rgba(14,165,233,0.1)] transition hover:bg-sky-50 active:scale-[0.98]"
              >
                <span className="inline-flex items-center gap-1.5 text-[10.5px] font-black uppercase tracking-[0.12em] text-sky-600">
                  <Phone size={13} strokeWidth={2} aria-hidden="true" />
                  Роман
                </span>
                <span className="text-[12.5px] font-extrabold text-sky-900">
                  {DIAGNOSTICS_PHONE_DISPLAY}
                </span>
              </a>
              <a
                href={MAPS_URL}
                target="_blank"
                rel="noreferrer"
                aria-label={`Відкрити адресу PartsON на карті: ${ADDRESS}`}
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-sky-100 bg-white/72 px-3 py-2 text-center text-[12px] font-semibold text-slate-600 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800"
              >
                <MapPin size={13} strokeWidth={2} aria-hidden="true" />
                {ADDRESS}
              </a>
            </div>

            <DiagnosticsConsultationForm />
          </aside>
        </div>
      </InfoCard>
    </div>

    <InfoCard title="Що перевіряємо комп'ютером" icon={Cpu} accent="emerald">
      <ul className="space-y-3">
        <Li icon={Activity} cls="text-emerald-500">Блок керування двигуном ECU: пропуски запалювання, суміш, датчики кисню, MAF/MAP, тиск палива, EGR, турбіна.</Li>
        <Li icon={ShieldCheck} cls="text-emerald-500">ABS, ESP, SRS Airbag, електропідсилювач керма, гальмівні системи та датчики швидкості коліс.</Li>
        <Li icon={Gauge} cls="text-emerald-500">АКПП, DSG, CVT, роботизовані коробки, температура, соленоїди, адаптації та аварійні режими.</Li>
        <Li icon={Car} cls="text-emerald-500">Комфортна електроніка: клімат, парктроніки, світло, центральний замок, CAN/LIN мережі.</Li>
      </ul>
    </InfoCard>

    <InfoCard title="Типи помилок і симптомів" icon={AlertTriangle} accent="amber">
      <ul className="space-y-3">
        <Li icon={AlertTriangle} cls="text-amber-500">Коди <strong className="font-semibold text-slate-700">P0/P1</strong> — двигун, паливна система, запалювання, екологія, турбіна.</Li>
        <Li icon={AlertTriangle} cls="text-amber-500">Коди <strong className="font-semibold text-slate-700">C</strong> — ходова, ABS, ESP, кермо, гальмівна електроніка.</Li>
        <Li icon={AlertTriangle} cls="text-amber-500">Коди <strong className="font-semibold text-slate-700">B</strong> — кузовна електроніка, SRS Airbag, комфорт, клімат і салонні модулі.</Li>
        <Li icon={AlertTriangle} cls="text-amber-500">Коди <strong className="font-semibold text-slate-700">U</strong> — зв&apos;язок між блоками, CAN/LIN, втрата комунікації та переривчасті несправності.</Li>
      </ul>
    </InfoCard>

    <InfoCard title="Як проходить діагностика" icon={CheckCircle} accent="cyan">
      <ul className="space-y-3">
        <Li icon={CheckCircle} cls="text-cyan-500">Підключаємо діагностичний сканер до OBD-роз&apos;єму та визначаємо доступні електронні блоки авто.</Li>
        <Li icon={CheckCircle} cls="text-cyan-500">Зчитуємо активні, збережені, очікувані та періодичні помилки, дивимося параметри в реальному часі.</Li>
        <Li icon={CheckCircle} cls="text-cyan-500">Пояснюємо, що саме означають коди, які причини найбільш ймовірні та які вузли варто перевірити першими.</Li>
        <Li icon={Package} cls="text-cyan-500">За потреби підбираємо запчастини: датчики, котушки, свічки, фільтри, гальмівні компоненти, елементи підвіски та електрики.</Li>
      </ul>
    </InfoCard>

    <InfoCard title="Коли варто приїхати" icon={Clock} accent="rose">
      <ul className="space-y-3">
        <Li icon={AlertTriangle} cls="text-rose-500">Горить Check Engine, ABS, ESP, Airbag, EPC, DPF, акумулятор або індикатор коробки передач.</Li>
        <Li icon={Activity} cls="text-rose-500">Авто погано заводиться, троїть, втрачає тягу, збільшилась витрата пального або з&apos;явились ривки.</Li>
        <Li icon={Gauge} cls="text-rose-500">Коробка переходить в аварійний режим, є затримки перемикання, поштовхи або помилки трансмісії.</Li>
        <Li icon={Car} cls="text-rose-500">Потрібна перевірка перед покупкою авто або після ремонту для контролю електронних систем.</Li>
      </ul>
    </InfoCard>

    <div className="lg:col-span-2">
      <InfoCard title="Марки та моделі, які можемо продіагностувати" icon={Car} accent="violet" featured>
        <div className="space-y-3">
          <p className="text-[13.5px] leading-relaxed text-slate-600">
            Виконуємо комп&apos;ютерну діагностику популярних європейських, японських,
            корейських та американських авто з підтримкою OBD-II/EOBD. Нижче наведені
            найчастіші марки й моделі, з якими працюємо у Львові.
          </p>
          <ul className="grid gap-x-5 gap-y-1.5 md:grid-cols-2 xl:grid-cols-3">
            {diagnosticsBrandModels.map(({ brand, models }) => (
              <li
                key={brand}
                className="border-b border-slate-200/70 py-1.5 text-[12.5px] leading-relaxed text-slate-600"
              >
                <strong className="font-extrabold text-slate-900">
                  Комп&apos;ютерна діагностика {brand}:
                </strong>{" "}
                <span>моделі {models.join(', ')}.</span>
              </li>
            ))}
          </ul>
          <p className="text-[12.5px] font-semibold leading-relaxed text-slate-500">
            Також можемо перевірити інші моделі та модифікації авто. Для точного запису
            вкажіть марку, модель, рік випуску, двигун або VIN у формі консультації.
          </p>
        </div>
      </InfoCard>
    </div>
  </div>
);

const LocationTab = () => (
  <div className="grid grid-cols-1 gap-4">
    <InfoCard title={<>Як знайти магазин <PartsOnLink /></>} icon={Navigation} accent="cyan" featured>
      <div className="space-y-3">
        <p>
          Магазин автозапчастин <PartsOnLink />{" "}
          розташований у Львові за адресою <AddressMapLink />.
          Тут можна швидко отримати консультацію, уточнити наявність деталей, погодити
          самовивіз замовлення та одразу побудувати маршрут до магазину.
        </p>
        <p>
          На сторінці локації зібрані карта проїзду, графік роботи, контакти для
          швидкого зв&apos;язку та інформація для клієнтів, які планують приїзд у магазин
          або хочуть заздалегідь зорієнтуватися по вулиці, входу та способу отримання замовлення.
        </p>
      </div>
    </InfoCard>

    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      <div className="grid gap-4 content-start">
      <InfoCard title="Адреса" icon={MapPin} accent="sky" featured>
        <ul className="space-y-3">
          <Li icon={MapPin} cls="text-sky-500"><AddressMapLink /></Li>
          <li className="pt-1">
            <a
              href={MAPS_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-[13px] font-semibold text-sky-800 transition hover:bg-sky-100 active:scale-95"
            >
              <Navigation size={14} strokeWidth={2} />
              Відкрити в Google Maps
            </a>
          </li>
        </ul>
      </InfoCard>

      <InfoCard title="Графік роботи" icon={Clock} accent="emerald">
        <ul className="space-y-2.5">
          <Li icon={CheckCircle} cls="text-emerald-500"><span><strong className="font-semibold text-slate-700">Пн–Сб:</strong> 08:00 — 18:00</span></Li>
          <Li icon={CheckCircle} cls="text-emerald-500"><span><strong className="font-semibold text-slate-700">Неділя:</strong> 08:00 — 16:00</span></Li>
          <Li icon={CheckCircle} cls="text-emerald-500"><span className="text-slate-500 text-[12px]">Щодня без вихідних</span></Li>
        </ul>
      </InfoCard>

      <InfoCard title="Контакти" icon={Phone} accent="violet">
        <div className="flex flex-col gap-2.5">
          <a
            href={`tel:${PHONE_RAW}`}
            className="inline-flex items-center gap-2.5 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-[15px] font-bold text-violet-900 transition hover:bg-violet-100 active:scale-95"
          >
            <Phone size={15} strokeWidth={2} className="shrink-0 text-violet-500" />
            {PHONE_DISPLAY}
          </a>
          <a
            href={VIBER_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2.5 rounded-xl border border-purple-200 bg-purple-50 px-4 py-2.5 text-[13px] font-semibold text-purple-900 transition hover:bg-purple-100 active:scale-95"
          >
            <span className="text-purple-500"><ViberIcon /></span>
            Написати у Viber
          </a>
        </div>
      </InfoCard>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 shadow-[0_4px_24px_rgba(15,23,42,0.10)] min-h-[320px] lg:min-h-0">
        <iframe
          title="PartsON — Карта Львів"
          src={MAPS_EMBED_URL}
          className="h-full min-h-[320px] w-full border-0 lg:min-h-[520px]"
          loading="lazy"
          allowFullScreen
          referrerPolicy="no-referrer-when-downgrade"
        />
        <div className="border-t border-slate-200/80 bg-white/95 px-4 py-3.5">
          <p className="text-[13px] leading-relaxed text-slate-600">
            Карта допоможе швидко побудувати маршрут до магазину <PartsOnLink /> за адресою{" "}
            <AddressMapLink className="text-sky-700" />, перевірити локацію для самовивозу
            та зорієнтуватися перед візитом у магазин автозапчастин.
          </p>
        </div>
      </div>
    </div>
  </div>
);

const PrivacyTab = () => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
    <div className="sm:col-span-2">
      <InfoCard title={<>Політика конфіденційності <PartsOnLink /></>} icon={ShieldCheck} accent="sky" featured>
        <div className="space-y-3">
          <p>
            Ця політика пояснює, як <PartsOnLink /> обробляє персональні дані клієнтів і
            відвідувачів сайту під час пошуку автозапчастин, оформлення замовлення,
            оплати, доставки, консультацій та звернень у чат або телефоном.
          </p>
          <p>
            Ми обробляємо дані відповідно до Закону України «Про захист персональних
            даних» та, коли це застосовно, з урахуванням принципів GDPR: законність,
            прозорість, мінімізація даних, обмеження мети, точність, захист і
            відповідальне зберігання.
          </p>
        </div>
      </InfoCard>
    </div>

    <InfoCard title="Які дані ми можемо збирати" icon={Users} accent="emerald">
      <ul className="space-y-3">
        <Li icon={CheckCircle} cls="text-emerald-500">Ім&apos;я, номер телефону, email та інші контактні дані, які ви надаєте для замовлення або консультації.</Li>
        <Li icon={Car} cls="text-emerald-500">Дані авто для підбору: марка, модель, рік, модифікація, VIN, артикул або код деталі.</Li>
        <Li icon={Package} cls="text-emerald-500">Дані доставки: місто, відділення перевізника, адреса доставки у Львові, обраний спосіб отримання.</Li>
        <Li icon={CreditCard} cls="text-emerald-500">Дані про оплату, статус платежу та номер транзакції. Повні реквізити банківської картки <PartsOnLink /> не зберігає.</Li>
      </ul>
    </InfoCard>

    <InfoCard title="Для чого використовуємо дані" icon={Info} accent="cyan">
      <ul className="space-y-3">
        <Li icon={CheckCircle} cls="text-cyan-500">Щоб оформити, підтвердити, оплатити, доставити або видати замовлення.</Li>
        <Li icon={ShieldCheck} cls="text-cyan-500">Щоб перевірити сумісність деталей, підібрати аналоги, уточнити ціну, наявність і строки постачання.</Li>
        <Li icon={MessageCircle} cls="text-cyan-500">Щоб відповідати на звернення, повідомляти про статус замовлення та надавати сервісну підтримку.</Li>
        <Li icon={Building2} cls="text-cyan-500">Щоб виконувати вимоги бухгалтерського, податкового, споживчого та іншого застосовного законодавства.</Li>
      </ul>
    </InfoCard>

    <InfoCard title="Кому можуть передаватися дані" icon={Truck} accent="amber">
      <ul className="space-y-3">
        <Li icon={Truck} cls="text-amber-500">Службам доставки: Нова Пошта, Укрпошта, Meest або іншим перевізникам, яких обирає клієнт.</Li>
        <Li icon={CreditCard} cls="text-amber-500">Платіжним сервісам і банкам для проведення онлайн-оплати або повернення коштів.</Li>
        <Li icon={MessageCircle} cls="text-amber-500">Google Customer Reviews — email, номер замовлення, країна та очікувана дата доставки для показу добровільної пропозиції залишити відгук після покупки.</Li>
        <Li icon={Building2} cls="text-amber-500">Постачальникам, сервісним партнерам, бухгалтерам, технічним провайдерам сайту — лише в межах необхідного.</Li>
        <Li icon={ShieldCheck} cls="text-amber-500">Державним органам — лише у випадках, прямо передбачених законом.</Li>
      </ul>
    </InfoCard>

    <InfoCard title="Захист і строки зберігання" icon={ShieldCheck} accent="violet">
      <ul className="space-y-3">
        <Li icon={ShieldCheck} cls="text-violet-500">Ми застосовуємо організаційні та технічні заходи для захисту даних від втрати, несанкціонованого доступу або розголошення.</Li>
        <Li icon={Clock} cls="text-violet-500">Дані зберігаються стільки, скільки потрібно для виконання замовлення, гарантійного супроводу, обліку та законних інтересів <PartsOnLink />.</Li>
        <Li icon={RefreshCcw} cls="text-violet-500">Після завершення необхідного строку дані видаляються, знеособлюються або архівуються відповідно до вимог законодавства.</Li>
      </ul>
    </InfoCard>

    <InfoCard title="Ваші права" icon={RefreshCcw} accent="rose">
      <ul className="space-y-3">
        <Li icon={CheckCircle} cls="text-rose-500">Отримати інформацію про обробку ваших персональних даних.</Li>
        <Li icon={CheckCircle} cls="text-rose-500">Попросити виправити, оновити, обмежити обробку або видалити дані, якщо це не суперечить закону.</Li>
        <Li icon={CheckCircle} cls="text-rose-500">Відкликати згоду на комунікації або заперечити проти окремих видів обробки.</Li>
        <Li icon={Phone} cls="text-rose-500">Звернутися до <PartsOnLink /> телефоном {PHONE_DISPLAY} або email: romaniukbboogg@gmail.com.</Li>
      </ul>
    </InfoCard>

    <InfoCard title="Cookies, аналітика та зміни політики" icon={Clock} accent="slate">
      <ul className="space-y-3">
        <Li icon={Info} cls="text-slate-500">Сайт використовує необхідні технології для роботи сервісу та, лише за вашим окремим вибором, Google Analytics для оцінки відвідуваності, пошуку й етапів оформлення замовлення.</Li>
        <Li icon={ShieldCheck} cls="text-slate-500">Рекламні технології Google, зберігання рекламних ідентифікаторів та персоналізація дозволяються лише після окремої згоди в налаштуваннях cookies. До вибору необов&apos;язкові Google-теги не завантажуються.</Li>
        <Li icon={RefreshCcw} cls="text-slate-500">Згоду на аналітику й рекламні дані можна надати, відхилити або відкликати незалежно в будь-який момент.</Li>
        <Li icon={ShieldCheck} cls="text-slate-500">Ми не продаємо персональні дані клієнтів третім особам.</Li>
        <Li icon={Clock} cls="text-slate-500">Політика може оновлюватися при зміні сервісів або законодавства. Актуальна версія завжди доступна на цій сторінці.</Li>
      </ul>
      <AnalyticsConsentSettingsButton
        label="Змінити налаштування cookies"
        className="mt-4 inline-flex min-h-10 items-center justify-center rounded-[12px] border border-sky-200 bg-sky-50 px-4 text-[12.5px] font-bold text-sky-800 transition hover:border-sky-300 hover:bg-sky-100"
      />
    </InfoCard>
  </div>
);

const WarrantyTab = () => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
    <div className="sm:col-span-2">
      <InfoCard title="Гарантія на автозапчастини" icon={Award} accent="emerald" featured>
        <p>
          Усі товари, що продаються в <PartsOnLink />, є{" "}
          <strong className="font-semibold text-slate-700">новими та оригінальними</strong> або
          сертифікованими аналогами від перевірених постачальників. Гарантійні строки залежать
          від товарної групи та виробника і уточнюються при оформленні замовлення.
        </p>
      </InfoCard>
    </div>

    <InfoCard title="Гарантійний строк" icon={Clock} accent="sky">
      <ul className="space-y-3">
        <Li icon={CheckCircle} cls="text-sky-500">Стандартний строк гарантії — <strong className="font-semibold text-slate-700">від 12 місяців</strong> залежно від виробника і категорії товару</Li>
        <Li icon={Info} cls="text-sky-500">Точний строк для конкретної позиції уточнюйте у менеджера при оформленні замовлення</Li>
      </ul>
    </InfoCard>

    <InfoCard title="Порядок гарантійного звернення" icon={MessageCircle} accent="cyan">
      <ul className="space-y-3">
        <Li icon={CheckCircle} cls="text-cyan-500">Зв&apos;яжіться з менеджером по телефону або у Viber з описом проблеми і датою покупки</Li>
        <Li icon={Package} cls="text-cyan-500">Підготуйте товар у вигляді, в якому він надійшов, разом з документами про покупку</Li>
        <Li icon={ShieldCheck} cls="text-cyan-500">Гарантія не поширюється на дефекти, спричинені неправильним монтажем або механічними пошкодженнями</Li>
      </ul>
    </InfoCard>

    <InfoCard title="Якість товарів" icon={Star} accent="amber">
      <ul className="space-y-3">
        <Li icon={CheckCircle} cls="text-amber-500">Постачаємо лише <strong className="font-semibold text-slate-700">перевірені бренди</strong> — виробники з підтвердженою якістю</Li>
        <Li icon={Award} cls="text-amber-500">Перед відправленням кожне замовлення проходить перевірку комплектності та відповідності</Li>
      </ul>
    </InfoCard>

    <InfoCard title="Контакти для гарантійних питань" icon={Phone} accent="violet">
      <div className="flex flex-col gap-2.5">
        <a
          href="tel:+380634211851"
          className="inline-flex items-center gap-2.5 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-[15px] font-bold text-violet-900 transition hover:bg-violet-100 active:scale-95"
        >
          <Phone size={15} strokeWidth={2} className="shrink-0 text-violet-500" />
          +38 (063) 421-18-51
        </a>
      </div>
    </InfoCard>
  </div>
);

const ReturnsTab = () => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
    <div className="sm:col-span-2">
      <InfoCard title="Умови повернення товару" icon={RefreshCcw} accent="sky" featured>
        <p>
          Повернення та обмін товарів здійснюються відповідно до{" "}
          <strong className="font-semibold text-slate-700">Закону України «Про захист прав споживачів»</strong>.
          Якщо товар не підійшов або виявився дефектним, зверніться до менеджера для узгодження
          порядку повернення.
        </p>
      </InfoCard>
    </div>

    <InfoCard title="Строки повернення" icon={Clock} accent="emerald">
      <ul className="space-y-3">
        <Li icon={CheckCircle} cls="text-emerald-500">Товар належної якості можна повернути або обміняти протягом <strong className="font-semibold text-slate-700">14 днів</strong> з дати отримання</Li>
        <Li icon={CheckCircle} cls="text-emerald-500">Товар неналежної якості (виробничий дефект) — протягом гарантійного строку</Li>
      </ul>
    </InfoCard>

    <InfoCard title="Вимоги до товару" icon={Package} accent="cyan">
      <ul className="space-y-3">
        <Li icon={CheckCircle} cls="text-cyan-500">Товар має бути у <strong className="font-semibold text-slate-700">незміненому вигляді</strong>: не встановлювався, не монтувався, збережена заводська упаковка</Li>
        <Li icon={Info} cls="text-cyan-500">Збережіть документи, що підтверджують покупку (накладна, квитанція, чек)</Li>
      </ul>
    </InfoCard>

    <InfoCard title="Процедура повернення" icon={MessageCircle} accent="amber">
      <ul className="space-y-3">
        <Li icon={CheckCircle} cls="text-amber-500">Зв&apos;яжіться з менеджером телефоном або у Viber для узгодження деталей повернення</Li>
        <Li icon={Truck} cls="text-amber-500">Спосіб повернення (самовивіз у Львові або відправлення перевізником) узгоджується індивідуально</Li>
        <Li icon={Wallet} cls="text-amber-500">Кошти за товар повертаються після підтвердження стану і комплектності повернутої позиції</Li>
      </ul>
    </InfoCard>

    <InfoCard title="Винятки та обмеження" icon={Info} accent="rose">
      <ul className="space-y-3">
        <Li icon={Info} cls="text-rose-500">Деякі категорії товарів (зокрема, електронні компоненти) можуть мати обмеження повернення згідно із законодавством</Li>
        <Li icon={ShieldCheck} cls="text-rose-500">Точні умови для конкретної позиції уточнюйте у менеджера перед покупкою</Li>
      </ul>
    </InfoCard>

    <InfoCard title="Контакти для звернень" icon={Phone} accent="violet">
      <div className="flex flex-col gap-2.5">
        <a
          href="tel:+380634211851"
          className="inline-flex items-center gap-2.5 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-[15px] font-bold text-violet-900 transition hover:bg-violet-100 active:scale-95"
        >
          <Phone size={15} strokeWidth={2} className="shrink-0 text-violet-500" />
          +38 (063) 421-18-51
        </a>
      </div>
    </InfoCard>
  </div>
);

// ─── Вміст по ключу вкладки ────────────────────────────────────────────────
const renderTabContent = (key: InformationSectionKey) => {
  switch (key) {
    case 'delivery': return <DeliveryTab />;
    case 'payment':  return <PaymentTab />;
    case 'about':    return <AboutTab />;
    case 'location': return <LocationTab />;
    case 'privacy':  return <PrivacyTab />;
    case 'warranty': return <WarrantyTab />;
    case 'returns':  return <ReturnsTab />;
    case 'diagnostics': return <DiagnosticsTab />;
    default:         return <DeliveryTab />;
  }
};

// ─── Головний компонент ────────────────────────────────────────────────────
export default function InformationPageClient({ initialSectionKey }: InformationPageClientProps) {
  const activeTab = tabs.find((tab) => tab.key === initialSectionKey) || tabs[0];
  const activeDescription = activeTab.intro;

  const ActiveIcon = activeTab.icon;

  return (
    <main className={`${catalogPageBackgroundClass} min-h-screen py-5 sm:py-7`}>
      <div className="page-shell-inline">
        <div className="space-y-4 sm:space-y-5">
          {/* Хлібні крихти */}
          <nav aria-label="Навігаційні хлібні крихти">
            <ol className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
              <li className="inline-flex items-center gap-2">
                <Link href="/" className="transition hover:text-slate-800">Головна</Link>
              </li>
              <li className="inline-flex items-center gap-2">
                <span aria-hidden="true">/</span>
                <span className="text-slate-500">Інформація</span>
              </li>
              <li className="inline-flex items-center gap-2">
                <span aria-hidden="true">/</span>
                <span className="text-slate-700">{activeTab.title}</span>
              </li>
            </ol>
          </nav>

          {/* Заголовок сторінки */}
          <section className="relative overflow-hidden rounded-[30px] border border-white/90 bg-[radial-gradient(circle_at_5%_0%,rgba(14,165,233,0.14),transparent_36%),radial-gradient(circle_at_96%_6%,rgba(20,184,166,0.13),transparent_38%),linear-gradient(138deg,rgba(255,255,255,0.995)_0%,rgba(247,251,254,0.98)_56%,rgba(241,249,247,0.95)_100%)] p-4 shadow-[0_30px_72px_rgba(15,23,42,0.10),0_8px_26px_rgba(14,165,233,0.055)] ring-1 ring-slate-200/60 sm:p-5 lg:p-6">
            <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent" />

            <div className="relative grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center lg:gap-5">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] border border-white/95 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(239,249,253,0.94),rgba(232,248,243,0.90))] text-sky-700 shadow-[0_16px_36px_rgba(15,23,42,0.09),inset_0_1px_0_rgba(255,255,255,1)] ring-1 ring-sky-100/80 sm:h-20 sm:w-20">
                <ActiveIcon size={28} strokeWidth={1.7} aria-hidden="true" />
              </span>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={directoryBadgeClass}>Інформація для клієнтів</span>
                  <span className={directoryCompactMetricClass}>Магазин у Львові</span>
                  <span className={directoryCompactMetricAccentClass}>{PHONE_DISPLAY}</span>
                </div>

                <h1 className="directory-heading-hero mt-3 text-[1.55rem] leading-[1.12] text-slate-950 sm:text-[2.15rem]">
                  {activeTab.seoTitle}
                </h1>
                <p className="mt-3 max-w-4xl text-sm font-medium leading-6 text-slate-600 sm:text-[15px]">
                  {activeDescription}
                </p>
              </div>
            </div>
          </section>

          {/* Навігаційні вкладки */}
          <nav aria-label="Розділи інформації" className={`${directoryPanelClass} p-2 sm:p-2.5`}>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-2">
              {tabs.map((tab) => {
                const isActive = tab.key === activeTab.key;
                const Icon = tab.icon;
                return (
                  <Link
                    key={tab.key}
                    href={getInformationPath(tab.key)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`group relative overflow-hidden rounded-[15px] border px-3 py-3 text-left transition-[border-color,box-shadow,background-color] duration-250 ${
                      isActive
                        ? 'border-cyan-300/90 bg-[radial-gradient(circle_at_100%_0%,rgba(45,212,191,0.16),transparent_42%),linear-gradient(140deg,rgba(240,253,255,0.98),rgba(230,246,252,0.95))] text-cyan-950 shadow-[0_12px_26px_rgba(8,145,178,0.13),inset_0_1px_0_rgba(255,255,255,0.94)]'
                        : 'border-slate-200/85 bg-white/86 text-slate-700 shadow-[0_7px_18px_rgba(15,23,42,0.035)] hover:border-sky-200 hover:bg-white hover:shadow-[0_11px_24px_rgba(14,165,233,0.08)]'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition ${
                          isActive
                            ? 'border-cyan-200 bg-white text-cyan-700'
                            : 'border-slate-200 bg-slate-50 text-slate-500 group-hover:text-slate-700'
                        }`}
                      >
                        <Icon size={13} strokeWidth={isActive ? 2.2 : 1.8} aria-hidden="true" />
                      </span>
                      <span className="directory-card-title min-w-0 break-words text-[13px] leading-snug text-inherit">{tab.title}</span>
                    </div>
                    <p className={`mt-1 pl-8 text-[11px] font-medium leading-snug ${isActive ? 'text-cyan-800/80' : 'text-slate-400'}`}>
                      {tab.subtitle}
                    </p>
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* Вміст вкладки */}
          <div>{renderTabContent(activeTab.key)}</div>
        </div>
      </div>
    </main>
  );
}
