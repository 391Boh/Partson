"use client";

import {
  ChevronDown,
  RefreshCcw,
  Send,
  Star,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import StarRatingInput from "./StarRatingInput";
import { observeNearViewport } from "app/lib/shared-intersection-observer";

interface Review {
  id: string;
  rating: number;
  comment: string;
  authorName: string;
  createdAt: string | null;
}

const Stars = ({ rating, size = 12 }: { rating: number; size?: number }) => (
  <span className="flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map((s) => (
      <Star
        key={s}
        size={size}
        className={
          s <= rating
            ? "fill-amber-400 text-amber-400"
            : "fill-transparent text-slate-300"
        }
      />
    ))}
  </span>
);

const fmtDate = (iso: string | null) => {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("uk-UA", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return "";
  }
};

export default function ProductReviewsSection({
  productCode,
  initialReviews = null,
}: {
  productCode: string;
  initialReviews?: Review[] | null;
}) {
  const [reviews, setReviews] = useState<Review[]>(initialReviews ?? []);
  const [loading, setLoading] = useState(initialReviews === null);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [authorName, setAuthorName] = useState("");
  const sectionRef = useRef<HTMLElement>(null);
  const activeRequestRef = useRef<AbortController | null>(null);
  const requestVersionRef = useRef(0);

  const load = useCallback(async (cacheBust = false) => {
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    activeRequestRef.current?.abort();
    setLoadError(false);
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (requestVersion !== requestVersionRef.current) return;
      const controller = new AbortController();
      activeRequestRef.current = controller;
      const timeoutId = window.setTimeout(() => controller.abort(), 5200);

      try {
        const params = new URLSearchParams({ code: productCode });
        if (cacheBust || attempt > 0) params.set("_refresh", String(Date.now()));
        const res = await fetch(`/api/reviews?${params.toString()}`, {
          headers: { Accept: "application/json" },
          cache: cacheBust ? "no-store" : "default",
          signal: controller.signal,
        });
        const data = (await res.json().catch(() => ({}))) as {
          reviews?: Review[];
          retryable?: boolean;
        };

        if (!res.ok) {
          if (data.retryable !== false && attempt === 0) {
            await new Promise((resolve) => window.setTimeout(resolve, 220));
            continue;
          }
          throw new Error("reviews-request-failed");
        }

        if (requestVersion === requestVersionRef.current) {
          setReviews(Array.isArray(data.reviews) ? data.reviews : []);
          setLoading(false);
        }
        return;
      } catch (error) {
        lastError = error;
        if (requestVersion !== requestVersionRef.current) return;
        if (attempt === 0) {
          await new Promise((resolve) => window.setTimeout(resolve, 220));
          continue;
        }
      } finally {
        window.clearTimeout(timeoutId);
      }
    }

    if (requestVersion === requestVersionRef.current) {
      setLoading(false);
      setLoadError(Boolean(lastError));
    }
  }, [productCode]);

  useEffect(() => {
    requestVersionRef.current += 1;
    activeRequestRef.current?.abort();
    setReviews(initialReviews ?? []);
    setLoading(initialReviews === null);
    setLoadError(false);
    setShowAll(false);

    // Reviews already render from SSR. Refresh when the reader approaches
    // this section, leaving bandwidth and main-thread time for the hero.
    let stopObserving = () => {};
    if (sectionRef.current && typeof IntersectionObserver !== "undefined") {
      stopObserving = observeNearViewport(sectionRef.current, "300px", () => { void load(); });
    } else {
      void load();
    }

    return () => {
      stopObserving();
      requestVersionRef.current += 1;
      activeRequestRef.current?.abort();
    };
  }, [initialReviews, load]);

  const avgRating =
    reviews.length > 0
      ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
      : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productCode, rating, comment, authorName }),
      });
      if (!response.ok) throw new Error("review-submit-failed");
      setSubmitted(true);
      setShowForm(false);
      setRating(0);
      setComment("");
      setAuthorName("");
      await load(true);
    } catch {
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  };

  const visible = showAll ? reviews : reviews.slice(0, 3);

  return (
    <section ref={sectionRef} className="product-reviews border-t border-slate-100/80 px-3 py-3 sm:px-4 sm:py-3.5">
      <div className="product-reviews-card overflow-hidden rounded-[16px] border border-slate-200/80 bg-white shadow-[0_10px_22px_rgba(15,23,42,0.05)]">
        {/* ── header ── */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-100 bg-[linear-gradient(135deg,rgba(248,250,252,0.99),rgba(240,249,255,0.97)_50%,rgba(255,255,255,0.94)_100%)] px-3.5 py-2.5 sm:px-4">
          <div className="flex items-center gap-2.5">
            <div>
              <h2 className="product-reviews-title text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                Відгуки покупців
              </h2>
              {!loading && reviews.length > 0 && (
                <div className="mt-0.5 flex items-center gap-2">
                  <Stars rating={Math.round(avgRating)} size={12} />
                  <span className="text-[12px] font-black text-slate-800">
                    {avgRating.toFixed(1)}
                  </span>
                  <span className="text-[11px] font-medium text-slate-400">
                    ({reviews.length}{" "}
                    {reviews.length === 1
                      ? "відгук"
                      : reviews.length < 5
                        ? "відгуки"
                        : "відгуків"}
                    )
                  </span>
                </div>
              )}
            </div>
          </div>
          {/* With no reviews yet the empty state carries the one action. */}
          {!showForm && !submitted && !loading && reviews.length > 0 && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="product-reviews-empty-secondary"
            >
              <Star size={13} aria-hidden="true" />
              Залишити відгук
            </button>
          )}
        </div>

        {/* ── body ── */}
        <div className="px-3.5 py-3 sm:px-4">
          {/* form */}
          {showForm && (
            <form
              onSubmit={handleSubmit}
              className="mb-3 rounded-[14px] border border-sky-100 bg-[linear-gradient(135deg,rgba(240,249,255,0.55),rgba(255,255,255,0.98))] p-3"
            >
              <p className="mb-2 text-[12px] font-black text-slate-800">
                Ваша оцінка
              </p>
              <StarRatingInput
                value={rating}
                onChange={setRating}
                size={28}
                disabled={submitting}
              />
              <div className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
                <input
                  type="text"
                  placeholder="Ваше ім'я (необов'язково)"
                  maxLength={60}
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  className="w-full rounded-[11px] border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200/70"
                />
                <textarea
                  placeholder="Ваш відгук (необов'язково)"
                  maxLength={500}
                  rows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full resize-none rounded-[11px] border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200/70"
                />
              </div>
              <div className="mt-2.5 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={rating < 1 || submitting}
                  className="inline-flex items-center gap-1.5 rounded-[11px] bg-sky-600 px-3.5 py-1.5 text-[12px] font-black text-white shadow-[0_6px_16px_rgba(14,165,233,0.28)] transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Send size={11} />
                  {submitting ? "Надсилаємо..." : "Надіслати"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setRating(0);
                    setComment("");
                    setAuthorName("");
                  }}
                  className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-400 transition hover:text-slate-600"
                >
                  Скасувати
                </button>
              </div>
              {submitError ? (
                <p role="alert" className="mt-2 text-[11px] font-bold text-rose-600">
                  Не вдалося надіслати відгук. Перевірте з’єднання та спробуйте ще раз.
                </p>
              ) : null}
            </form>
          )}

          {/* thank you */}
          {submitted && (
            <div className="mb-3 rounded-[12px] border border-emerald-100 bg-emerald-50/60 px-3.5 py-2.5 text-center">
              <p className="text-[13px] font-black text-emerald-700">
                Дякуємо за відгук!
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-emerald-600">
                Ваша оцінка допомагає іншим покупцям.
              </p>
            </div>
          )}

          {/* Same height as the empty state most products end up in, so the
              section does not grow under the reader when reviews arrive. */}
          {loading && (
            <div className="product-reviews-loading">
              <span className="inline-flex items-center gap-2 text-[12px] font-bold text-slate-500">
                <RefreshCcw
                  size={14}
                  className="animate-spin text-sky-500"
                  aria-hidden="true"
                />
                Перевіряємо актуальні відгуки…
              </span>
            </div>
          )}

          {/* A temporary backend delay must not look like a broken product page. */}
          {!loading && loadError && reviews.length === 0 && (
            <ReviewEmptyState
              onWriteReview={() => setShowForm(true)}
              onRefresh={() => {
                setLoading(true);
                void load(true);
              }}
              canRefresh
            />
          )}

          {/* empty state */}
          {!loading && !loadError && reviews.length === 0 && !showForm && (
            <ReviewEmptyState onWriteReview={() => setShowForm(true)} />
          )}

          {/* review list */}
          {!loading && reviews.length > 0 && (
            <div className="space-y-1.5">
              {visible.map((review) => (
                <div
                  key={review.id}
                  className="rounded-[14px] border border-slate-200/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] px-3.5 py-3 shadow-[0_5px_14px_rgba(15,23,42,0.045)] transition-[border-color,box-shadow,background-color] duration-200 hover:border-sky-200 hover:bg-sky-50/30 hover:shadow-[0_9px_20px_rgba(14,165,233,0.08)]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Stars rating={review.rating} size={11} />
                      <span className="text-[12px] font-black text-slate-700">
                        {review.authorName || "Анонімний покупець"}
                      </span>
                    </div>
                    {review.createdAt && (
                      <span className="text-[10px] font-medium text-slate-400">
                        {fmtDate(review.createdAt)}
                      </span>
                    )}
                  </div>
                  {review.comment && (
                    <p className="mt-1 text-[12px] font-medium leading-5 text-slate-600">
                      {review.comment}
                    </p>
                  )}
                </div>
              ))}
              {reviews.length > 3 && (
                <button
                  type="button"
                  onClick={() => setShowAll((p) => !p)}
                  className="flex w-full items-center justify-center gap-1 rounded-[11px] border border-slate-200 bg-white py-1.5 text-[11px] font-bold text-slate-500 transition hover:border-sky-200 hover:text-sky-600"
                >
                  <ChevronDown
                    size={12}
                    className={showAll ? "rotate-180 transition-transform" : "transition-transform"}
                  />
                  {showAll
                    ? "Згорнути"
                    : `Показати ще ${reviews.length - 3}`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ReviewEmptyState({
  onWriteReview,
  onRefresh,
  canRefresh = false,
}: {
  onWriteReview: () => void;
  onRefresh?: () => void;
  canRefresh?: boolean;
}) {
  return (
    <div className="product-reviews-empty">
      <span className="product-reviews-empty-icon" aria-hidden="true">
        <Star size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold text-slate-900">Відгуків про цей товар ще немає</p>
        <p className="mt-0.5 text-[13px] leading-5 text-slate-600">
          Поділіться досвідом — ваша оцінка допоможе іншим покупцям швидше
          визначитися з вибором.
        </p>
      </div>
      <div className="product-reviews-empty-actions">
        {canRefresh && onRefresh ? (
          <button type="button" onClick={onRefresh} className="product-reviews-empty-secondary">
            <RefreshCcw size={13} aria-hidden="true" />
            Оновити
          </button>
        ) : null}
        <button type="button" onClick={onWriteReview} className="product-reviews-empty-action">
          <Star size={13} aria-hidden="true" />
          Залишити перший відгук
        </button>
      </div>
    </div>
  );
}
