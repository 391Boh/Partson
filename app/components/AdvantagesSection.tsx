"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
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
  bgColor: string;
  textColor: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  delay: number;
};

const advantages: Advantage[] = [
  {
    title: "Швидка доставка",
    short: "1-3 дні по Україні",
    detailed:
      "Ми доставляємо в найкоротші терміни без затримок і прихованих умов.",
    bgColor: "bg-sky-500/15",
    textColor: "text-sky-200",
    delay: 0.1,
    icon: TruckIcon,
  },
  {
    title: "Гарантія якості",
    short: "Ретельна перевірка",
    detailed: "Перед відправкою кожен товар проходить суворий контроль якості.",
    bgColor: "bg-emerald-500/15",
    textColor: "text-emerald-200",
    delay: 0.2,
    icon: ShieldCheckIcon,
  },
  {
    title: "Гнучка оплата",
    short: "Картка, готівка, розстрочка",
    detailed:
      "Ви можете обрати зручний спосіб оплати — швидко та безпечно.",
    bgColor: "bg-blue-400/15",
    textColor: "text-violet-200",
    delay: 0.3,
    icon: CreditCardIcon,
  },
  {
    title: "Професійна підтримка",
    short: "24/7 онлайн",
    detailed:
      "Наші консультанти завжди готові допомогти вам у будь-який час.",
    bgColor: "bg-indigo-500/15",
    textColor: "text-indigo-200",
    delay: 0.4,
    icon: ChatBubbleLeftRightIcon,
  },
  {
    title: "Найкращі ціни",
    short: "-10–15% від ринку",
    detailed:
      "Ми напряму співпрацюємо з постачальниками — ви економите більше.",
    bgColor: "bg-amber-500/15",
    textColor: "text-amber-200",
    delay: 0.5,
    icon: TagIcon,
  },
];

const sectionBackground = [
  "radial-gradient(circle at 14% 20%, rgba(125,211,252,0.42), transparent 52%)",
  "radial-gradient(circle at 86% 18%, rgba(56,189,248,0.34), transparent 50%)",
  "radial-gradient(circle at 50% 88%, rgba(99,102,241,0.3), transparent 58%)",
  "linear-gradient(160deg, rgba(67, 93, 136, 0.6) 0%, rgba(126, 148, 179, 0.5) 45%, rgba(130, 157, 188, 0.45) 100%)",
].join(", ");

type FlipCardProps = {
  title: string;
  short: string;
  detailed: string;
  bgColor: string;
  textColor: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  isFlipped: boolean;
  onClick: () => void;
  delay: number;
  shouldReduceMotion: boolean;
};

