"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { useState, memo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { buildCatalogCategoryPath } from "app/lib/catalog-links";
import { getCategoryIconPath } from "app/lib/category-icons";
import { buildVisibleProductName } from "app/lib/product-url";

export type ProductNode = {
  name: string;
  children?: ProductNode[];
};

//
// FIX: SAFARI / MACOS SAFE 3D BACKFACE SETTINGS
//
const safBackface: React.CSSProperties = {
  backfaceVisibility: "hidden",
  WebkitBackfaceVisibility: "hidden",
  transformStyle: "preserve-3d",
  willChange: "transform",
};
const MOTION_EASE_OUT = [0.16, 1, 0.3, 1] as const;
const MOTION_EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;

//
// ENTRANCE ANIMATION
//
const entrance = {
  hidden: { opacity: 0, scale: 0.9, y: 25 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.45, ease: MOTION_EASE_OUT }
  }
};

//
// ARROW ICONS
//
const ArrowLeft = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="m15 18-6-6 6-6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ArrowRight = ({ className }: { className?: string }) => (
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
  priority = false,
}: {
  product: ProductNode;
  id: number;
  isFlipped: boolean;
  setFlippedId: (id: number | null) => void;
  priority?: boolean;
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  const [activeGroup, setActiveGroup] = useState<ProductNode | null>(null);
  const [page, setPage] = useState(0);
  const [sub, setSub] = useState(0);

  // Card height is fixed (h-[180px] sm:h-[215px]); 4 items only fit comfortably
  // once the taller sm: card is available, so mobile shows 3 per page instead
  // of clipping the 4th item.
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setIsCompactViewport(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const perPage = isCompactViewport ? 3 : 4;
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
  const displayProductName = buildVisibleProductName(product.name);

  //
  // SWIPE FOR MOBILE
  //
  const tStart = useRef(0);
  const tEnd = useRef(0);

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    tStart.current = e.touches[0]?.clientX ?? 0;
  };
  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    tEnd.current = e.changedTouches[0].clientX;
    const diff = tStart.current - tEnd.current;

    if (Math.abs(diff) > 40) {
      if (activeGroup) {
        if (sub + 1 < subPages && diff > 0) setSub(sub + 1);
        if (sub > 0 && diff < 0) setSub(sub - 1);
      } else {
        if (page + 1 < mainPages && diff > 0) setPage(page + 1);
        if (page > 0 && diff < 0) setPage(page - 1);
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
      whileHover={
        reduceMotion
          ? undefined
          : {
              filter: "saturate(1.1) brightness(1.03)",
              transition: { type: "spring", stiffness: 220, damping: 20, mass: 0.9 },
            }
      }
    >
      <motion.div
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.55, ease: MOTION_EASE_IN_OUT }}
        style={{
          transformStyle: "preserve-3d",
        }}
        onClick={flip}
        className="relative w-full h-full cursor-pointer"
      >
        {/* FRONT */}
        <div
          className="
            group/card absolute inset-0 rounded-xl overflow-hidden
            border-2 border-sky-200/80
            bg-[image:linear-gradient(148deg,rgba(255,255,255,0.99)_0%,rgba(240,249,255,0.95)_50%,rgba(219,234,254,0.90)_100%)]
            flex flex-col items-center justify-center text-center px-4
            transition-all duration-500
            hover:border-sky-500
            hover:bg-[image:linear-gradient(148deg,rgba(255,255,255,1)_0%,rgba(224,242,254,0.97)_50%,rgba(165,216,251,0.95)_100%)]
          "
          style={{
            ...safBackface,
            transform: "rotateY(0deg) translateZ(1px)" as string,
          }}
        >
          {/* depth glow — persistent, intensifies on hover */}
          <div className="pointer-events-none absolute inset-0 opacity-40 transition-opacity duration-500 group-hover/card:opacity-100 bg-[image:radial-gradient(circle_at_22%_18%,rgba(56,189,248,0.22),transparent_52%),radial-gradient(circle_at_80%_82%,rgba(8,145,178,0.16),transparent_48%)]" />
          <Image
            src={getCategoryIconPath(displayProductName)}
            alt={displayProductName}
            width={60}
            height={60}
            sizes="60px"
            quality={75}
            priority={priority}
            onError={(event) => {
              const target = event.currentTarget;
              if (target.src.includes("/Katlogo/rul.png")) return;
              target.src = "/Katlogo/rul.png";
            }}
            className="relative mb-4 transition-transform duration-500 group-hover/card:scale-[1.18]"
          />

          <h3 className="relative text-[13px] font-bold text-slate-800 line-clamp-2 mb-2.5 transition-all duration-200 group-hover/card:text-[13.5px] group-hover/card:text-sky-900">
            {displayProductName}
          </h3>

          <span className="relative px-2.5 py-1 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200/80 transition-colors duration-300 group-hover/card:border-sky-400 group-hover/card:bg-sky-100">
            {children.length} груп
          </span>
        </div>

        {/* BACK */}
        <div
          className="
            absolute inset-0 rounded-xl overflow-hidden
            bg-[image:linear-gradient(148deg,rgba(255,255,255,0.99)_0%,rgba(240,249,255,0.95)_52%,rgba(219,234,254,0.90)_100%)]
            border-2 border-sky-200/80
            flex flex-col px-2 py-2 select-none
            transition-all duration-300
            hover:border-sky-500
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
              h-9 flex items-center justify-between px-2 rounded-lg mb-2
              bg-gradient-to-r from-sky-100/70 via-white/90 to-sky-50/60
              border border-sky-200/50
              transition-all duration-300
              hover:from-sky-200/60 hover:to-sky-100/50
            "
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                flip();
              }}
              title="Повернутись"
              className="min-w-0 flex-1 mx-1 truncate text-left text-[11px] font-semibold text-slate-700 transition-colors duration-200 hover:text-sky-700"
            >
              {buildVisibleProductName(activeGroup?.name || product.name)}
            </button>

            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                aria-label="Попередня сторінка"
                onClick={() => {
                  if (activeGroup) {
                    if (sub === 0) {
                      setActiveGroup(null);
                    } else {
                      setSub(sub - 1);
                    }
                  } else {
                    if (page === 0) {
                      flip();
                    } else {
                      setPage(page - 1);
                    }
                  }
                }}
                className="
                  p-1 min-h-0 min-w-0 text-slate-400
                  transition-all duration-200 hover:text-sky-600 hover:scale-110
                "
              >
                <ArrowLeft className="w-4 h-4" />
              </button>

              <span className="text-[10px] font-semibold text-sky-600/80 px-1 tabular-nums">
                {(activeGroup ? sub : page) + 1}/{activeGroup ? subPageCount : mainPageCount}
              </span>

              <button
                type="button"
                aria-label="Наступна сторінка"
                onClick={() => {
                  const max = activeGroup ? subPages : mainPages;
                  const current = activeGroup ? sub : page;
                  const setter = activeGroup ? setSub : setPage;
                  if (current < max - 1) setter(current + 1);
                }}
                className="
                  p-1 min-h-0 min-w-0 text-slate-400
                  transition-all duration-200 hover:text-sky-600 hover:scale-110
                  disabled:opacity-40 disabled:hover:scale-100 disabled:hover:text-slate-400
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
                      buildCatalogCategoryPath(activeGroup?.name || product.name, item.name, {
                        expandHierarchy: true,
                      })
                    );
                  }
                }}
                className="
                  group/item w-full px-2.5 py-2 rounded-lg text-slate-800 font-medium
                  bg-white/95 border border-sky-100/90
                  hover:bg-[image:linear-gradient(120deg,rgba(224,242,254,0.99)_0%,rgba(255,255,255,0.98)_50%,rgba(191,224,251,0.98)_100%)]
                  hover:border-sky-500 hover:text-sky-800
                  text-left truncate transition-colors duration-200
                "
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] transition-all duration-200 group-hover/item:text-[13.5px] group-hover/item:text-sky-800" title={item.name}>
                    {buildVisibleProductName(item.name)}
                  </span>
                  {hasSubgroups(item) && (
                    <ArrowRight className="w-4 h-4 shrink-0 text-sky-400 transition-colors duration-200 group-hover/item:text-sky-600" />
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
