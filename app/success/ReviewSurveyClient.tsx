"use client";

import { X } from "lucide-react";
import { useState } from "react";
import StarRatingInput from "app/components/StarRatingInput";

type State = "idle" | "submitting" | "done" | "dismissed";

export default function ReviewSurveyClient() {
  const [state, setState] = useState<State>("idle");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [authorName, setAuthorName] = useState("");

  if (state === "dismissed") return null;

  if (state === "done") {
    return (
      <div className="mt-4 rounded-[20px] border border-emerald-100 bg-emerald-50/70 px-5 py-4 text-center shadow-[0_8px_20px_rgba(16,185,129,0.08)]">
        <p className="text-[15px] font-black text-emerald-700">
          Дякуємо за відгук!
        </p>
        <p className="mt-0.5 text-[13px] font-medium text-emerald-600">
          Ви допомагаєте нам ставати кращими.
        </p>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1) return;
    setState("submitting");
    try {
      await fetch("/api/reviews/shop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment, authorName }),
      });
    } catch {
      // silent fail — still show thank you
    }
    setState("done");
  };

  return (
    <div className="mt-4 rounded-[20px] border border-slate-200/80 bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-black text-slate-900">
            Як пройшло оформлення?
          </p>
          <p className="mt-0.5 text-[12px] font-medium text-slate-500">
            Це займе 10 секунд і допоможе нам стати кращими
          </p>
        </div>
        <button
          type="button"
          onClick={() => setState("dismissed")}
          aria-label="Пропустити"
          className="mt-0.5 shrink-0 rounded-[8px] p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        >
          <X size={15} />
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="flex justify-center">
          <StarRatingInput
            value={rating}
            onChange={setRating}
            size={36}
            disabled={state === "submitting"}
          />
        </div>

        {rating > 0 && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <input
              type="text"
              placeholder="Ваше ім'я (необов'язково)"
              maxLength={60}
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              className="w-full rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2.5 text-[14px] text-slate-800 placeholder:text-slate-400 focus:border-sky-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-200/70"
            />
            <textarea
              placeholder="Що сподобалось або що можна покращити?"
              maxLength={500}
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="w-full resize-none rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2.5 text-[14px] text-slate-800 placeholder:text-slate-400 focus:border-sky-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-200/70"
            />
          </div>
        )}

        {rating > 0 && (
          <div className="mt-4 flex justify-center">
            <button
              type="submit"
              disabled={state === "submitting"}
              className="inline-flex items-center gap-1.5 rounded-[14px] bg-sky-600 px-6 py-2.5 text-[13px] font-black text-white shadow-[0_8px_20px_rgba(14,165,233,0.28)] transition hover:bg-sky-700 disabled:opacity-60"
            >
              {state === "submitting" ? "Надсилаємо..." : "Надіслати оцінку"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
