type PageLoadingShellProps = {
  label?: string;
  cardsCount?: number;
};

export default function PageLoadingShell({
  label = "Завантаження сторінки...",
  cardsCount = 6,
}: PageLoadingShellProps) {
  return (
    <div className="route-transition-shell relative min-h-[calc(100vh-4rem)] overflow-hidden bg-[radial-gradient(circle_at_12%_10%,rgba(56,189,248,0.18),transparent_34%),radial-gradient(circle_at_88%_12%,rgba(125,211,252,0.18),transparent_32%),linear-gradient(180deg,rgba(240,249,255,0.96)_0%,rgba(226,232,240,0.92)_48%,rgba(224,242,254,0.94)_100%)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.42),transparent_26%),radial-gradient(circle_at_78%_12%,rgba(191,219,254,0.28),transparent_24%)]" />

      <div className="relative mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-5 lg:px-7">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <section className="rounded-[22px] border border-white/70 bg-white/84 p-4 shadow-[0_18px_42px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-5">
            <div className="flex items-center gap-4">
              <div className="loader shrink-0" aria-label={label} />
              <div className="min-w-0">
                <div className="h-3 w-24 animate-pulse rounded-full bg-sky-100/90" />
                <p className="mt-2 text-xs font-semibold tracking-[0.08em] text-slate-500">
                  {label}
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <div className="h-36 animate-pulse rounded-[18px] border border-slate-200/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(226,232,240,0.92),rgba(224,242,254,0.86))]" />
              <div className="grid gap-2 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={`summary-${index}`}
                    className="h-[58px] animate-pulse rounded-[16px] border border-slate-200/80 bg-white/78"
                  />
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="rounded-[22px] border border-white/70 bg-white/84 p-4 shadow-[0_18px_42px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-5">
              <div className="h-4 w-36 animate-pulse rounded-full bg-slate-200/80" />
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={`toolbar-${index}`}
                    className="h-11 animate-pulse rounded-[16px] border border-slate-200/80 bg-white/78"
                  />
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: cardsCount }).map((_, index) => (
                <div
                  key={`card-${index}`}
                  className="rounded-[20px] border border-white/70 bg-white/84 p-4 shadow-[0_16px_34px_rgba(15,23,42,0.06)] backdrop-blur-xl"
                >
                  <div className="h-28 animate-pulse rounded-[16px] bg-[linear-gradient(145deg,rgba(226,232,240,0.9),rgba(255,255,255,0.92),rgba(224,242,254,0.8))]" />
                  <div className="mt-3 h-3 w-2/3 animate-pulse rounded-full bg-slate-200/80" />
                  <div className="mt-2 h-3 w-1/2 animate-pulse rounded-full bg-slate-100/90" />
                  <div className="mt-4 h-10 animate-pulse rounded-[14px] border border-slate-200/75 bg-white/80" />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
