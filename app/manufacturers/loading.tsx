const loadingCards = Array.from({ length: 6 }, (_, index) => index);

export default function Loading() {
  return (
    <main className="relative bg-[image:radial-gradient(circle_at_8%_0%,rgba(56,189,248,0.22),transparent_38%),radial-gradient(circle_at_92%_2%,rgba(34,211,238,0.2),transparent_36%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] text-slate-900">
      <div className="page-shell-inline py-3 sm:py-4 lg:py-5">
        <section className="overflow-hidden rounded-[30px] border border-white/80 bg-[radial-gradient(circle_at_top_left,rgba(186,230,253,0.18),transparent_34%),linear-gradient(160deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96),rgba(239,246,255,0.94))] p-5 shadow-[0_20px_44px_rgba(14,165,233,0.1)]">
          <div className="h-6 w-36 rounded-full bg-sky-100/90 animate-pulse" />
          <div className="mt-4 h-10 w-full max-w-[28rem] rounded-[20px] bg-slate-200/80 animate-pulse" />
          <div className="mt-3 space-y-2">
            <div className="h-4 w-full max-w-[32rem] rounded-full bg-slate-200/70 animate-pulse" />
            <div className="h-4 w-full max-w-[24rem] rounded-full bg-slate-200/70 animate-pulse" />
          </div>
        </section>
      </div>

      <section className="page-shell-inline pb-2 sm:pb-3">
        <div className="overflow-hidden rounded-[28px] border border-white/80 bg-[image:linear-gradient(180deg,rgba(255,255,255,0.94)_0%,rgba(240,249,255,0.9)_100%)] shadow-[0_22px_48px_rgba(14,165,233,0.1)] backdrop-blur-xl">
          <div className="border-b border-white/80 px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl space-y-3">
                <div className="h-6 w-32 rounded-full bg-cyan-100/90 animate-pulse" />
                <div className="h-8 w-full max-w-[20rem] rounded-full bg-slate-200/80 animate-pulse" />
                <div className="space-y-2">
                  <div className="h-4 w-full max-w-[30rem] rounded-full bg-slate-200/70 animate-pulse" />
                  <div className="h-4 w-full max-w-[22rem] rounded-full bg-slate-200/70 animate-pulse" />
                </div>
              </div>

              <div className="w-full max-w-md space-y-3">
                <div className="h-12 w-full rounded-2xl bg-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_12px_24px_rgba(14,165,233,0.08)] animate-pulse" />
                <div className="h-4 w-28 rounded-full bg-slate-200/70 animate-pulse" />
              </div>
            </div>
          </div>

          <div className="grid gap-4 px-4 py-4 md:grid-cols-2 sm:px-5 xl:gap-5">
            {loadingCards.map((cardIndex) => (
              <div
                key={cardIndex}
                className="relative isolate overflow-hidden rounded-[30px] border border-slate-200/70 bg-[linear-gradient(160deg,rgba(255,255,255,0.92),rgba(241,245,249,0.92),rgba(236,254,255,0.78))] p-5 shadow-[0_16px_34px_rgba(15,23,42,0.06)] ring-1 ring-white/70"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-4">
                    <div className="h-[78px] w-[78px] shrink-0 rounded-[24px] border border-slate-200/80 bg-slate-200/80 animate-pulse" />
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="h-6 w-20 rounded-full bg-slate-200/80 animate-pulse" />
                      <div className="h-6 w-36 max-w-full rounded-full bg-slate-200/80 animate-pulse" />
                      <div className="space-y-2">
                        <div className="h-4 w-full rounded-full bg-slate-200/70 animate-pulse" />
                        <div className="h-4 w-10/12 rounded-full bg-slate-200/70 animate-pulse" />
                        <div className="h-4 w-7/12 rounded-full bg-slate-200/70 animate-pulse" />
                      </div>
                    </div>
                  </div>

                  <div className="h-11 w-11 shrink-0 rounded-full border border-slate-200/80 bg-slate-200/80 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
