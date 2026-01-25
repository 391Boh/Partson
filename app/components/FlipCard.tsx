"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { useState, memo, useRef } from "react";
import { useRouter } from "next/navigation";

export type ProductNode = {
  name: string;
  children?: ProductNode[];
};

//
// ICON MAP
//
const categoryIconMap: Record<string, string> = {
  "Паливна система": "palivna_systema.png",
  "Гальмівна система": "halmivna_systema.png",
  "Деталі двигуна": "detali_dvyhuna.png",
  "Деталі підвіски": "detali_pidvisky.png",
  Амортизація: "amort.png",
  "Деталі для ТО": "detali_dlia_to.png",
  "Привід та коробка передач": "pryvid_ta_korobka_peredach.png",
  "Система охолодження": "systema_okholodzhennia.png",
  Освітлення: "osvitlennia.png",
  Інше: "inshe.png",
  Електроніка: "elektronika.png",
  "Кузовні елементи": "kuzovni_elementy.png",
  "Датчики та електроніка": "datchyky_ta_elektronika.png",
  "Рідини та мастила": "ridyny_ta_mastyla.png",
};

const getIcon = (n: string) => `/Katlogo/${categoryIconMap[n] || "rul.png"}`;

//
// FIX: SAFARI / MACOS SAFE 3D BACKFACE SETTINGS
//
const safBackface: React.CSSProperties = {
  backfaceVisibility: "hidden",
  WebkitBackfaceVisibility: "hidden",
  transformStyle: "preserve-3d",
  willChange: "transform",
};

//
// ENTRANCE ANIMATION
//
const entrance = {
  hidden: { opacity: 0, scale: 0.9, y: 25 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.45, ease: "easeOut" }
  }
};

//
// ARROW ICONS
//
const ArrowLeft = ({ className }: any) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="m15 18-6-6 6-6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ArrowRight = ({ className }: any) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="m9 18 6-6-6-6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);


