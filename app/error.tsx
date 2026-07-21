"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

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
    <div className="page-shell-inline flex min-h-[55vh] flex-col items-center justify-center gap-4 py-16 text-center">
      <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-600">
        <AlertTriangle size={28} aria-hidden />
      </span>
      <h1 className="font-display text-2xl font-black text-slate-900 sm:text-3xl">
        Щось пішло не так
      </h1>
      <p className="max-w-md text-sm leading-6 text-slate-600">
        Сталася тимчасова помилка на сторінці. Спробуйте ще раз — якщо
        повториться, напишіть нам у чат.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex min-h-11 items-center gap-2 rounded-[13px] border border-sky-300/60 bg-[image:linear-gradient(135deg,#0284c7_0%,#0ea5e9_100%)] px-5 text-[13px] font-bold text-white shadow-[0_10px_24px_rgba(14,165,233,0.24)] transition hover:brightness-[1.06]"
        >
          Спробувати ще раз
        </button>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-2 rounded-[13px] border border-slate-200 bg-white px-5 text-[13px] font-bold text-slate-700 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800"
        >
          На головну
        </Link>
      </div>
    </div>
  );
}
