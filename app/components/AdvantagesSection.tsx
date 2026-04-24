"use client";

import Image from "next/image";
import { useEffect, useState, type ComponentType, type SVGProps } from "react";
import {
  CheckBadgeIcon,
  CreditCardIcon,
  SparklesIcon,
  TruckIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";

type AdvantagePanel = {
  title: string;
  eyebrow: string;
  summary: string;
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
      "Допомагаємо швидко знайти сумісні автозапчастини для вашого авто, щоб ви не витрачали час на повторний пошук і не ризикували з помилковим замовленням.",
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
    summary:
      "У каталозі автозапчастин PartsON зручно купити запчастини для технічного обслуговування, підвіски, двигуна, гальмівної системи, охолодження та автоелектроніки.",
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
      "Замовити запчастини онлайн можна зі швидкою доставкою по Україні або із самовивозом у Львові, а також обрати зручний спосіб оплати з консультацією по термінах, сумісності та наявності.",
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

const businessProfilePhotos = [
  "/storefront/photos/partson-store-1.jpg",
  "/storefront/photos/partson-store-2.jpg",
  "/storefront/photos/partson-store-3.jpg",
  "/storefront/photos/partson-store-4.jpg",
  "/storefront/photos/partson-store-5.jpg",
  "/storefront/photos/partson-store-6.jpg",
  "/storefront/photos/partson-store-7.jpg",
] as const;

const headerHighlights = [
  {
    label: "Підбір за VIN-кодом",
    icon: CheckBadgeIcon,
    tone: "border-sky-200/80 bg-white/78 text-sky-700",
  },
  {
    label: "Оплата онлайн і при отриманні",
    icon: CreditCardIcon,
    tone: "border-cyan-200/80 bg-white/78 text-cyan-700",
  },
  {
    label: "Самовивіз у Львові та доставка по Україні",
    icon: TruckIcon,
    tone: "border-emerald-200/80 bg-white/78 text-emerald-700",
  },
] as const;

const PHOTO_FADE_DURATION_MS = 480;

const AdvantagesSection = () => {
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [displayedPhotoIndex, setDisplayedPhotoIndex] = useState(0);
  const [previousPhotoIndex, setPreviousPhotoIndex] = useState<number | null>(null);
  const [showPreviousPhoto, setShowPreviousPhoto] = useState(false);

  useEffect(() => {
    if (businessProfilePhotos.length <= 1) return undefined;

    const intervalId = window.setInterval(() => {
      setActivePhotoIndex((current) =>
        current === businessProfilePhotos.length - 1 ? 0 : current + 1
      );
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (activePhotoIndex === displayedPhotoIndex) return undefined;

    let frameId = 0;
    const timeoutId = window.setTimeout(() => {
      setPreviousPhotoIndex(null);
    }, PHOTO_FADE_DURATION_MS);

    setPreviousPhotoIndex(displayedPhotoIndex);
    setShowPreviousPhoto(true);
    setDisplayedPhotoIndex(activePhotoIndex);

    frameId = window.requestAnimationFrame(() => {
      frameId = window.requestAnimationFrame(() => {
        setShowPreviousPhoto(false);
      });
    });

    return () => {
      window.clearTimeout(timeoutId);
      window.cancelAnimationFrame(frameId);
    };
  }, [activePhotoIndex, displayedPhotoIndex]);

  const activePhotoSrc = businessProfilePhotos[displayedPhotoIndex];
  const previousPhotoSrc =
    previousPhotoIndex === null ? null : businessProfilePhotos[previousPhotoIndex];

  return (
    <section
      className="section-reveal font-ui group/advantages relative isolate w-full select-none overflow-hidden bg-gradient-to-br from-cyan-50/98 via-sky-100/78 to-blue-100/84 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.94),inset_0_-1px_0_rgba(30,64,175,0.1),0_14px_30px_rgba(37,99,235,0.1)] sm:py-5"
      onCopy={(event) => event.preventDefault()}
      onCut={(event) => event.preventDefault()}
    >
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_16%,rgba(103,232,249,0.26),transparent_36%),radial-gradient(circle_at_84%_18%,rgba(56,189,248,0.2),transparent_40%),radial-gradient(circle_at_52%_88%,rgba(96,165,250,0.16),transparent_34%)]" />
      <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 ease-out group-hover/advantages:opacity-100 bg-[radial-gradient(circle_at_10%_12%,rgba(6,182,212,0.22),transparent_34%),radial-gradient(circle_at_88%_16%,rgba(59,130,246,0.22),transparent_34%),radial-gradient(circle_at_50%_100%,rgba(251,191,36,0.12),transparent_38%)]" />

      <div
        className="page-shell-inline relative z-10"
      >
        <div className="relative overflow-hidden rounded-[22px] border border-white/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(236,254,255,0.92),rgba(219,234,254,0.9))] shadow-[0_18px_38px_rgba(15,23,42,0.1),inset_0_1px_0_rgba(255,255,255,0.92)] transition-[background-image,box-shadow,border-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/advantages:border-cyan-100 group-hover/advantages:bg-[linear-gradient(145deg,rgba(255,255,255,0.99),rgba(236,254,255,0.98),rgba(224,242,254,0.96),rgba(191,219,254,0.94))] group-hover/advantages:shadow-[0_26px_54px_rgba(14,165,233,0.14),0_12px_28px_rgba(37,99,235,0.1),inset_0_1px_0_rgba(255,255,255,0.95)]">
          <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/95 to-transparent" />
          <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_16%,rgba(103,232,249,0.18),transparent_32%),radial-gradient(circle_at_84%_18%,rgba(56,189,248,0.14),transparent_36%),radial-gradient(circle_at_50%_88%,rgba(96,165,250,0.12),transparent_32%)]" />
          <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 ease-out group-hover/advantages:opacity-100 bg-[linear-gradient(135deg,rgba(255,255,255,0)_0%,rgba(165,243,252,0.18)_24%,rgba(125,211,252,0.16)_56%,rgba(191,219,254,0.2)_100%)]" />

          <div className="relative overflow-hidden border-b border-sky-100/80 bg-[linear-gradient(135deg,rgba(250,254,255,0.99),rgba(236,254,255,0.98)_24%,rgba(224,242,254,0.97)_54%,rgba(191,219,254,0.94)_100%)] px-5 py-6 sm:px-6 sm:py-7 lg:px-7 transition-[background-image] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/advantages:bg-[linear-gradient(135deg,rgba(255,255,255,0.99),rgba(224,247,255,0.99)_22%,rgba(186,230,253,0.95)_54%,rgba(191,219,254,0.96)_100%)]">
            <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(103,232,249,0.24),transparent_28%),radial-gradient(circle_at_88%_22%,rgba(186,230,253,0.2),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.46),transparent_52%)]" />
            <span className="pointer-events-none absolute -left-12 top-6 h-28 w-28 rounded-full bg-cyan-200/30 blur-3xl" />
            <span className="pointer-events-none absolute -right-10 bottom-8 h-32 w-32 rounded-full bg-sky-200/24 blur-3xl" />
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,332px)] lg:items-start">
              <div className="min-w-0">
                <div className="flex items-start gap-3 sm:gap-4">
                  <span className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center sm:h-12 sm:w-12">
                    <span className="absolute inset-0 rounded-[16px] bg-sky-300/30 blur-lg" />
                    <span className="relative inline-flex h-11 w-11 items-center justify-center rounded-[16px] border border-sky-200/80 bg-white/82 text-sky-700 shadow-[0_10px_24px_rgba(56,189,248,0.14)] backdrop-blur-sm sm:h-12 sm:w-12">
                      <SparklesIcon className="h-5 w-5" />
                    </span>
                  </span>

                  <div className="min-w-0 max-w-[78ch]">
                    <h2 className="font-display text-[28px] font-black leading-[0.96] tracking-[-0.06em] text-slate-900 sm:text-[32px] lg:text-[35px]">
                      Купити автозапчастини у Львові з підбором за VIN-кодом і доставкою по Україні
                    </h2>

                    <p className="mt-4 text-[14px] leading-relaxed text-slate-700 sm:text-[15px]">
                      PartsON це інтернет-магазин автозапчастин у Львові, де можна купити
                      автозапчастини для популярних марок авто без довгого пошуку та зайвих
                      сумнівів. Ми допомагаємо підібрати запчастини за VIN-кодом, артикулом,
                      брендом виробника й ключовими параметрами автомобіля, а також підкажемо
                      найкращий варіант під ваш бюджет і сценарій ремонту.
                    </p>
                    <p className="mt-3 text-[14px] leading-relaxed text-slate-600 sm:text-[15px]">
                      У нашому каталозі автозапчастин є оригінальні автозапчастини та перевірені
                      аналоги для технічного обслуговування, підвіски, гальмівної системи,
                      двигуна, охолодження й автоелектроніки. Замовити запчастини онлайн можна
                      зі швидкою доставкою по Львову та Україні або із самовивозом у Львові.
                    </p>

                    <div className="mt-5 flex flex-wrap gap-2.5">
                      {headerHighlights.map((item) => {
                        const Icon = item.icon;

                        return (
                          <span
                            key={item.label}
                            className={`inline-flex items-center gap-2 rounded-[999px] border px-3.5 py-2 text-[12px] font-semibold shadow-[0_10px_20px_rgba(125,211,252,0.14)] backdrop-blur-sm ${item.tone}`}
                          >
                            <Icon className="h-4 w-4" />
                            <span>{item.label}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="relative lg:justify-self-end">
                <div className="overflow-hidden rounded-[18px] border border-sky-200/80 bg-white/82 shadow-[0_18px_34px_rgba(56,189,248,0.14)] backdrop-blur-md transition-[background-image,box-shadow,border-color,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/advantages:border-cyan-100 group-hover/advantages:bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(236,254,255,0.96),rgba(224,242,254,0.94))] group-hover/advantages:shadow-[0_26px_46px_rgba(14,165,233,0.22)]">
                  <div className="relative aspect-[4/3] w-full bg-slate-900/30 lg:w-[332px]">
                    {previousPhotoSrc ? (
                      <Image
                        key={`previous-${previousPhotoSrc}`}
                        src={previousPhotoSrc}
                        alt=""
                        aria-hidden="true"
                        fill
                        sizes="(min-width: 1024px) 332px, 100vw"
                        className={`pointer-events-none z-10 object-cover transition-opacity ease-out ${
                          showPreviousPhoto ? "opacity-100" : "opacity-0"
                        }`}
                        style={{ transitionDuration: `${PHOTO_FADE_DURATION_MS}ms` }}
                      />
                    ) : null}
                    <Image
                      key={activePhotoSrc}
                      src={activePhotoSrc}
                      alt={`Фото магазину PartsON ${displayedPhotoIndex + 1}`}
                      fill
                      sizes="(min-width: 1024px) 332px, 100vw"
                      priority={displayedPhotoIndex === 0}
                      className="object-cover"
                    />
                  </div>

                  <div className="flex items-start justify-between gap-3 border-t border-sky-100/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] px-4 py-3 transition-[background-image] duration-500 ease-out group-hover/advantages:bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(236,254,255,0.96),rgba(224,242,254,0.94))]">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-700/78">
                        Фото магазину PartsON
                      </p>
                      <p className="mt-1 text-[13px] font-semibold text-slate-700">
                        Простір магазину, вітрина та зона самовивозу
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5 pt-1">
                      {businessProfilePhotos.map((_, index) => (
                        <button
                          key={`photo-dot-${index}`}
                          type="button"
                          onClick={() => setActivePhotoIndex(index)}
                          aria-label={`Показати фото магазину ${index + 1}`}
                          className={`h-2.5 rounded-full transition-all duration-200 ${
                            index === activePhotoIndex
                              ? "w-6 bg-sky-600"
                              : "w-2.5 bg-sky-200 hover:bg-sky-300"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="relative grid divide-y divide-sky-100/80 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            {advantagePanels.map((item) => {
              const Icon = item.icon;

              return (
                <article
                  key={item.title}
                  className="relative flex h-full min-w-0 flex-col px-5 py-5 sm:px-6 sm:py-6 transition-[background-image,box-shadow] duration-500 ease-out hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.52),rgba(236,254,255,0.46),rgba(224,242,254,0.36),rgba(191,219,254,0.22))] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]"
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

                  <p className="relative mt-4 min-h-[6.25rem] text-[14px] leading-relaxed text-slate-700 sm:text-[15px]">
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
