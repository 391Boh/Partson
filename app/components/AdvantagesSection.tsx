"use client";

import { motion } from "framer-motion";
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
    bgColor: "bg-blue-100",
    textColor: "text-blue-600",
    delay: 0.1,
    icon: TruckIcon,
  },
  {
    title: "Гарантія якості",
    short: "Ретельна перевірка",
    detailed: "Перед відправкою кожен товар проходить суворий контроль якості.",
    bgColor: "bg-green-100",
    textColor: "text-green-600",
    delay: 0.2,
    icon: ShieldCheckIcon,
  },
  {
    title: "Гнучка оплата",
    short: "Картка, готівка, розстрочка",
    detailed:
      "Ви можете обрати зручний спосіб оплати — швидко та безпечно.",
    bgColor: "bg-purple-100",
    textColor: "text-purple-600",
    delay: 0.3,
    icon: CreditCardIcon,
  },
  {
    title: "Професійна підтримка",
    short: "24/7 онлайн",
    detailed:
      "Наші консультанти завжди готові допомогти вам у будь-який час.",
    bgColor: "bg-indigo-100",
    textColor: "text-indigo-600",
    delay: 0.4,
    icon: ChatBubbleLeftRightIcon,
  },
  {
    title: "Найкращі ціни",
    short: "-10–15% від ринку",
    detailed:
      "Ми напряму співпрацюємо з постачальниками — ви економите більше.",
    bgColor: "bg-yellow-100",
    textColor: "text-yellow-600",
    delay: 0.5,
    icon: TagIcon,
  },
];

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
}) => {
  return (
    <motion.div
      className="w-60 h-48 shrink-0"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      viewport={{ once: true }}
      style={{ perspective: "1000px" }}
    >
      <div
        onClick={onClick}
        className="relative w-full h-full cursor-pointer rounded-xl transition-transform duration-700 hover:scale-105 hover:shadow-xl"
        style={{
          transformStyle: "preserve-3d",
          transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* Front Side */}
        <div
          className={`absolute w-full h-full bg-white border rounded-xl shadow-md flex flex-col justify-center items-center p-4`}
          style={{ backfaceVisibility: "hidden" }}
        >
          <div
            className={`w-12 h-12 mb-3 rounded-full flex items-center justify-center ${bgColor}`}
          >
            <Icon className={`w-6 h-6 ${textColor}`} />
          </div>
          <h4 className="text-lg font-semibold text-center text-gray-800 mb-1">
            {title}
          </h4>
          <p className="text-sm text-center text-gray-600">{short}</p>
        </div>

        {/* Back Side */}
        <div
          className="absolute w-full h-full bg-gradient-to-br from-white to-gray-50 border rounded-xl shadow-inner p-4 flex items-center justify-center text-center text-gray-700 text-sm"
          style={{ transform: "rotateY(180deg)", backfaceVisibility: "hidden" }}
        >
          <p>{detailed}</p>
        </div>
      </div>
    </motion.div>
  );
};

const AdvantagesSection = () => {
  const [flippedIndex, setFlippedIndex] = useState<number | null>(null);

  const handleFlip = (idx: number) => {
    setFlippedIndex((prev) => (prev === idx ? null : idx));
  };

  return (
    <section className="py-16  px-4 bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="container mx-auto flex flex-col lg:flex-row items-start gap-10">
        {/* Ліва колонка — горизонтальний скрол */}
<motion.div
  className="flex gap-6 p-2 mt-10 overflow-x-auto overflow-y-hidden max-h-64 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 w-full lg:w-2/3"
  initial={{ opacity: 0, x: -30 }}
  whileInView={{ opacity: 1, x: 0 }}
  transition={{ duration: 0.7 }}
  viewport={{ once: true }}
>
  {advantages.map((adv, idx) => (
    <FlipCard
      key={idx}
      {...adv}
      isFlipped={flippedIndex === idx}
      onClick={() => handleFlip(idx)}
    />
  ))}
</motion.div>


        {/* Права колонка — заголовок та опис з паралаксом */}
        <motion.div
          className="lg:w-1/3 flex flex-col items-center"
          initial={{ opacity: 0, x: 50 }}
          whileInView={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7 }}
          viewport={{ once: true }}
        >
          <div className="w-1/3 h-1 bg-gradient-to-r from-blue-600 to-indigo-500 rounded-full mb-12 self-start" />
          <h2 className="text-3xl sm:text-5xl font-bold text-gray-900 leading-tight mb-3 text-right w-full">
            Наші переваги
          </h2>
          <div className="w-2/5 pl-20 h-1 bg-gradient-to-r from-red-200 to-orange-700 rounded-full mt-8" />
          <p className="mt-2 text-2xl sm:text-2xl text-center text-gray-700 font-medium leading-snug">
            Ми створили сервіс, який дійсно вирішує потреби клієнтів — швидко,
            вигідно та якісно. Оберіть нас, і ви не пошкодуєте.
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default AdvantagesSection;
