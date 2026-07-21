import Link from "next/link";
import { PackageSearch } from "lucide-react";

export const metadata = {
  title: "Сторінку не знайдено | PartsON",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className="page-shell-inline flex min-h-[55vh] flex-col items-center justify-center gap-4 py-16 text-center">
      <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-sky-200 bg-sky-50 text-sky-600">
        <PackageSearch size={28} aria-hidden />
      </span>
      <h1 className="font-display text-2xl font-black text-slate-900 sm:text-3xl">
        Сторінку не знайдено
      </h1>
      <p className="max-w-md text-sm leading-6 text-slate-600">
        Товар чи розділ, який ви шукали, могли перейменувати або прибрати з
        каталогу. Спробуйте пошук ще раз.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-2 rounded-[13px] border border-sky-300/60 bg-[image:linear-gradient(135deg,#0284c7_0%,#0ea5e9_100%)] px-5 text-[13px] font-bold text-white shadow-[0_10px_24px_rgba(14,165,233,0.24)] transition hover:brightness-[1.06]"
        >
          На головну
        </Link>
        <Link
          href="/katalog"
          className="inline-flex min-h-11 items-center gap-2 rounded-[13px] border border-slate-200 bg-white px-5 text-[13px] font-bold text-slate-700 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800"
        >
          До каталогу
        </Link>
      </div>
    </div>
  );
}
