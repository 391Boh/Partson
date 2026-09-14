"use client";

import { useEffect, useRef } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";

import {
  getViewportParallaxProgress,
  registerParallax,
} from "app/lib/parallax-controller";
import { buildProductFaqItems } from "app/lib/product-faq";

type ProductFaqSectionProps = {
  name: string;
  producer: string;
  group: string;
  subGroup: string;
  hasPrice: boolean;
  quantity: number;
};

export default function ProductFaqSection({
  name,
  producer,
  group,
  subGroup,
  hasPrice,
  quantity,
}: ProductFaqSectionProps) {
  const items = buildProductFaqItems({ name, producer, group, subGroup, hasPrice, quantity });
  const sectionRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const glow = glowRef.current;
    if (!section || !glow) return;

    // Same shared scroll/rAF controller the hero photo uses — the glow
    // drifts a little as this card crosses the viewport instead of sitting
    // dead still, which is what actually reads as "parallax" rather than
    // just "has a gradient."
    const handle = registerParallax({
      el: section,
      compute: getViewportParallaxProgress,
      apply: (progress) => {
        const shift = (progress - 0.5) * 36;
        glow.style.transform = `translate3d(0, ${shift.toFixed(2)}px, 0)`;
      },
    });

    return () => handle.release();
  }, []);

  return (
    <div
      ref={sectionRef}
      className="relative overflow-hidden rounded-[22px] border border-teal-100 bg-[linear-gradient(160deg,rgba(255,255,255,0.98)_0%,rgba(240,253,250,0.92)_48%,rgba(236,254,255,0.9)_100%)] p-3 shadow-[0_20px_48px_-18px_rgba(13,148,136,0.2)] ring-1 ring-white/80 sm:rounded-[24px] sm:p-4"
    >
      <span className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-teal-300/70 to-transparent" />
      <span
        ref={glowRef}
        className="pointer-events-none absolute -left-10 top-1/3 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(20,184,166,0.2),transparent_70%)] blur-2xl will-change-transform"
        aria-hidden="true"
      />
      <span className="pointer-events-none absolute -right-8 bottom-0 h-32 w-32 rounded-full bg-[radial-gradient(circle,rgba(14,165,233,0.14),transparent_70%)] blur-2xl" aria-hidden="true" />

      <div className="relative flex items-center gap-2.5 border-b border-slate-900/8 pb-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-teal-500 to-sky-500 text-white shadow-[0_8px_18px_-6px_rgba(13,148,136,0.5)]">
          <HelpCircle size={18} aria-hidden="true" />
        </span>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal-700">Часті запитання</p>
          <h2 className="font-display mt-0.5 text-[1.2rem] font-extrabold leading-[1.15] tracking-[-0.02em] text-slate-900 sm:text-[1.35rem]">
            Популярні запитання
          </h2>
        </div>
      </div>

      <div className="relative mt-2 divide-y divide-slate-900/6">
        {items.map((item, index) => (
          <details key={item.question} className="group py-3" {...(index === 0 ? { open: true } : {})}>
            <summary className="flex cursor-pointer list-none items-start gap-3 [&::-webkit-details-marker]:hidden">
              <span className="font-display mt-0.5 text-[13px] font-black text-teal-600/70 tabular-nums">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="flex-1 text-[14px] font-bold leading-[1.4] text-slate-800 sm:text-[15px]">
                {item.question}
              </h3>
              <ChevronDown
                size={18}
                className="mt-0.5 shrink-0 text-slate-400 transition-transform duration-300 group-open:rotate-180 group-open:text-teal-600"
                aria-hidden="true"
              />
            </summary>
            <p className="mt-2 pl-[27px] text-[13.5px] font-medium leading-[1.62] text-slate-600 sm:text-sm">
              {item.answer}
            </p>
          </details>
        ))}
      </div>
    </div>
  );
}
