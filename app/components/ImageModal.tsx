"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Minus, Plus, RotateCcw, X } from "lucide-react";
import { createPortal } from "react-dom";

interface ImageModalProps {
  src: string;
  onClose: () => void;
}

type TransformState = {
  scale: number;
  x: number;
  y: number;
};

type Point = {
  x: number;
  y: number;
};

const INITIAL_TRANSFORM: TransformState = { scale: 1, x: 0, y: 0 };
const MIN_SCALE = 1;
const MAX_SCALE = 4.5;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export default function ImageModal({ src, onClose }: ImageModalProps) {
  const [transform, setTransform] = useState<TransformState>(INITIAL_TRANSFORM);
  const [isDragging, setIsDragging] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const clampOffset = useCallback((offset: Point, nextScale: number) => {
    if (nextScale <= 1) return { x: 0, y: 0 };

    const stage = stageRef.current;
    if (!stage) return offset;

    const rect = stage.getBoundingClientRect();
    const maxX = Math.max(0, ((rect.width * nextScale) - rect.width) / 2);
    const maxY = Math.max(0, ((rect.height * nextScale) - rect.height) / 2);

    return {
      x: clamp(offset.x, -maxX, maxX),
      y: clamp(offset.y, -maxY, maxY),
    };
  }, []);

  const resetTransform = useCallback(() => {
    dragStateRef.current = null;
    setIsDragging(false);
    setTransform(INITIAL_TRANSFORM);
  }, []);

  const applyScale = useCallback(
    (nextScaleValue: number, focalPoint?: Point) => {
      setTransform((current) => {
        const nextScale = clamp(nextScaleValue, MIN_SCALE, MAX_SCALE);
        if (nextScale === MIN_SCALE) {
          return INITIAL_TRANSFORM;
        }

        if (!focalPoint || current.scale === nextScale) {
          const bounded = clampOffset({ x: current.x, y: current.y }, nextScale);
          return { scale: nextScale, x: bounded.x, y: bounded.y };
        }

        const nextOffset = {
          x: focalPoint.x - ((focalPoint.x - current.x) * nextScale) / current.scale,
          y: focalPoint.y - ((focalPoint.y - current.y) * nextScale) / current.scale,
        };
        const bounded = clampOffset(nextOffset, nextScale);
        return { scale: nextScale, x: bounded.x, y: bounded.y };
      });
    },
    [clampOffset]
  );

  const stepZoomIn = useCallback(() => {
    setTransform((current) => {
      const nextScale = clamp(current.scale + 0.35, MIN_SCALE, MAX_SCALE);
      const bounded = clampOffset({ x: current.x, y: current.y }, nextScale);
      return { scale: nextScale, x: bounded.x, y: bounded.y };
    });
  }, [clampOffset]);

  const stepZoomOut = useCallback(() => {
    setTransform((current) => {
      const nextScale = clamp(current.scale - 0.35, MIN_SCALE, MAX_SCALE);
      if (nextScale === MIN_SCALE) return INITIAL_TRANSFORM;
      const bounded = clampOffset({ x: current.x, y: current.y }, nextScale);
      return { scale: nextScale, x: bounded.x, y: bounded.y };
    });
  }, [clampOffset]);

  const getFocalPoint = useCallback((clientX: number, clientY: number) => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const rect = stage.getBoundingClientRect();
    return {
      x: clientX - rect.left - rect.width / 2,
      y: clientY - rect.top - rect.height / 2,
    };
  }, []);

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      const focalPoint = getFocalPoint(event.clientX, event.clientY);
      const delta = event.deltaY < 0 ? 0.28 : -0.24;
      applyScale(transform.scale + delta, focalPoint);
    },
    [applyScale, getFocalPoint, transform.scale]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (transform.scale <= 1) return;

      dragStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: transform.x,
        originY: transform.y,
      };
      setIsDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [transform.scale, transform.x, transform.y]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;

      const nextOffset = {
        x: dragState.originX + (event.clientX - dragState.startX),
        y: dragState.originY + (event.clientY - dragState.startY),
      };
      const bounded = clampOffset(nextOffset, transform.scale);
      setTransform((current) => ({ ...current, x: bounded.x, y: bounded.y }));
    },
    [clampOffset, transform.scale]
  );

  const handlePointerEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (dragState?.pointerId !== event.pointerId) return;

    dragStateRef.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const handleDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const focalPoint = getFocalPoint(event.clientX, event.clientY);
      if (transform.scale > 1.05) {
        resetTransform();
        return;
      }

      applyScale(2.2, focalPoint);
    },
    [applyScale, getFocalPoint, resetTransform, transform.scale]
  );

  useEffect(() => {
    resetTransform();
  }, [resetTransform, src]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.classList.add("catalog-image-modal-open");
    body.style.overflow = "hidden";

    return () => {
      body.classList.remove("catalog-image-modal-open");
      body.style.overflow = previousOverflow;
    };
  }, []);

  const modalNode = (
    <motion.div
      className="fixed inset-0 z-[1600] flex items-center justify-center bg-black/72 p-3 backdrop-blur-md sm:p-5"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="relative flex h-[min(88vh,980px)] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[image:linear-gradient(180deg,rgba(2,6,23,0.98)_0%,rgba(15,23,42,0.98)_100%)] shadow-[0_36px_90px_rgba(2,6,23,0.58)]"
        onClick={(event) => event.stopPropagation()}
        initial={{ scale: 0.94, y: 28, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.96, y: 20, opacity: 0 }}
        transition={{ type: "spring", damping: 22, stiffness: 220 }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-3 text-white sm:px-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-[-0.02em] text-white/92">
              Фото товару
            </p>
            <p className="text-[11px] text-white/55">
              Колесо миші, подвійний клік або кнопки для збільшення
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={stepZoomOut}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/12 bg-white/8 text-white/84 transition hover:border-white/24 hover:bg-white/14"
              title="Зменшити"
              aria-label="Зменшити фото"
            >
              <Minus size={16} />
            </button>
            <button
              type="button"
              onClick={resetTransform}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/12 bg-white/8 text-white/84 transition hover:border-white/24 hover:bg-white/14"
              title="Скинути"
              aria-label="Скинути масштаб"
            >
              <RotateCcw size={15} />
            </button>
            <button
              type="button"
              onClick={stepZoomIn}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/12 bg-white/8 text-white/84 transition hover:border-white/24 hover:bg-white/14"
              title="Збільшити"
              aria-label="Збільшити фото"
            >
              <Plus size={16} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/12 bg-white/8 text-white/84 transition hover:border-white/24 hover:bg-white/14"
              title="Закрити"
              aria-label="Закрити фото"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div
          ref={stageRef}
          className="relative min-h-0 flex-1 overflow-hidden bg-[radial-gradient(circle_at_center,rgba(30,41,59,0.88)_0%,rgba(2,6,23,0.98)_78%)]"
          onWheel={handleWheel}
          onDoubleClick={handleDoubleClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          style={{
            touchAction: transform.scale > 1 ? "none" : "manipulation",
            cursor:
              transform.scale > 1 ? (isDragging ? "grabbing" : "grab") : "zoom-in",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt="Збільшене зображення товару"
            draggable={false}
            className="h-full w-full select-none object-contain"
            style={{
              transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
              transformOrigin: "center center",
              transition: isDragging ? "none" : "transform 180ms ease-out",
            }}
          />

          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/12 bg-black/28 px-3 py-1 text-[11px] font-medium text-white/78 backdrop-blur-md">
            Масштаб: {transform.scale.toFixed(1)}x
          </div>
        </div>
      </motion.div>
    </motion.div>
  );

  if (typeof document === "undefined") return null;

  return createPortal(modalNode, document.body);
}
