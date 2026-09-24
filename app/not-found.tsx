import Link from "next/link";
import { ArrowRight, Home, PackageSearch, SearchX } from "lucide-react";

export const metadata = {
  title: "Сторінку не знайдено",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className="page-shell-inline relative isolate flex min-h-[70vh] flex-col items-center justify-center overflow-hidden py-16 text-center">
      <span className="notfound-aurora" aria-hidden="true" />

      <span className="notfound-digits" aria-hidden="true">
        404
      </span>

      <span className="notfound-badge relative mb-5 inline-flex h-20 w-20 items-center justify-center rounded-[26px] border border-sky-200/80 bg-white/90 text-sky-600 shadow-[0_18px_44px_-16px_rgba(14,165,233,0.4),inset_0_1px_0_#fff] backdrop-blur-sm">
        <span className="notfound-badge-glow" aria-hidden="true" />
        <SearchX size={30} strokeWidth={2} aria-hidden className="relative z-10" />
      </span>

      {/* A grounded backdrop plate — the aurora blobs and the big "404"
          watermark both drift behind this, so the actual message text needs
          a guaranteed-solid surface under it rather than trusting whatever
          the decorative background happens to look like at any moment. */}
      <div className="notfound-textcard relative rounded-[22px] border border-white/70 bg-white/80 px-6 py-5 shadow-[0_8px_28px_-18px_rgba(15,23,42,0.18)] backdrop-blur-md sm:px-8">
        <h1 className="notfound-heading font-display text-[26px] font-black leading-tight tracking-tight text-slate-900 sm:text-4xl">
          Сторінку не знайдено
        </h1>
        <p className="mx-auto mt-3 max-w-md text-[15.5px] font-medium leading-7 text-slate-700">
          Товар чи розділ, який ви шукали, могли перейменувати або прибрати з
          каталогу. Спробуйте пошук ще раз або поверніться на головну.
        </p>
      </div>

      <div className="relative mt-7 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="group/home inline-flex min-h-12 items-center gap-2.5 rounded-[15px] border border-sky-300/60 bg-[image:linear-gradient(135deg,#0284c7_0%,#0ea5e9_55%,#2dd4bf_100%)] px-6 text-[13.5px] font-extrabold text-white shadow-[0_16px_32px_-10px_rgba(14,165,233,0.5)] transition-[filter,transform] duration-200 ease-out hover:brightness-[1.08] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
        >
          <Home size={16} strokeWidth={2.4} aria-hidden />
          На головну
          <ArrowRight
            size={15}
            strokeWidth={2.8}
            aria-hidden
            className="transition-transform duration-200 ease-out group-hover/home:translate-x-1"
          />
        </Link>
        <Link
          href="/katalog"
          className="group/catalog inline-flex min-h-12 items-center gap-2.5 rounded-[15px] border border-slate-200 bg-white/90 px-6 text-[13.5px] font-extrabold text-slate-700 shadow-[0_10px_26px_-14px_rgba(15,23,42,0.22)] backdrop-blur-sm transition-colors duration-200 ease-out hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60"
        >
          <PackageSearch size={16} strokeWidth={2.4} aria-hidden />
          До каталогу
        </Link>
      </div>
    </div>
  );
}
