export default function ProductPageLoading() {
  return (
    <div
      className="route-transition-shell min-h-screen px-4 py-5 sm:py-7"
      style={{
        backgroundImage:
          "radial-gradient(circle at 10% 10%, rgba(14,165,233,0.14), transparent 38%), radial-gradient(circle at 90% 15%, rgba(59,130,246,0.13), transparent 33%), linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)",
      }}
    >
      <div className="mx-auto w-full max-w-[1120px] animate-pulse">
        <div className="mb-3 h-9 w-44 rounded-full bg-white/85 shadow-sm" />

        <div className="overflow-hidden rounded-[26px] border border-slate-200/80 bg-white/95 shadow-[0_22px_52px_rgba(15,23,42,0.12)]">
          <div className="h-24 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900" />

          <div className="grid gap-4 p-3.5 sm:p-4 lg:grid-cols-[360px_minmax(0,1fr)]">
            <section className="space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-100 p-2.5">
                <div className="h-[260px] w-full rounded-xl bg-gradient-to-br from-slate-200 via-slate-100 to-slate-200 sm:h-[300px]" />
              </div>
              <div className="h-[112px] rounded-2xl border border-slate-200 bg-slate-100" />
            </section>

            <section className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="h-[58px] rounded-xl border border-slate-200 bg-slate-100" />
                <div className="h-[58px] rounded-xl border border-slate-200 bg-slate-100" />
                <div className="h-[58px] rounded-xl border border-slate-200 bg-slate-100" />
                <div className="h-[58px] rounded-xl border border-slate-200 bg-slate-100" />
              </div>

              <div className="h-[176px] rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-100 to-cyan-100" />
              <div className="h-[152px] rounded-2xl border border-slate-200 bg-slate-100" />
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