const FlipCard: React.FC<FlipCardProps> = ({
  title,
  short,
  detailed,
  bgColor,
  textColor,
  icon: Icon,
  isFlipped,
  onClick,
  delay,
  shouldReduceMotion,
}) => {
  return (
    <motion.div
      className="relative aspect-[4/3] w-[220px] shrink-0 snap-start transform-gpu will-change-transform sm:w-[250px] lg:w-[270px]"
      initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
      whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
      whileHover={
        shouldReduceMotion
          ? undefined
          : {
              scale: 1.02,
              y: -4,
              transition: { duration: 0.2, ease: "easeOut" },
            }
      }
      transition={
        shouldReduceMotion
          ? { duration: 0 }
          : { duration: 0.4, delay, ease: "easeOut" }
      }
      viewport={shouldReduceMotion ? undefined : { once: true, amount: 0.35 }}
      style={{ perspective: "1200px" }}
    >
      <div
        onClick={onClick}
        className="group relative h-full w-full cursor-pointer select-none rounded-2xl transition-transform duration-700"
        style={{
          transformStyle: "preserve-3d",
          transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        <div
          className="absolute inset-0 rounded-2xl border border-white/10 bg-gradient-to-br from-slate-800/35 via-slate-700/25 to-blue-700/20 p-4 shadow-[0_14px_34px_rgba(2,6,23,0.22)] transition-colors duration-300 group-hover:from-slate-200/28 group-hover:via-slate-100/20 group-hover:to-blue-200/18"
          style={{ backfaceVisibility: "hidden" }}
        >
          <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-sky-300/28 via-transparent to-blue-400/28 opacity-0 transition duration-300 group-hover:opacity-100" />
          <div className="relative z-10 flex h-full flex-col items-start justify-center">
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-2xl ${bgColor} ring-1 ring-white/15 shadow-[0_12px_24px_rgba(2,6,23,0.2)] transition duration-300 group-hover:scale-110`}
            >
              <Icon className={`h-5 w-5 ${textColor}`} />
            </div>
            <h4 className="mt-4 text-base font-semibold text-slate-100 sm:text-lg">
              {title}
            </h4>
            <p className="mt-2 text-sm text-slate-200/80">{short}</p>
          </div>
        </div>

        <div
          className="absolute inset-0 rounded-2xl border border-white/10 bg-gradient-to-br from-slate-800/35 via-slate-700/25 to-sky-700/18 p-4 text-sm text-slate-200/80 transition-colors duration-300 group-hover:from-slate-700/28 group-hover:via-slate-600/20 group-hover:to-sky-600/18"
          style={{ transform: "rotateY(180deg)", backfaceVisibility: "hidden" }}
        >
          <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-sky-300/28 via-transparent to-blue-400/28 opacity-0 transition duration-300 group-hover:opacity-100" />
          <p className="leading-relaxed">{detailed}</p>
        </div>
      </div>
    </motion.div>
  );
};

const AdvantagesSection = () => {
  const [flippedIndex, setFlippedIndex] = useState<number | null>(null);
  const shouldReduceMotion = useReducedMotion() ?? false;

  const handleFlip = (idx: number) => {
    setFlippedIndex((prev) => (prev === idx ? null : idx));
  };

  const sectionStyle = {
    backgroundImage: sectionBackground,
    contentVisibility: "auto",
    containIntrinsicSize: "1px 520px",
  } as React.CSSProperties;

  return (
    <section
      className="group relative w-full overflow-hidden rounded-xl border border-white/10 px-4 py-8 text-slate-100 transition duration-300 sm:px-6 sm:py-10 lg:px-8 font-[Montserrat]"
      style={sectionStyle}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-16 top-8 h-40 w-40 rounded-full bg-sky-400/20 blur-[90px]" />
        <div className="absolute right-[-18%] bottom-[-28%] h-72 w-72 rounded-full bg-blue-500/20 blur-[120px]" />
        <div className="absolute inset-0 bg-gradient-to-br from-white/18 via-white/10 to-white/28" />
        <div className="absolute inset-0 bg-gradient-to-br from-white/28 via-white/16 to-white/38 opacity-0 transition duration-300 group-hover:opacity-100" />
      </div>

      <div className="relative flex w-full flex-col gap-8 lg:flex-row lg:items-center">
        {/* Ліва колонка — горизонтальний скрол */}
        <motion.div
          className="relative transform-gpu lg:w-2/3"
          initial={shouldReduceMotion ? false : { opacity: 0, x: 24 }}
          whileInView={shouldReduceMotion ? undefined : { opacity: 1, x: 0 }}
          transition={
            shouldReduceMotion ? { duration: 0 } : { duration: 0.5, ease: "easeOut" }
          }
          viewport={shouldReduceMotion ? undefined : { once: true, amount: 0.3 }}
        >
          <div className="pointer-events-none absolute left-0 top-0 h-full w-8 bg-gradient-to-r from-slate-950/80 via-slate-950/40 to-transparent" />
          <div className="pointer-events-none absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-slate-950/80 via-slate-950/40 to-transparent" />
          <div className="brand-scroll flex gap-4 overflow-x-auto pb-4 pt-2 px-2 sm:gap-6 sm:pb-5 snap-x snap-mandatory">
            {advantages.map((adv, idx) => (
              <FlipCard
                key={idx}
                {...adv}
                isFlipped={flippedIndex === idx}
                onClick={() => handleFlip(idx)}
                shouldReduceMotion={shouldReduceMotion}
              />
            ))}
          </div>
        </motion.div>


        {/* Права колонка — заголовок та опис з паралаксом */}
        <motion.div
          className="flex transform-gpu flex-col gap-4 lg:w-1/3"
          initial={shouldReduceMotion ? false : { opacity: 0, x: -24 }}
          whileInView={shouldReduceMotion ? undefined : { opacity: 1, x: 0 }}
          transition={
            shouldReduceMotion ? { duration: 0 } : { duration: 0.5, ease: "easeOut" }
          }
          viewport={shouldReduceMotion ? undefined : { once: true, amount: 0.3 }}
        >
          <div className="h-1 w-24 rounded-full bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500" />
          <h2 className="text-2xl font-extrabold text-white sm:text-3xl lg:text-4xl">
            Наші переваги
          </h2>
          <div className="h-1 w-24 rounded-full bg-gradient-to-r from-blue-300/80 via-blue-200/80 to-orange-500/80" />
          <p className="mt-2 text-base sm:text-lg lg:text-xl text-center text-black-700 font-medium leading-snug">
            Ми створили сервіс, який дійсно вирішує потреби клієнтів — швидко,
            вигідно та якісно. Оберіть нас, і ви не пошкодуєте.
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default AdvantagesSection;
