export default function PartnershipLoading() {
  return (
    <div className="font-ui min-h-screen bg-[linear-gradient(180deg,#f0f9ff,#f8fafc_40%,#ffffff)]">
      {/* hero skeleton */}
      <div className="relative overflow-hidden bg-[linear-gradient(135deg,#0f172a,#0c4a6e_54%,#075985)]">
        <div className="page-shell-inline grid gap-6 py-8 sm:py-12 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            <div className="skeleton-item h-4 w-28 rounded-full bg-white/12" />
            <div className="space-y-2">
              <div className="skeleton-item h-8 w-3/4 rounded-lg bg-white/14" />
              <div className="skeleton-item h-8 w-1/2 rounded-lg bg-white/10" />
            </div>
            <div className="space-y-1.5">
              <div className="skeleton-item h-4 w-full rounded-full bg-white/8" />
              <div className="skeleton-item h-4 w-4/5 rounded-full bg-white/6" />
            </div>
          </div>
          <div className="skeleton-item hidden h-48 rounded-[14px] bg-white/8 lg:block" />
        </div>
      </div>

      {/* content skeleton */}
      <div className="page-shell-inline grid gap-6 py-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {[1, 0.9, 0.95, 0.8].map((w, i) => (
            <div key={i} className="rounded-[10px] border border-slate-200/60 bg-white p-5 shadow-sm space-y-3">
              <div className="skeleton-item h-5 rounded-lg bg-slate-200/80" style={{ width: `${w * 60}%` }} />
              <div className="skeleton-item h-3.5 w-full rounded-full bg-slate-200/60" />
              <div className="skeleton-item h-3.5 rounded-full bg-slate-200/50" style={{ width: `${w * 80}%` }} />
            </div>
          ))}
        </div>
        <div className="space-y-4">
          <div className="skeleton-item h-48 rounded-[10px] bg-white border border-slate-200/60 shadow-sm" />
          <div className="skeleton-item h-32 rounded-[10px] bg-white border border-slate-200/60 shadow-sm" />
        </div>
      </div>
    </div>
  );
}
