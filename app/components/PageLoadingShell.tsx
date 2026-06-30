type PageLoadingShellProps = {
  label?: string;
  cardsCount?: number;
  variant?: "grid" | "detail";
};

function SkeletonCard() {
  return (
    <div className="flex h-[140px] items-center gap-3 rounded-[20px] border border-slate-200/80 bg-white/90 p-3 shadow-[0_4px_12px_rgba(15,23,42,0.05)] sm:h-[148px]">
      <div className="skeleton-item h-[72px] w-[72px] shrink-0 rounded-[14px] bg-slate-200/80 sm:h-[80px] sm:w-[80px]" />
      <div className="min-w-0 flex-1">
        <div className="skeleton-item h-4 w-full max-w-[160px] rounded-full bg-slate-200/70" />
        <div className="skeleton-item mt-1.5 h-3 w-3/4 rounded-full bg-slate-200/60" />
        <div className="skeleton-item mt-1 h-3 w-1/2 rounded-full bg-slate-200/50" />
        <div className="mt-2.5 flex gap-2">
          <div className="skeleton-item h-6 w-16 rounded-full bg-emerald-100/80" />
          <div className="skeleton-item h-6 w-20 rounded-full bg-sky-100/80" />
        </div>
      </div>
    </div>
  );
}

function GridSkeleton({ cardsCount }: { cardsCount: number }) {
  const cards = Array.from({ length: cardsCount });
  return (
    <div
      className="page-loading-shell min-h-[calc(100vh-4rem)]"
      style={{
        background:
          "radial-gradient(circle at 0% 0%, rgba(14,165,233,0.12), transparent 30%), linear-gradient(180deg, #edf5f9, #f8fafc)",
      }}
    >
      <div className="page-shell-inline py-2.5 sm:py-4">
        <div className="overflow-hidden rounded-[26px] border border-slate-200/90 bg-white/95 p-3 shadow-[0_12px_30px_rgba(15,23,42,0.08)] sm:p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="skeleton-item h-8 w-44 rounded-[14px] bg-slate-200/70" />
            <div className="skeleton-item h-8 w-28 rounded-[14px] bg-slate-200/50" />
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
            {cards.map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div
      className="page-loading-shell min-h-[calc(100vh-4rem)]"
      style={{
        backgroundImage:
          "radial-gradient(circle at 0% 0%, rgba(14,165,233,0.18), transparent 24%), radial-gradient(circle at 100% 8%, rgba(20,184,166,0.1), transparent 22%), linear-gradient(180deg, #edf5f9 0%, #f8fafc 42%, #eef4f8 100%)",
      }}
    >
      <div className="page-shell-inline py-2.5 sm:py-4">
        <article className="overflow-hidden rounded-[24px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.97))] shadow-[0_22px_58px_rgba(15,23,42,0.1)]">
          <div className="m-2 rounded-[20px] border border-slate-200/90 bg-white/90 p-3 sm:m-3 sm:p-4">
            <div className="skeleton-item mb-3 h-4 w-72 max-w-full rounded-full bg-slate-200/60" />
            <div className="grid gap-3 xl:grid-cols-[200px_1fr_280px]">
              <div className="skeleton-item h-[200px] rounded-[18px] bg-slate-200/70 xl:h-full xl:min-h-[220px]" />
              <div className="min-w-0">
                <div className="skeleton-item h-5 w-24 rounded-full bg-emerald-100/90" />
                <div className="skeleton-item mt-2 h-8 w-full max-w-[380px] rounded-xl bg-slate-200/80" />
                <div className="skeleton-item mt-1.5 h-8 w-2/3 rounded-xl bg-slate-200/70" />
                <div className="skeleton-item mt-3 h-14 w-48 rounded-[14px] bg-sky-50/90" />
                <div className="mt-3 flex gap-2">
                  <div className="skeleton-item h-6 w-28 rounded-full bg-slate-200/60" />
                  <div className="skeleton-item h-6 w-20 rounded-full bg-slate-200/50" />
                </div>
              </div>
              <div className="skeleton-item min-h-[200px] rounded-[20px] bg-slate-100/80" />
            </div>
          </div>
          <div className="space-y-3 p-3">
            <div className="skeleton-item h-[120px] rounded-[18px] bg-slate-100/70" />
          </div>
        </article>
      </div>
    </div>
  );
}

export default function PageLoadingShell({
  label = "Завантаження...",
  cardsCount = 8,
  variant = "grid",
}: PageLoadingShellProps) {
  return (
    <div role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      {variant === "detail" ? (
        <DetailSkeleton />
      ) : (
        <GridSkeleton cardsCount={cardsCount} />
      )}
    </div>
  );
}
