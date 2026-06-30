function ProductCardSkeleton() {
  return (
    <div className="flex h-[130px] items-center gap-3 rounded-[18px] border border-slate-200/70 bg-white/90 p-3 shadow-[0_2px_8px_rgba(15,23,42,0.05)]">
      <div className="skeleton-item h-[72px] w-[72px] shrink-0 rounded-[14px] bg-slate-200/80" />
      <div className="min-w-0 flex-1">
        <div className="skeleton-item h-4 w-4/5 rounded-full bg-slate-200/70" />
        <div className="skeleton-item mt-1 h-3 w-3/5 rounded-full bg-slate-200/60" />
        <div className="mt-2 flex gap-1.5">
          <div className="skeleton-item h-5 w-20 rounded-full bg-emerald-100/70" />
        </div>
        <div className="mt-1.5 flex gap-2">
          <div className="skeleton-item h-7 w-24 rounded-xl bg-sky-100/80" />
          <div className="skeleton-item h-7 w-7 rounded-xl bg-slate-200/60" />
        </div>
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div className="page-loading-shell" role="status" aria-label="Завантаження каталогу...">
      <span className="sr-only">Завантаження каталогу...</span>

      {/* Filter bar */}
      <div className="page-shell-inline py-3">
        <div className="flex items-center gap-2 overflow-hidden rounded-[16px] border border-white/72 bg-white/76 px-3 py-2.5 shadow-[0_4px_16px_rgba(15,23,42,0.06)] backdrop-blur-md">
          <div className="skeleton-item h-9 w-9 shrink-0 rounded-xl bg-slate-200/70" />
          <div className="skeleton-item h-8 flex-1 rounded-xl bg-slate-200/60" />
          <div className="skeleton-item h-9 w-28 shrink-0 rounded-xl bg-sky-100/70" />
          <div className="skeleton-item h-9 w-28 shrink-0 rounded-xl bg-slate-200/60" />
        </div>
      </div>

      {/* Product grid */}
      <div className="page-shell-inline pb-6 pt-1">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-2.5 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
