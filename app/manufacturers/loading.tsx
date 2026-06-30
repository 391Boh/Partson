export default function Loading() {
  return (
    <main
      className="page-loading-shell relative text-slate-900"
      style={{
        background:
          "radial-gradient(circle at 8% 0%,rgba(13,148,136,0.14),transparent 34%),radial-gradient(circle at 92% 0%,rgba(14,165,233,0.13),transparent 36%),linear-gradient(180deg,#f8fafc 0%,#f1f5f9 50%,#eef6f3 100%)",
      }}
      role="status"
      aria-label="Завантаження виробників..."
    >
      <span className="sr-only">Завантаження виробників...</span>

      {/* Hero card */}
      <div className="page-shell-inline py-3 sm:py-4 lg:py-5">
        <section className="overflow-hidden rounded-[30px] border border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(240,249,255,0.92),rgba(240,253,250,0.88))] p-5 shadow-[0_20px_44px_rgba(14,165,233,0.1)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <div className="skeleton-item h-5 w-28 rounded-full bg-sky-100/90" />
              <div className="skeleton-item h-9 w-3/4 max-w-[380px] rounded-2xl bg-slate-200/80" />
              <div className="space-y-2">
                <div className="skeleton-item h-4 w-full max-w-[440px] rounded-full bg-slate-200/60" />
                <div className="skeleton-item h-4 w-4/5 max-w-[360px] rounded-full bg-slate-200/50" />
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 lg:items-end">
              <div className="skeleton-item h-8 w-32 rounded-xl bg-sky-100/70" />
              <div className="skeleton-item h-8 w-28 rounded-xl bg-slate-200/60" />
            </div>
          </div>
        </section>
      </div>

      {/* Directory card */}
      <div className="page-shell-inline pb-4 sm:pb-6">
        <div className="overflow-hidden rounded-[28px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.94)_0%,rgba(240,249,255,0.9)_100%)] shadow-[0_22px_48px_rgba(14,165,233,0.08)] backdrop-blur-xl">
          {/* Search bar */}
          <div className="border-b border-slate-200/60 px-4 py-3 sm:px-5">
            <div className="skeleton-item h-10 w-full rounded-xl bg-slate-200/60" />
          </div>

          {/* Brand cards grid */}
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-[16px] border border-slate-200/80 bg-[linear-gradient(160deg,#ffffff,#f8fbff_55%,#eefcf8_100%)] p-4 shadow-[0_12px_28px_rgba(15,23,42,0.055)]"
              >
                <div className="flex items-center gap-3">
                  <div className="skeleton-item h-11 w-11 shrink-0 rounded-[14px] bg-slate-200/70" />
                  <div className="min-w-0 flex-1">
                    <div className="skeleton-item h-5 w-1/2 rounded-full bg-slate-200/80" />
                    <div className="skeleton-item mt-1.5 h-3.5 w-3/4 rounded-full bg-slate-200/60" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
