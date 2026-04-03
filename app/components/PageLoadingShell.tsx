type PageLoadingShellProps = {
  label?: string;
  cardsCount?: number;
  variant?: "grid" | "detail";
};

export default function PageLoadingShell({
  label = "Завантаження сторінки...",
  cardsCount = 6,
  variant = "grid",
}: PageLoadingShellProps) {
  if (variant === "detail") {
    return (
      <div className="page-loading-shell min-h-[calc(100vh-4rem)] bg-slate-50/95">
        <div className="page-shell-inline py-5 sm:py-6">
          <div className="mb-4 h-4 w-40 animate-pulse rounded-full bg-slate-200/90" />

          <div className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
            <div className="h-1.5 w-full bg-slate-100">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-sky-500/80" />
            </div>

            <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
              <section className="space-y-3">
                <div className="rounded-[20px] border border-slate-200/80 bg-slate-50 p-3">
                  <div className="h-[260px] animate-pulse rounded-[16px] bg-slate-200/85 sm:h-[300px]" />
                </div>
                <div className="h-[86px] animate-pulse rounded-[18px] border border-slate-200/80 bg-slate-100/80" />
              </section>

              <section className="space-y-3">
                <div className="h-10 w-3/4 animate-pulse rounded-[14px] bg-slate-200/85" />
                <div className="grid gap-2 sm:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div
                      key={`product-meta-${index}`}
                      className="h-[56px] animate-pulse rounded-[14px] border border-slate-200/80 bg-slate-100/80"
                    />
                  ))}
                </div>
                <div className="h-[132px] animate-pulse rounded-[18px] border border-slate-200/80 bg-slate-100/80" />
                <div className="h-[128px] animate-pulse rounded-[18px] border border-slate-200/80 bg-slate-100/80" />
              </section>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-loading-shell min-h-[calc(100vh-4rem)] bg-slate-50/95">
      <div className="page-shell-inline py-5 sm:py-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <section className="rounded-[22px] border border-slate-200/80 bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.06)] sm:p-5">
            <div className="flex items-center gap-4">
              <div
                className="h-9 w-9 shrink-0 animate-pulse rounded-full border border-sky-100 bg-sky-50"
                aria-label={label}
              />
              <div className="min-w-0">
                <div className="h-3 w-24 animate-pulse rounded-full bg-sky-100/90" />
                <p className="mt-2 text-xs font-semibold tracking-[0.08em] text-slate-500">
                  {label}
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <div className="h-36 animate-pulse rounded-[18px] border border-slate-200/80 bg-slate-100/85" />
              <div className="grid gap-2 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={`summary-${index}`}
                    className="h-[58px] animate-pulse rounded-[16px] border border-slate-200/80 bg-slate-100/80"
                  />
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="rounded-[22px] border border-slate-200/80 bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.06)] sm:p-5">
              <div className="h-4 w-36 animate-pulse rounded-full bg-slate-200/80" />
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={`toolbar-${index}`}
                    className="h-11 animate-pulse rounded-[16px] border border-slate-200/80 bg-slate-100/80"
                  />
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: cardsCount }).map((_, index) => (
                <div
                  key={`card-${index}`}
                  className="rounded-[20px] border border-slate-200/80 bg-white p-4 shadow-[0_14px_28px_rgba(15,23,42,0.05)]"
                >
                  <div className="h-28 animate-pulse rounded-[16px] bg-slate-100/90" />
                  <div className="mt-3 h-3 w-2/3 animate-pulse rounded-full bg-slate-200/80" />
                  <div className="mt-2 h-3 w-1/2 animate-pulse rounded-full bg-slate-100/90" />
                  <div className="mt-4 h-10 animate-pulse rounded-[14px] border border-slate-200/75 bg-slate-100/80" />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
