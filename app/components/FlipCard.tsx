"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { useState, memo, useRef, useEffect } from "react";
import CatalogPrefetchLink from "app/components/CatalogPrefetchLink";
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
  onBoundarySwipe,
  priority = false,
}: {
  product: ProductNode;
  id: number;
  isFlipped: boolean;
  setFlippedId: (id: number | null) => void;
  onBoundarySwipe?: (direction: "prev" | "next") => void;
  priority?: boolean;
}) {
  const reduceMotion = useReducedMotion();

  const [activeGroup, setActiveGroup] = useState<ProductNode | null>(null);
  const [page, setPage] = useState(0);
  const [sub, setSub] = useState(0);

  // Mobile cards are slightly taller so three two-line group names, navigation
  // and pagination fit without clipping on narrow two-column layouts.
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
  const tStartY = useRef(0);

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    tStart.current = e.touches[0]?.clientX ?? 0;
    tStartY.current = e.touches[0]?.clientY ?? 0;
    tEnd.current = tStart.current;
  };

  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (!touch) return;

    tEnd.current = touch.clientX;
    const deltaX = Math.abs(touch.clientX - tStart.current);
    const deltaY = Math.abs(touch.clientY - tStartY.current);
    if (deltaX > 8 && deltaX > deltaY) {
      e.stopPropagation();
    }
  };

  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const touch = e.changedTouches[0];
    if (!touch) return;

    tEnd.current = touch.clientX;
    const diff = tStart.current - tEnd.current;
    const verticalDiff = Math.abs(tStartY.current - touch.clientY);

    if (Math.abs(diff) > 32 && Math.abs(diff) > verticalDiff) {
      const currentPage = activeGroup ? sub : page;
      const pageCount = activeGroup ? subPageCount : mainPageCount;
      const setCurrentPage = activeGroup ? setSub : setPage;

      if (diff > 0) {
        if (currentPage < pageCount - 1) {
          setCurrentPage(currentPage + 1);
        } else {
          onBoundarySwipe?.("next");
        }
        return;
      }

      if (currentPage > 0) {
        setCurrentPage(currentPage - 1);
      } else {
        onBoundarySwipe?.("prev");
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
      className="relative h-[170px] w-full sm:h-[185px]"
      style={{ perspective: 1200 }} // fixed
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
          className={`
            group/card absolute inset-0 rounded-xl overflow-hidden
            border border-slate-200/90 bg-white/92
            flex flex-col items-center justify-center text-center px-3
            shadow-[0_7px_20px_rgba(15,23,42,0.06)]
            transition-[border-color,background-color,box-shadow] duration-300
            hover:border-sky-300 hover:bg-sky-50/55 hover:shadow-[0_10px_24px_rgba(14,116,144,0.1)]
            ${isFlipped ? "pointer-events-none" : ""}
          `}
          style={{
            ...safBackface,
            transform: "rotateY(0deg) translateZ(1px)" as string,
          }}
        >
          <Image
            src={getCategoryIconPath(displayProductName)}
            alt={displayProductName}
            width={60}
            height={60}
            sizes="60px"
            quality={85}
            priority={priority}
            onError={(event) => {
              const target = event.currentTarget;
              if (target.src.includes("/Katlogo/rul.png")) return;
              target.src = "/Katlogo/rul.png";
            }}
            className="relative mb-2.5 h-11 w-11 object-contain opacity-90 transition-opacity duration-300 group-hover/card:opacity-100 sm:h-12 sm:w-12"
          />

          <h3 className="relative mb-2 line-clamp-2 text-[12px] font-bold text-slate-800 transition-colors duration-200 group-hover/card:text-sky-800 sm:text-[13px]">
            {displayProductName}
          </h3>

          <span className="relative text-[10px] font-semibold text-slate-400 transition-colors duration-200 group-hover/card:text-sky-600">
            {children.length} груп
          </span>
        </div>

        {/* BACK */}
        <div
          style={{
            ...safBackface,
            transform: "rotateY(180deg) translateZ(1px)" as string,
          }}
          onClick={(e) => e.stopPropagation()}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={(e) => e.stopPropagation()}
          className={`absolute inset-0 flex touch-pan-y select-none flex-col overflow-hidden rounded-xl border border-sky-300/80 bg-white px-1.5 py-1.5 shadow-[0_10px_26px_rgba(14,116,144,0.12)] transition-colors duration-300 sm:px-2 sm:py-2 ${isFlipped ? "" : "pointer-events-none"}`}
        >
          {/* HEADER */}
          <div
            className="
              mb-1.5 flex h-8 items-center justify-between rounded-lg px-1 sm:mb-2 sm:h-9 sm:px-2
              bg-sky-50/80 border border-sky-100
              transition-colors duration-200 hover:bg-sky-100/70
            "
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                flip();
              }}
              title="Повернутись"
              className="mx-0.5 min-w-0 flex-1 truncate text-left text-[10px] font-semibold text-slate-700 transition-colors duration-200 hover:text-sky-700 sm:mx-1 sm:text-[11px]"
            >
              {buildVisibleProductName(activeGroup?.name || product.name)}
            </button>

            <div className="flex items-center gap-0.5 sm:gap-1.5" onClick={(e) => e.stopPropagation()}>
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
                <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>

              <span className="px-0.5 text-[9px] font-semibold tabular-nums text-sky-600/80 sm:px-1 sm:text-[10px]">
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
                <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>
            </div>
          </div>

          {/* LIST */}
          <div className="flex flex-1 flex-col gap-0.5 overflow-hidden sm:gap-1">
            {(activeGroup ? subVisible : mainVisible).map((item, i) => {
              const itemClassName = `
                group/item flex min-h-[40px] w-full items-center rounded-lg px-2 py-1 font-medium text-slate-800 sm:min-h-0 sm:px-2.5 sm:py-2
                bg-white border border-slate-200/80
                hover:bg-sky-50 hover:border-sky-300 hover:text-sky-800
                text-left transition-colors duration-200
              `;
              const itemContent = (
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="line-clamp-2 min-w-0 text-[11px] leading-[1.15] transition-colors duration-200 group-hover/item:text-sky-800 sm:block sm:truncate sm:text-[13px] sm:leading-normal sm:group-hover/item:text-[13.5px]" title={item.name}>
                    {buildVisibleProductName(item.name)}
                  </span>
                  {hasSubgroups(item) && (
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-sky-400 transition-colors duration-200 group-hover/item:text-sky-600 sm:h-4 sm:w-4" />
                  )}
                </div>
              );

              if (item.children?.length) {
                return (
                  <button
                    key={`${item.name}-${i}`}
                    type="button"
                    onClick={() => {
                      setActiveGroup(item);
                      setSub(0);
                    }}
                    className={itemClassName}
                  >
                    {itemContent}
                  </button>
                );
              }

              return (
                <CatalogPrefetchLink
                  key={`${item.name}-${i}`}
                  href={buildCatalogCategoryPath(
                    activeGroup?.name || product.name,
                    item.name,
                    { expandHierarchy: true }
                  )}
                  className={itemClassName}
                >
                  {itemContent}
                </CatalogPrefetchLink>
              );
            })}

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
