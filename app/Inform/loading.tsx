export default function Loading() {
  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden bg-sky-50">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(56,189,248,0.24),transparent_42%),radial-gradient(circle_at_88%_10%,rgba(125,211,252,0.22),transparent_38%),linear-gradient(180deg,rgba(240,249,255,0.96)_0%,rgba(226,232,240,0.9)_45%,rgba(224,242,254,0.92)_100%)]" />
      <div className="relative mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-5 lg:px-7">
        <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-8 shadow-[0_18px_46px_rgba(2,6,23,0.34)] backdrop-blur-xl">
          <div className="flex flex-col items-center justify-center gap-2">
            <div className="loader" />
            <p className="text-xs text-slate-300/80">Завантаження інформації...</p>
          </div>
        </div>
      </div>
    </div>
  );
}
