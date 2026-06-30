export default function Loading() {
  return (
    <div
      className="home-static min-h-screen overflow-hidden text-white"
      role="status"
      aria-label="Завантаження..."
      style={{
        background:
          "radial-gradient(ellipse 148% 86% at 7% 4%,rgba(56,189,248,0.42) 0%,rgba(56,189,248,0.14) 38%,rgba(56,189,248,0.03) 58%,transparent 72%),radial-gradient(ellipse 98% 70% at 95% 4%,rgba(37,99,235,0.26) 0%,rgba(37,99,235,0.07) 40%,transparent 66%),linear-gradient(180deg,rgba(2,6,23,1) 0%,rgba(6,13,38,0.98) 10%,rgba(11,21,56,0.95) 20%,rgba(15,29,74,0.91) 30%,rgba(19,38,95,0.84) 40%,rgba(23,48,118,0.74) 50%,rgba(27,59,144,0.60) 60%,rgba(31,70,168,0.44) 70%,rgba(35,80,190,0.30) 82%,rgba(39,90,208,0.22) 100%)",
      }}
    >
      <span className="sr-only">Завантаження...</span>
      <div className="page-shell-inline py-4 sm:py-7 lg:py-8">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="home-sk-card flex min-h-[214px] flex-col justify-between gap-3 p-4 sm:min-h-[230px] lg:min-h-0">
            <div className="flex items-center gap-3">
              <div className="home-sk-block h-10 w-10 shrink-0 rounded-2xl" />
              <div className="flex-1 space-y-2">
                <div className="home-sk-block h-3.5 w-24 rounded-full" />
                <div className="home-sk-block h-3 w-16 rounded-full opacity-70" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="home-sk-block h-7 w-3/4 rounded-xl" />
              <div className="home-sk-block h-7 w-1/2 rounded-xl opacity-80" />
              <div className="home-sk-block mt-3 h-4 w-full rounded-full opacity-60" />
              <div className="home-sk-block h-4 w-4/5 rounded-full opacity-50" />
            </div>
            <div className="flex gap-2">
              <div className="home-sk-block h-9 w-32 rounded-xl" style={{ background: "rgba(56,189,248,0.18)" }} />
              <div className="home-sk-block h-9 w-28 rounded-xl" />
            </div>
          </div>

          <div className="home-sk-card flex min-h-[214px] flex-col gap-3 p-4 sm:min-h-[230px] lg:min-h-0">
            <div className="home-sk-block h-3.5 w-28 rounded-full" />
            <div className="home-sk-block h-10 w-full rounded-xl opacity-80" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="home-sk-block h-8 rounded-lg opacity-60" />
              ))}
            </div>
          </div>

          <div className="home-sk-card hidden min-h-[214px] flex-col gap-2 p-4 md:flex sm:min-h-[230px] lg:min-h-0">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl p-2.5" style={{ background: "rgba(255,255,255,0.04)" }}>
                <div className="home-sk-block h-7 w-7 shrink-0 rounded-xl" />
                <div className="flex-1 space-y-1.5">
                  <div className="home-sk-block h-3 w-3/4 rounded-full" />
                  <div className="home-sk-block h-2.5 w-full rounded-full opacity-60" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