//
// MAIN CARD COMPONENT
//
function FlipCardComponent({
  product,
  id,
  isFlipped,
  setFlippedId,
}: {
  product: ProductNode;
  id: number;
  isFlipped: boolean;
  setFlippedId: (id: number | null) => void;
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  const [activeGroup, setActiveGroup] = useState<ProductNode | null>(null);
  const [page, setPage] = useState(0);
  const [sub, setSub] = useState(0);

  const perPage = 4;
  const children = product.children ?? [];

  const mainPages = Math.ceil(children.length / perPage);
  const mainVisible = children.slice(page * perPage, page * perPage + perPage);

  const subChildren = activeGroup?.children ?? [];
  const subPages = Math.ceil(subChildren.length / perPage);
  const subVisible = subChildren.slice(sub * perPage, sub * perPage + perPage);
  const mainPageCount = Math.max(1, mainPages);
  const subPageCount = Math.max(1, subPages);
  const hasSubgroups = (node?: ProductNode | null) =>
    Array.isArray(node?.children) && node.children.length > 0;

  //
  // SWIPE FOR MOBILE
  //
  const tStart = useRef(0);
  const tEnd = useRef(0);

  const onTouchStart = (e: any) => (tStart.current = e.touches[0].clientX);
  const onTouchEnd = (e: any) => {
    tEnd.current = e.changedTouches[0].clientX;
    const diff = tStart.current - tEnd.current;

    if (Math.abs(diff) > 40) {
      if (activeGroup) {
        sub + 1 < subPages && diff > 0 && setSub(sub + 1);
        sub > 0 && diff < 0 && setSub(sub - 1);
      } else {
        page + 1 < mainPages && diff > 0 && setPage(page + 1);
        page > 0 && diff < 0 && setPage(page - 1);
      }
    }
  };

  //
  // FLIP HANDLER
  //
  const flip = () => {
    setFlippedId(isFlipped ? null : id);

    if (isFlipped) {
      setTimeout(() => {
        setActiveGroup(null);
        setPage(0);
        setSub(0);
      }, 250);
    }
  };

  return (
    <motion.div
      variants={entrance}
      initial={reduceMotion ? "visible" : "hidden"}
      animate="visible"
      className="relative w-full h-[180px] sm:h-[215px]"
      style={{ perspective: 1200 }} // fixed
    >
      <motion.div
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.55, ease: "easeInOut" }}
        style={{
          transformStyle: "preserve-3d",
        }}
        onClick={flip}
        className="relative w-full h-full cursor-pointer"
      >
        {/* FRONT */}
        <div
          className="
            group/card absolute inset-0 rounded-xl border border-slate-300/30
            bg-gradient-to-br from-sky-50 via-white to-indigo-50
            shadow-[0_6px_16px_rgba(0,0,0,0.06)]
            flex flex-col items-center justify-center text-center px-4
            transition-all duration-500
            hover:bg-gradient-to-br hover:from-sky-200 hover:via-white hover:to-indigo-100
            hover:border-blue-400/70
            hover:shadow-[0_12px_32px_rgba(59,130,246,0.20)]
          "
          style={{
            ...safBackface,
            transform: "rotateY(0deg) translateZ(1px)" as string,
          }}
        >
          <Image
            src={getIcon(product.name)}
            alt={product.name}
            width={60}
            height={60}
            className="
              mb-3 transition-transform duration-500
              group-hover/card:scale-[1.18]
            "
          />

          <h3 className="text-[13px] font-semibold text-slate-800 line-clamp-2 mb-1">
            {product.name}
          </h3>

          <span className="px-2 py-1 rounded-full text-[11px] bg-white/70 text-slate-600">
            {children.length} категорій
          </span>
        </div>

        {/* BACK */}
        <div
          className="
            absolute inset-0 rounded-xl
            bg-gradient-to-br from-white to-slate-50
            border border-slate-200 shadow-md
            flex flex-col px-2 py-2 select-none
            transition-all duration-500
            hover:bg-gradient-to-br hover:from-blue-50 hover:to-white
          "
          style={{
            ...safBackface,
            transform: "rotateY(180deg) translateZ(1px)" as string,
          }}
          onClick={(e) => e.stopPropagation()}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {/* HEADER */}
          <div
            className="
              h-9 flex items-center justify-between px-2 rounded-md mb-2
              bg-gradient-to-r from-slate-200/60 to-white
              transition-all duration-500
              hover:from-blue-200/40 hover:to-blue-100/40
            "
          >
            <span className="text-[11px] font-semibold text-slate-700 mx-1 truncate">
              {activeGroup?.name || product.name}
            </span>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  if (activeGroup) {
                    sub === 0 ? setActiveGroup(null) : setSub(sub - 1);
                  } else {
                    page === 0 ? flip() : setPage(page - 1);
                  }
                }}
                className="
                  p-1 text-slate-400 hover:text-blue-600 hover:bg-white/70
                  rounded-md transition-all
                "
              >
                <ArrowLeft className="w-4 h-4" />
              </button>

              <span className="text-[10px] font-semibold text-slate-600 px-1">
                {(activeGroup ? sub : page) + 1}/{activeGroup ? subPageCount : mainPageCount}
              </span>

              <button
                onClick={() => {
                  const max = activeGroup ? subPages : mainPages;
                  const current = activeGroup ? sub : page;
                  const setter = activeGroup ? setSub : setPage;
                  if (current < max - 1) setter(current + 1);
                }}
                className="
                  p-1 text-slate-400 hover:text-blue-600 hover:bg-white/70
                  rounded-md transition-all disabled:opacity-40 disabled:hover:bg-transparent
                "
                disabled={
                  (activeGroup ? sub : page) >=
                  (activeGroup ? subPageCount : mainPageCount) - 1
                }
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* LIST */}
          <div className="flex-1 flex flex-col gap-1 overflow-hidden">
            {(activeGroup ? subVisible : mainVisible).map((item, i) => (
              <button
                key={i}
                onClick={() => {
                  if (item.children?.length) {
                    setActiveGroup(item);
                    setSub(0);
                  } else {
                    router.push(
                      `/katalog?group=${activeGroup?.name || product.name}&subcategory=${item.name}`
                    );
                  }
                }}
                className="
                  w-full px-2 py-[7px] rounded-md text-[12px] text-slate-700 
                  bg-white/80 border border-slate-200
                  hover:bg-blue-50 hover:border-blue-400
                  text-left truncate transition-all
                "
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{item.name}</span>
                  {hasSubgroups(item) && (
                    <ArrowRight className="w-4 h-4 text-blue-400" />
                  )}
                </div>
              </button>
            ))}

            {(activeGroup ? subVisible : mainVisible).length === 0 && (
              <div className="text-center text-[11px] text-slate-400 py-3">
                Пусто
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export const FlipCard = memo(FlipCardComponent);
