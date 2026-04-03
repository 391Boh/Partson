"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ComponentType, SVGProps } from "react";
import {
  TruckIcon,
  ShieldCheckIcon,
  CreditCardIcon,
  ChatBubbleLeftRightIcon,
  TagIcon,
} from "@heroicons/react/24/outline";

type Advantage = {
  title: string;
  short: string;
  detailed: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  iconTone: string;
  glowTone: string;
};

const advantages: Advantage[] = [
  {
    title: "Швидка доставка",
    short: "1-3 дні по Україні",
    detailed:
      "Ми доставляємо товари у найкоротші терміни по всій країні, а також доступний самовивіз у місті Львів.",
    icon: TruckIcon,
    iconTone: "bg-sky-100 text-sky-700 border-sky-200/90",
    glowTone: "bg-sky-200/30",
  },
  {
    title: "Гарантія якості",
    short: "Ретельна перевірка",
    detailed: "Перед відправкою кожен товар проходить суворий контроль якості.",
    icon: ShieldCheckIcon,
    iconTone: "bg-emerald-100 text-emerald-700 border-emerald-200/90",
    glowTone: "bg-emerald-200/30",
  },
  {
    title: "Гнучка оплата",
    short: "Картка та готівка",
    detailed:
      "Ви можете обрати зручний спосіб оплати: швидко, зручно та безпечно.",
    icon: CreditCardIcon,
    iconTone: "bg-cyan-100 text-cyan-700 border-cyan-200/90",
    glowTone: "bg-cyan-200/30",
  },
  {
    title: "Професійна підтримка",
    short: "Працюємо щодня",
    detailed: "Наші консультанти завжди готові допомогти вам у будь-який час.",
    icon: ChatBubbleLeftRightIcon,
    iconTone: "bg-teal-100 text-teal-700 border-teal-200/90",
    glowTone: "bg-teal-200/30",
  },
  {
    title: "Найкращі ціни",
    short: "Вигідні пропозиції",
    detailed:
      "Ми напряму співпрацюємо з постачальниками та пропонуємо вигідні умови, щоб ціни залишались доступними.",
    icon: TagIcon,
    iconTone: "bg-amber-100 text-amber-700 border-amber-200/90",
    glowTone: "bg-amber-200/30",
  },
];

type AdvantagesSectionProps = {
  playEntranceAnimations?: boolean;
};

