"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="page-shell-inline flex min-h-[55vh] flex-col items-center justify-center py-16">
      <div className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-white bg-white/90 px-6 py-8 text-center shadow-[0_30px_80px_rgba(15,56,86,0.14),0_8px_24px_rgba(217,119,6,0.08),inset_0_1px_0_white] ring-1 ring-amber-100/80 sm:px-10 sm:py-10">
        <span className="pointer-events-none absolute inset-x-10 top-0 z-10 h-[3px] rounded-b-full bg-gradient-to-r from-transparent via-amber-500 to-orange-400 shadow-[0_4px_18px_rgba(217,119,6,0.4)]" />
        <div className="relative z-10 flex flex-col items-center gap-4">
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-200 bg-[linear-gradient(145deg,#fffbeb,#fef3c7)] text-amber-600 shadow-[0_10px_24px_rgba(217,119,6,0.16),inset_0_1px_0_white]">
            <AlertTriangle size={28} aria-hidden />
          </span>
          <h1 className="font-display text-2xl font-black text-slate-900 sm:text-3xl">
            Щось пішло не так
          </h1>
          <p className="max-w-sm text-sm leading-6 text-slate-600">
            Сталася тимчасова помилка на сторінці. Спробуйте ще раз — якщо
            повториться, напишіть нам у чат.
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => reset()}
              className="inline-flex min-h-11 items-center gap-2 rounded-[13px] border border-sky-300/60 bg-[image:linear-gradient(135deg,#0284c7_0%,#0ea5e9_100%)] px-5 text-[13px] font-bold text-white shadow-[0_10px_24px_rgba(14,165,233,0.24)] transition hover:brightness-[1.06]"
            >
              <RotateCcw size={16} aria-hidden />
              Спробувати ще раз
            </button>
            <Link
              href="/"
              className="inline-flex min-h-11 items-center gap-2 rounded-[13px] border border-slate-200 bg-white px-5 text-[13px] font-bold text-slate-700 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800"
            >
              <Home size={16} aria-hidden />
              На головну
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
