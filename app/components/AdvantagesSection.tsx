import type { ComponentType, ReactNode, SVGProps } from "react";
import Link from "next/link";
import {
  BuildingStorefrontIcon,
  CheckBadgeIcon,
  CreditCardIcon,
  PhoneIcon,
  SparklesIcon,
  TruckIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import AdvantagesPhotoSlider from "./AdvantagesPhotoSlider";

const STORE_MAPS_URL =
  "https://www.google.com/maps/place/PartsON/@49.8177181,24.0058222,14.15z/data=!4m6!3m5!1s0x473ae70feda65713:0x9fd600e7cfbd0edd!8m2!3d49.8140387!4d23.9892492!16s%2Fg%2F11y4t3x15h?entry=ttu&g_ep=EgoyMDI2MDUxNy4wIKXMDSoASAFQAw%3D%3D";

const PartsOnLink = ({ className = "" }: { className?: string }) => (
  <Link
    href="/"
    className={`font-extrabold text-sky-800 underline decoration-sky-300/70 underline-offset-4 transition hover:text-sky-600 hover:decoration-sky-500 ${className}`}
  >
    PartsON
  </Link>
);

type AdvantagePanel = {
  title: string;
  eyebrow: string;
  summary: ReactNode;
  points: string[];
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  iconTone: string;
  glowTone: string;
  markerTone: string;
};

const advantagePanels: AdvantagePanel[] = [
  {
    title: "Підбір і сумісність",
    eyebrow: "VIN-код, артикул, параметри авто",
    summary:
      "Підбираємо сумісні автозапчастини за VIN-кодом, артикулом і параметрами авто, щоб зменшити ризик помилки до оформлення замовлення.",
    points: [
      "Підбір запчастин за VIN-кодом, артикулом і моделлю автомобіля.",
      "Пояснюємо різницю між оригінальними автозапчастинами та перевіреними аналогами.",
      "Зменшуємо ризик помилки ще до оформлення замовлення й оплати.",
    ],
    icon: CheckBadgeIcon,
    iconTone: "bg-sky-100 text-sky-700 border-sky-200/90",
    glowTone: "bg-sky-200/45",
    markerTone: "bg-sky-50 text-sky-700 border-sky-200/80",
  },
  {
    title: "Каталог і вигідний вибір",
    eyebrow: "Оригінали, аналоги, популярні категорії",
    summary: (
      <>
        У каталозі <PartsOnLink /> зручно шукати оригінальні автозапчастини й
        аналоги для ТО, підвіски, двигуна, гальм, охолодження та електроніки.
      </>
    ),
    points: [
      "Каталог автозапчастин онлайн для популярних марок і моделей авто.",
      "Розумний баланс між ціною, якістю та реальною наявністю товару.",
      "Допомагаємо обрати оптимальний варіант під бюджет і задачу ремонту.",
    ],
    icon: WrenchScrewdriverIcon,
    iconTone: "bg-indigo-100 text-indigo-700 border-indigo-200/90",
    glowTone: "bg-indigo-200/40",
    markerTone: "bg-indigo-50 text-indigo-700 border-indigo-200/80",
  },
  {
    title: "Доставка, оплата і підтримка",
    eyebrow: "Львів, самовивіз, Україна і зручний розрахунок",
    summary:
      "Замовляйте запчастини онлайн із доставкою по Україні або самовивозом у Львові. Підкажемо терміни, наявність і зручний спосіб оплати.",
    points: [
      "Купити автозапчастини у Львові можна зі зручним самовивозом із магазину.",
      "Швидка доставка автозапчастин по Україні для приватних і бізнес-клієнтів.",
      "Оплата карткою, онлайн, при отриманні або за безготівковим рахунком із консультацією до та після замовлення.",
    ],
    icon: TruckIcon,
    iconTone: "bg-emerald-100 text-emerald-700 border-emerald-200/90",
    glowTone: "bg-emerald-200/40",
    markerTone: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
  },
];

const headerHighlights = [
  {
    label: "VIN, артикул або модель авто",
    icon: CheckBadgeIcon,
    tone: "border-sky-200/80 bg-white/78 text-sky-700",
  },
  {
    label: "Оригінали та перевірені аналоги",
    icon: CreditCardIcon,
    tone: "border-cyan-200/80 bg-white/78 text-cyan-700",
  },
  {
    label: "вул. Перфецького, 8",
    icon: BuildingStorefrontIcon,
    tone: "border-indigo-200/80 bg-white/78 text-indigo-700",
    href: STORE_MAPS_URL,
  },
  {
    label: "+38 (063) 421-18-51",
    icon: PhoneIcon,
    tone: "border-emerald-200/80 bg-white/78 text-emerald-700",
  },
  {
    label: "Самовивіз у Львові і доставка",
    icon: TruckIcon,
    tone: "border-emerald-200/80 bg-white/78 text-emerald-700",
  },
] as const;

const AdvantagesSection = () => {
  return (
    <section
      className="home-glow-section home-glow-section-cyan section-reveal font-ui group/advantages relative isolate w-full overflow-hidden bg-gradient-to-br from-cyan-50/96 via-sky-100/70 to-blue-100/80 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),inset_0_-1px_0_rgba(30,64,175,0.08),0_12px_24px_rgba(37,99,235,0.08)] sm:py-5"
    >
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_16%,rgba(103,232,249,0.22),transparent_36%),radial-gradient(circle_at_84%_18%,rgba(56,189,248,0.16),transparent_40%),radial-gradient(circle_at_52%_88%,rgba(96,165,250,0.12),transparent_34%)]" />

      <div
        className="page-shell-inline relative z-10"
      >
        <div className="home-panel-hover relative overflow-hidden rounded-[22px] border border-white/82 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(236,254,255,0.92),rgba(219,234,254,0.9))] shadow-[0_16px_32px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.92)] transition-[background-image,box-shadow,border-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/advantages:border-cyan-100 group-hover/advantages:bg-[linear-gradient(145deg,rgba(255,255,255,0.99),rgba(236,254,255,0.96),rgba(224,242,254,0.94),rgba(191,219,254,0.92))] group-hover/advantages:shadow-[0_22px_44px_rgba(14,165,233,0.1),0_10px_22px_rgba(37,99,235,0.08),inset_0_1px_0_rgba(255,255,255,0.95)]">
          <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/95 to-transparent" />
          <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_16%,rgba(103,232,249,0.14),transparent_32%),radial-gradient(circle_at_84%_18%,rgba(56,189,248,0.1),transparent_36%),radial-gradient(circle_at_50%_88%,rgba(96,165,250,0.08),transparent_32%)]" />

          <div className="relative overflow-hidden border-b border-sky-100/80 bg-[linear-gradient(135deg,rgba(250,254,255,0.99),rgba(236,254,255,0.98)_24%,rgba(224,242,254,0.97)_54%,rgba(191,219,254,0.94)_100%)] px-5 py-6 sm:px-6 sm:py-7 lg:px-7 transition-[background-image] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/advantages:bg-[linear-gradient(135deg,rgba(255,255,255,0.99),rgba(224,247,255,0.99)_22%,rgba(186,230,253,0.95)_54%,rgba(191,219,254,0.96)_100%)]">
            <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(103,232,249,0.24),transparent_28%),radial-gradient(circle_at_88%_22%,rgba(186,230,253,0.2),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.46),transparent_52%)]" />
            <span className="pointer-events-none absolute -left-12 top-6 hidden h-28 w-28 rounded-full bg-cyan-200/24 blur-2xl lg:block" />
            <span className="pointer-events-none absolute -right-10 bottom-8 hidden h-32 w-32 rounded-full bg-sky-200/20 blur-2xl lg:block" />
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,340px)] lg:items-center">
              <div className="min-w-0">
                <div className="grid gap-4 sm:grid-cols-[48px_minmax(0,1fr)] sm:items-start">
                  <span className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center sm:h-12 sm:w-12">
                    <span className="absolute inset-0 rounded-[16px] bg-sky-300/30 blur-lg" />
                    <span className="relative inline-flex h-11 w-11 items-center justify-center rounded-[16px] border border-sky-200/80 bg-white/82 text-sky-700 shadow-[0_10px_24px_rgba(56,189,248,0.14)] backdrop-blur-sm sm:h-12 sm:w-12">
                      <SparklesIcon className="h-5 w-5" />
                    </span>
                  </span>

                  <div className="min-w-0 max-w-[74ch]">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700/80">
                      <PartsOnLink /> - автозапчастини у Львові
                    </p>
                    <h2 className="mt-2 font-display text-[26px] font-black leading-[1.02] tracking-[-0.045em] text-slate-900 sm:text-[31px] lg:text-[34px]">
                      Купити автозапчастини у Львові з підбором за VIN, артикулом і маркою авто
                    </h2>

                    <p className="mt-4 max-w-[68ch] text-[14px] leading-relaxed text-slate-700 sm:text-[15px]">
                      <PartsOnLink /> - інтернет-магазин і магазин автозапчастин у Львові за адресою
                      {" "}
                      <a
                        href={STORE_MAPS_URL}
                        target="_blank"
                        rel="noreferrer"
                        className="font-extrabold text-sky-800 underline decoration-sky-300/70 underline-offset-4 transition hover:text-sky-600 hover:decoration-sky-500"
                      >
                        вул. Перфецького, 8
                      </a>
                      . Телефон для консультації:{" "}
                      <a href="tel:+380634211851" className="font-extrabold text-sky-800 transition hover:text-sky-600">
                        +38 (063) 421-18-51
                      </a>
                      . Ми допомагаємо швидко знайти сумісні запчастини за VIN-кодом, артикулом,
                      кодом товару, виробником або параметрами автомобіля.
                    </p>
                    <p className="mt-3 max-w-[68ch] text-[14px] leading-relaxed text-slate-600 sm:text-[15px]">
                      У каталозі <PartsOnLink /> доступні оригінальні автозапчастини та перевірені аналоги
                      для ТО, підвіски, двигуна, гальмівної системи, охолодження й автоелектроніки.
                      Замовлення можна забрати самовивозом у Львові або отримати доставкою по Львову
                      та Україні.
                    </p>
                    <p className="mt-3 max-w-[68ch] text-[13px] leading-relaxed text-slate-500 sm:text-[14px]">
                      Підкажемо наявність, терміни постачання, варіанти оплати та допоможемо обрати
                      оптимальну деталь під ваш бюджет і ремонтну задачу.
                    </p>

                    <div className="mt-5 flex flex-wrap gap-2.5">
                      {headerHighlights.map((item) => {
                        const Icon = item.icon;
                        const content = (
                          <>
                            <Icon className="h-4 w-4" />
                            <span>{item.label}</span>
                          </>
                        );

                        return "href" in item ? (
                          <a
                            key={item.label}
                            href={item.href}
                            target="_blank"
                            rel="noreferrer"
                            className={`inline-flex items-center gap-2 rounded-[999px] border px-3 py-1.5 text-[12px] font-semibold shadow-[0_8px_16px_rgba(125,211,252,0.12)] transition hover:border-sky-200 ${item.tone}`}
                          >
                            {content}
                          </a>
                        ) : (
                          <span
                            key={item.label}
                            className={`inline-flex items-center gap-2 rounded-[999px] border px-3 py-1.5 text-[12px] font-semibold shadow-[0_10px_20px_rgba(125,211,252,0.14)] backdrop-blur-sm ${item.tone}`}
                          >
                            {content}
                          </span>
                        );
                      })}
                    </div>

                  </div>
                </div>
              </div>

              <div className="relative mx-auto max-w-md lg:mx-0 lg:max-w-none lg:justify-self-end">
                <AdvantagesPhotoSlider />
              </div>
            </div>
          </div>

          <div className="relative grid divide-y divide-sky-100/80 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            {advantagePanels.map((item) => {
              const Icon = item.icon;

              return (
                <article
                  key={item.title}
                  className="home-card-hover relative flex h-full min-w-0 flex-col px-5 py-5 sm:px-6 sm:py-6 transition-[background-image,box-shadow] duration-500 ease-out hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.42),rgba(236,254,255,0.36),rgba(224,242,254,0.26),rgba(191,219,254,0.16))] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.42)]"
                >
                  <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(125,211,252,0.12),transparent_42%)]" />

                  <div className="relative flex min-h-[5.8rem] items-start gap-4">
                    <span className="relative inline-flex h-14 w-14 shrink-0 items-center justify-center">
                      <span
                        className={`pointer-events-none absolute inset-0 rounded-[16px] blur-xl ${item.glowTone}`}
                      />
                      <span
                        className={`relative inline-flex h-14 w-14 items-center justify-center rounded-[16px] border shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_10px_22px_rgba(15,23,42,0.06)] ${item.iconTone}`}
                      >
                        <Icon className="h-6 w-6" />
                      </span>
                    </span>

                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                        {item.eyebrow}
                      </p>
                      <h3 className="mt-1 text-[22px] font-black leading-[1.02] tracking-[-0.04em] text-slate-900">
                        {item.title}
                      </h3>
                    </div>
                  </div>

                  <p className="relative mt-4 min-h-[5.3rem] text-[14px] leading-relaxed text-slate-700 sm:text-[15px]">
                    {item.summary}
                  </p>

                  <ul className="relative mt-5 space-y-3">
                    {item.points.map((point) => (
                      <li key={point} className="flex items-start gap-3">
                        <span
                          className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${item.markerTone}`}
                        >
                          <CheckBadgeIcon className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 text-[13px] leading-relaxed text-slate-600">
                          {point}
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

export default AdvantagesSection;