const AdvantagesSection = ({
  playEntranceAnimations = true,
}: AdvantagesSectionProps) => {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const shouldAnimate = !shouldReduceMotion && playEntranceAnimations;

  return (
    <section
      className="font-ui group/advantages relative min-h-[280px] w-full select-none overflow-hidden bg-gradient-to-br from-sky-200/95 via-blue-300/86 to-indigo-300/88 pt-5 pb-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.82),inset_0_-1px_0_rgba(30,64,175,0.22),0_18px_38px_rgba(30,64,175,0.2)] transition-[background-image,box-shadow,filter] duration-500 ease-out hover:from-sky-200/95 hover:via-blue-300/86 hover:to-indigo-300/90 sm:pt-6 sm:pb-4 lg:pt-7 lg:pb-5"
      onCopy={(event) => event.preventDefault()}
      onCut={(event) => event.preventDefault()}
    >
      <div className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-500 ease-out group-hover/advantages:opacity-100 bg-[image:radial-gradient(circle_at_12%_16%,rgba(56,189,248,0.24),transparent_40%),radial-gradient(circle_at_84%_18%,rgba(59,130,246,0.2),transparent_42%),radial-gradient(circle_at_52%_88%,rgba(99,102,241,0.18),transparent_36%)]" />

      <div className="page-shell-inline relative z-10">
        <motion.div
          initial={shouldAnimate ? { opacity: 0, y: 8 } : false}
          animate={shouldAnimate ? { opacity: 1, y: 0 } : undefined}
          transition={
            shouldAnimate ? { duration: 0.28, ease: "easeOut" } : undefined
          }
          className="flex flex-col gap-4 sm:gap-5"
        >
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="group/title flex items-start gap-3 sm:gap-4">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 shadow-inner sm:h-11 sm:w-11">
                <ShieldCheckIcon className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
              </span>
              <h3 className="font-display relative inline-block text-[21px] font-extrabold italic tracking-[-0.03em] text-slate-700 drop-shadow-[0_3px_8px_rgba(15,23,42,0.22)] sm:text-[24px]">
                <span className="relative inline-flex items-center">
                  Переваги PartsON
                  <span
                    data-underline
                    className="pointer-events-none absolute left-0 -bottom-1 h-[3px] w-full rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-indigo-400 origin-left scale-x-0 transition-transform duration-300 ease-out group-hover/title:scale-x-100 shadow-[0_4px_12px_rgba(59,130,246,0.28)]"
                  />
                </span>
              </h3>
            </div>
          </div>

          <div className="group/logogrid no-scrollbar mt-1 grid grid-flow-col auto-cols-[minmax(260px,1fr)] items-stretch gap-3 overflow-x-auto pb-1 scroll-smooth sm:auto-cols-[minmax(280px,1fr)] sm:gap-4">
            {advantages.map((item) => {
              const Icon = item.icon;
              return (
                <motion.article
                  key={item.title}
                  initial={shouldAnimate ? { opacity: 0, y: 10 } : false}
                  animate={shouldAnimate ? { opacity: 1, y: 0 } : undefined}
                  transition={
                    shouldAnimate
                      ? { duration: 0.18, ease: "easeOut" }
                      : undefined
                  }
                  className="group/card relative isolate flex min-h-[190px] min-w-0 flex-col overflow-hidden rounded-[20px] border border-white/80 bg-gradient-to-br from-white/98 via-slate-50/95 to-sky-50/78 p-3.5 text-left shadow-[0_12px_26px_rgba(15,23,42,0.1),inset_0_1px_0_rgba(255,255,255,0.92)] ring-1 ring-transparent transition-[border-color,box-shadow,background-color] duration-250 ease-out sm:min-h-[198px] sm:p-4 hover:border-sky-200/80 hover:shadow-[0_18px_34px_rgba(37,99,235,0.16)]"
                >
                  <span className="pointer-events-none absolute inset-0 bg-[image:radial-gradient(circle_at_20%_18%,rgba(125,211,252,0.22),transparent_30%),radial-gradient(circle_at_82%_10%,rgba(59,130,246,0.16),transparent_34%)] opacity-70 transition-opacity duration-300 ease-out group-hover/card:opacity-100" />
                  <span className="pointer-events-none absolute left-3 right-3 top-1 h-[2px] rounded-full bg-gradient-to-r from-sky-300/70 via-blue-400/65 to-cyan-300/70" />
                  <span
                    className={`pointer-events-none absolute -right-10 -top-12 h-24 w-24 rounded-full blur-3xl transition-opacity duration-300 ease-out group-hover/card:opacity-90 ${item.glowTone}`}
                  />

                  <div className="relative flex items-start gap-2.5">
                    <span
                      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.96),0_8px_16px_rgba(15,23,42,0.08)] sm:h-12 sm:w-12 ${item.iconTone}`}
                    >
                      <Icon className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <h4 className="font-display break-words text-[17px] font-bold leading-[1.18] tracking-[-0.02em] text-slate-800">
                        {item.title}
                      </h4>
                      <p className="font-ui mt-1 break-words text-[11px] font-semibold uppercase tracking-[0.04em] text-slate-600 sm:text-xs">
                        {item.short}
                      </p>
                    </div>
                  </div>

                  <div className="relative mt-3 flex-1 rounded-xl border border-slate-200/80 bg-white/82 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)]">
                    <p className="font-ui text-[12px] font-medium leading-relaxed text-slate-600 sm:text-[13px]">
                      {item.detailed}
                    </p>
                  </div>
                </motion.article>
              );
            })}
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default AdvantagesSection;
