"use client";

import { useState } from "react";
import { ChevronRight, Send, Star } from "lucide-react";
import StarRatingInput from "./StarRatingInput";
import SmartLink from "./SmartLink";
import { buildProductPath, buildVisibleProductName } from "app/lib/product-url";

export interface OrderReviewItem {
  code: string;
  article?: string;
  name: string;
  producer?: string;
  group?: string;
  subGroup?: string;
  category?: string;
}

type ItemState = {
  expanded: boolean;
  rating: number;
  comment: string;
  submitting: boolean;
  submitted: boolean;
  error: boolean;
};

const EMPTY_STATE: ItemState = {
  expanded: false,
  rating: 0,
  comment: "",
  submitting: false,
  submitted: false,
  error: false,
};

// Dedupe by code — the same product can appear more than once in cartItems
// if the same code was added, removed, and re-added at different points.
const dedupeItems = (items: OrderReviewItem[]) => {
  const seen = new Set<string>();
  const result: OrderReviewItem[] = [];
  for (const item of items) {
    const code = (item.code || "").trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    result.push(item);
  }
  return result;
};

export default function OrderProductReviews({ items }: { items: OrderReviewItem[] }) {
  const products = dedupeItems(items);
  const [statesByCode, setStatesByCode] = useState<Record<string, ItemState>>({});

  if (products.length === 0) return null;

  const getState = (code: string): ItemState => statesByCode[code] ?? EMPTY_STATE;
  const patchState = (code: string, patch: Partial<ItemState>) =>
    setStatesByCode((prev) => ({ ...prev, [code]: { ...getState(code), ...patch } }));

  const handleSubmit = async (item: OrderReviewItem) => {
    const state = getState(item.code);
    if (state.rating < 1) return;
    patchState(item.code, { submitting: true, error: false });
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productCode: item.code,
          rating: state.rating,
          comment: state.comment,
        }),
      });
      if (!response.ok) throw new Error("review-submit-failed");
      patchState(item.code, { submitting: false, submitted: true });
    } catch {
      patchState(item.code, { submitting: false, error: true });
    }
  };

  return (
    <div className="soft-surface-card rounded-[16px] px-3.5 py-3">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[9px] bg-sky-50 text-sky-500">
          <Star size={12} fill="currentColor" aria-hidden="true" />
        </span>
        <p className="text-sm font-bold text-slate-900">Оцініть куплені товари</p>
      </div>

      <div className="mt-2.5 flex flex-col gap-1.5">
        {products.map((item) => {
          const state = getState(item.code);
          const displayName = buildVisibleProductName(item.name);
          const productHref = buildProductPath(item);

          if (state.submitted) {
            return (
              <div
                key={item.code}
                className="flex items-center gap-2 rounded-[12px] border border-emerald-100 bg-emerald-50/60 px-3 py-2.5"
              >
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-emerald-700">
                  {displayName}
                </span>
                <span className="shrink-0 text-[11px] font-bold text-emerald-600">
                  Дякуємо за відгук!
                </span>
              </div>
            );
          }

          return (
            <div
              key={item.code}
              className="rounded-[12px] border border-slate-200 bg-white px-3 py-2.5"
            >
              <div className="flex items-center gap-2">
                <SmartLink
                  href={productHref}
                  className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800 hover:text-sky-700"
                >
                  {displayName}
                </SmartLink>
                {!state.expanded && (
                  <button
                    type="button"
                    onClick={() => patchState(item.code, { expanded: true })}
                    className="inline-flex shrink-0 items-center gap-1 rounded-[9px] border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-black text-sky-700 transition hover:border-sky-300 hover:bg-sky-100"
                  >
                    Оцінити
                    <ChevronRight size={12} />
                  </button>
                )}
              </div>

              {state.expanded && (
                <div className="mt-2">
                  <StarRatingInput
                    value={state.rating}
                    onChange={(rating) => patchState(item.code, { rating })}
                    size={22}
                    disabled={state.submitting}
                  />

                  {state.rating > 0 && (
                    <>
                      <textarea
                        value={state.comment}
                        onChange={(e) => patchState(item.code, { comment: e.target.value })}
                        maxLength={500}
                        rows={2}
                        placeholder="Ваш відгук про товар (необов'язково)"
                        className="mt-2 w-full resize-none rounded-[10px] border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs leading-5 text-slate-700 placeholder-slate-400 outline-none transition focus:border-sky-300 focus:bg-white focus:ring-2 focus:ring-sky-200/60"
                      />
                      <button
                        type="button"
                        disabled={state.submitting}
                        onClick={() => handleSubmit(item)}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-[10px] bg-sky-600 px-3 py-1.5 text-[11px] font-black text-white shadow-[0_6px_16px_rgba(14,165,233,0.28)] transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Send size={11} />
                        {state.submitting ? "Надсилаємо..." : "Надіслати відгук"}
                      </button>
                      {state.error && (
                        <p role="alert" className="mt-1.5 text-[11px] font-bold text-rose-600">
                          Не вдалося надіслати відгук. Спробуйте ще раз.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
