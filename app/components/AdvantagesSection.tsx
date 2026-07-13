"use client";

import { useEffect, useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import Link from "next/link";
import {
  ArrowUpRightIcon,
  CheckBadgeIcon,
  ChatBubbleLeftRightIcon,
  SparklesIcon,
  Squares2X2Icon,
  TruckIcon,
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
  ctaTone: string;
  cta: string;
  action: { type: "link"; href: string } | { type: "chat"; message: string };
};

const advantagePanels: AdvantagePanel[] = [
  {
    title: "Підбір і сумісність",
    eyebrow: "VIN-код, артикул, параметри авто",
    summary:
      "Напишіть нам код, артикул або VIN — підкажемо точну відповідність і пояснимо різницю між оригіналом і перевіреним аналогом ще до оформлення замовлення.",
    points: [
      "Підбір за VIN-кодом, артикулом і моделлю автомобіля.",
      "Оригінал чи аналог — пояснюємо різницю та ризики.",
      "Перевіряємо сумісність до оплати, не після.",
    ],
    icon: ChatBubbleLeftRightIcon,
    iconTone: "bg-sky-100 text-sky-700 border-sky-200/90",
    glowTone: "bg-sky-200/45",
    markerTone: "bg-sky-50 text-sky-700 border-sky-200/80",
    ctaTone: "text-sky-700",
    cta: "Написати в чат",
    action: {
      type: "chat",
      message: "Допоможіть підібрати запчастину за VIN-кодом або артикулом.",
    },
  },
  {
    title: "Каталог",
    eyebrow: "Оригінали, аналоги, популярні категорії",
    summary:
      "У каталозі PartsON — деталі ТО, підвіски, гальмівної й паливної систем, " +
      "рульового керування, двигуна та охолодження для Volkswagen, Audi, BMW, " +
      "Mercedes-Benz, Toyota, Honda, Hyundai, Skoda, Peugeot, Renault, Kia та інших марок.",
    points: [
      "Моторні оливи ELF і Mobil, автохімія та ремені Bosch, Meyle.",
      "Щітки склоочисника Bosch Aerotwin, датчики, електроніка.",
      "Розумний баланс ціни, якості й реальної наявності товару.",
    ],
    icon: Squares2X2Icon,
    iconTone: "bg-indigo-100 text-indigo-700 border-indigo-200/90",
    glowTone: "bg-indigo-200/40",
    markerTone: "bg-indigo-50 text-indigo-700 border-indigo-200/80",
    ctaTone: "text-indigo-700",
    cta: "Перейти в каталог",
    action: { type: "link", href: "/katalog" },
  },
  {
    title: "Доставка, оплата і підтримка",
    eyebrow: "Львів, самовивіз, Україна і зручний розрахунок",
    summary:
      "Замовляйте запчастини онлайн із доставкою по Україні або самовивозом у Львові. Підкажемо терміни, наявність і зручний спосіб оплати.",
    points: [
      "Самовивіз із магазину у Львові в зручний час.",
      "Доставка по Україні для приватних і бізнес-клієнтів.",
      "Оплата карткою, онлайн, при отриманні або за безготівковим рахунком.",
    ],
    icon: TruckIcon,
    iconTone: "bg-emerald-100 text-emerald-700 border-emerald-200/90",
    glowTone: "bg-emerald-200/40",
    markerTone: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
    ctaTone: "text-emerald-700",
    cta: "Умови доставки й оплати",
    action: { type: "link", href: "/inform/delivery" },
  },
];

type AdvantagesSectionProps = {
  googleRatingValue?: number;
  googleReviewCount?: number;
};

const AdvantagesSection = ({
  googleRatingValue,
  googleReviewCount,
}: AdvantagesSectionProps) => {
  const [googleRating, setGoogleRating] = useState(() => ({
    ratingValue: googleRatingValue,
    reviewCount: googleReviewCount,
  }));

  useEffect(() => {
    if (googleRatingValue != null && googleReviewCount != null) return;

    const controller = new AbortController();
    void fetch("/api/google-rating", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as {
          ratingValue?: unknown;
          reviewCount?: unknown;
        };
      })
      .then((value) => {
        if (
          value &&
          typeof value.ratingValue === "number" &&
          typeof value.reviewCount === "number"
        ) {
          setGoogleRating({
            ratingValue: value.ratingValue,
            reviewCount: value.reviewCount,
          });
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
      });

    return () => controller.abort();
  }, [googleRatingValue, googleReviewCount]);

  return (
    <section
      className="home-glow-section home-glow-section-cyan section-reveal font-ui group/advantages relative isolate w-full overflow-hidden bg-gradient-to-br from-cyan-50/96 via-sky-100/70 to-blue-100/80 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),inset_0_-1px_0_rgba(30,64,175,0.08),0_12px_24px_rgba(37,99,235,0.08)] sm:py-5"
    >
      {/* top bridge — receives Brands sky-50 exit */}
      <span className="pointer-events-none absolute inset-x-0 top-0 z-0 h-16 bg-[image:linear-gradient(to_bottom,rgba(186,230,253,0.20)_0%,rgba(186,230,253,0.05)_55%,transparent_100%)]" />
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_16%,rgba(103,232,249,0.22),transparent_36%),radial-gradient(circle_at_84%_18%,rgba(56,189,248,0.16),transparent_40%),radial-gradient(circle_at_52%_88%,rgba(96,165,250,0.12),transparent_34%)]" />

      <div
        className="page-shell-inline relative z-10"
      >
        <div className="home-panel-hover home-section-surface relative overflow-hidden rounded-[22px] border border-white/82 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(236,254,255,0.92),rgba(219,234,254,0.9))] shadow-[0_16px_32px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.92)] transition-[background-image,box-shadow,border-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/advantages:border-cyan-100 group-hover/advantages:bg-[linear-gradient(145deg,rgba(255,255,255,0.99),rgba(236,254,255,0.96),rgba(224,242,254,0.94),rgba(191,219,254,0.92))] group-hover/advantages:shadow-[0_22px_44px_rgba(14,165,233,0.1),0_10px_22px_rgba(37,99,235,0.08),inset_0_1px_0_rgba(255,255,255,0.95)]">
          <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/95 to-transparent" />
          <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_16%,rgba(103,232,249,0.14),transparent_32%),radial-gradient(circle_at_84%_18%,rgba(56,189,248,0.1),transparent_36%),radial-gradient(circle_at_50%_88%,rgba(96,165,250,0.08),transparent_32%)]" />

          <div className="relative overflow-hidden border-b border-sky-100/80 bg-[linear-gradient(135deg,rgba(250,254,255,0.99),rgba(236,254,255,0.98)_24%,rgba(224,242,254,0.97)_54%,rgba(191,219,254,0.94)_100%)] px-5 py-6 sm:px-6 sm:py-7 lg:px-7 transition-[background-image] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/advantages:bg-[linear-gradient(135deg,rgba(255,255,255,0.99),rgba(224,247,255,0.99)_22%,rgba(186,230,253,0.95)_54%,rgba(191,219,254,0.96)_100%)]">
            <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(103,232,249,0.24),transparent_28%),radial-gradient(circle_at_88%_22%,rgba(186,230,253,0.2),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.46),transparent_52%)]" />
            <span className="pointer-events-none absolute -left-12 top-6 hidden h-28 w-28 rounded-full bg-cyan-200/24 blur-2xl lg:block" />
            <span className="pointer-events-none absolute -right-10 bottom-8 hidden h-32 w-32 rounded-full bg-sky-200/20 blur-2xl lg:block" />
            <div className="min-w-0">
              <div className="grid gap-4 sm:grid-cols-[48px_minmax(0,1fr)] sm:items-start">
                <span className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center sm:h-12 sm:w-12">
                  <span className="absolute inset-0 rounded-[16px] bg-sky-300/30 blur-lg" />
                  <span className="relative inline-flex h-11 w-11 items-center justify-center rounded-[16px] border border-sky-200/80 bg-white/82 text-sky-700 shadow-[0_10px_24px_rgba(56,189,248,0.14)] backdrop-blur-sm sm:h-12 sm:w-12">
                    <SparklesIcon className="h-5 w-5" />
                  </span>
                </span>

                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700/80">
                    <PartsOnLink /> - автозапчастини у Львові
                  </p>
                  <h2 className="mt-2 font-display text-[26px] font-black leading-[1.02] tracking-[-0.045em] text-slate-900 sm:text-[31px] lg:text-[34px]">
                    Купити автозапчастини у Львові з підбором за VIN, артикулом і маркою авто
                  </h2>

                  <div className="mt-4 grid gap-x-8 gap-y-3 lg:grid-cols-2">
                    <p className="text-[14px] leading-relaxed text-slate-700 sm:text-[15px]">
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
                      . Ми швидко підбираємо сумісні деталі за VIN-кодом, артикулом, кодом товару
                      або маркою авто — Volkswagen, Audi, BMW, Mercedes-Benz, Toyota, Honda, Hyundai,
                      Nissan, Skoda, Peugeot, Renault, Volvo, Kia, Mazda, Seat, Lexus, Mitsubishi,
                      Chevrolet, Citroën, Ford, Fiat та інших.
                    </p>
                    <p className="text-[14px] leading-relaxed text-slate-600 sm:text-[15px]">
                      У каталозі <PartsOnLink /> — оригінальні автозапчастини та перевірені аналоги
                      для щоденного ремонту й планового ТО. Забрати замовлення можна самовивозом у
                      Львові або отримати доставкою по Україні: підкажемо наявність, терміни
                      постачання та зручний спосіб оплати.
                    </p>
                  </div>
                </div>
              </div>

              <div className="relative mt-6 lg:mt-7">
                <AdvantagesPhotoSlider
                  ratingValue={googleRating.ratingValue}
                  reviewCount={googleRating.reviewCount}
                />
              </div>
            </div>
          </div>

          <div className="relative grid divide-y divide-sky-100/80 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            {advantagePanels.map((item) => {
              const Icon = item.icon;
              const ActionIcon =
                item.action.type === "chat" ? ChatBubbleLeftRightIcon : ArrowUpRightIcon;

              const cardContent = (
                <>
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

                  <span
                    className={`relative mt-5 inline-flex w-fit items-center gap-1.5 text-[12.5px] font-bold ${item.ctaTone}`}
                  >
                    {item.cta}
                    <ActionIcon className="h-3.5 w-3.5" />
                  </span>
                </>
              );

              const cardClassName =
                "home-card-hover group/panel relative flex h-full min-w-0 flex-col px-5 py-5 text-left transition-[background-image,box-shadow] duration-500 ease-out hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.42),rgba(236,254,255,0.36),rgba(224,242,254,0.26),rgba(191,219,254,0.16))] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.42)] sm:px-6 sm:py-6";

              if (item.action.type === "link") {
                return (
                  <Link key={item.title} href={item.action.href} className={cardClassName}>
                    {cardContent}
                  </Link>
                );
              }

              const chatMessage = item.action.message;
              return (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => {
                    if (typeof window === "undefined") return;
                    window.dispatchEvent(
                      new CustomEvent("openChatWithMessage", { detail: chatMessage })
                    );
                  }}
                  className={cardClassName}
                >
                  {cardContent}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

export default AdvantagesSection;
