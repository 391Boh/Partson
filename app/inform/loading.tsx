function TabSkeleton() {
  return (
    <div className="skeleton-item rounded-xl border border-slate-200/60 bg-white/70 py-3 px-3">
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 shrink-0 rounded-full bg-slate-200/80" />
        <div className="h-3.5 w-16 rounded-full bg-slate-200/70" />
      </div>
      <div className="mt-1 h-3 w-20 rounded-full bg-slate-200/50" />
    </div>
  );
}

export default function InformLoading() {
  return (
    <div
      className="page-loading-shell relative min-h-[calc(100vh-4rem)] overflow-hidden"
      style={{ background: "linear-gradient(160deg,#f0f9ff 0%,#e8f4fd 40%,#eef2ff 100%)" }}
      role="status"
      aria-label="Завантаження інформації..."
    >
      <span className="sr-only">Завантаження інформації...</span>

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-40 -top-40 h-[500px] w-[500px] rounded-full bg-sky-200/20 blur-[80px]" />
        <div className="absolute -left-32 top-1/2 h-[400px] w-[400px] rounded-full bg-indigo-200/15 blur-[70px]" />
      </div>

      <section className="page-shell-inline relative grid gap-5 py-5 sm:py-7">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5">
          <div className="skeleton-item h-3 w-16 rounded-full bg-slate-200/60" />
          <div className="h-3 w-2 rounded-full bg-slate-200/40" />
          <div className="skeleton-item h-3 w-20 rounded-full bg-slate-200/50" />
          <div className="h-3 w-2 rounded-full bg-slate-200/40" />
          <div className="skeleton-item h-3 w-16 rounded-full bg-sky-200/70" />
        </div>

        {/* Header card */}
        <div className="overflow-hidden rounded-3xl border border-white/80 bg-white/70 px-4 py-4 shadow-[0_8px_32px_rgba(15,23,42,0.07)] backdrop-blur-xl sm:px-8 sm:py-6">
          <div className="flex items-start gap-3 sm:items-center sm:gap-4">
            <div className="skeleton-item h-11 w-11 shrink-0 rounded-2xl bg-sky-100/90 sm:h-12 sm:w-12" />
            <div className="min-w-0 flex-1">
              <div className="skeleton-item h-6 w-3/4 max-w-[360px] rounded-xl bg-slate-200/80 sm:h-8" />
              <div className="skeleton-item mt-2 h-4 w-full max-w-[480px] rounded-full bg-slate-200/60" />
              <div className="skeleton-item mt-1.5 h-4 w-2/3 max-w-[320px] rounded-full bg-slate-200/50" />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="overflow-hidden rounded-2xl border border-white/80 bg-white/70 p-2 shadow-[0_4px_18px_rgba(15,23,42,0.06)] backdrop-blur-xl">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <TabSkeleton key={i} />
            ))}
          </div>
        </div>

        {/* Content cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="skeleton-item overflow-hidden rounded-2xl border-2 border-slate-200/60 bg-white p-5 shadow-[0_4px_18px_rgba(15,23,42,0.06)]"
              style={{ height: i === 0 ? 180 : 140 }}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
