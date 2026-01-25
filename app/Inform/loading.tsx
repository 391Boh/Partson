export default function Loading() {
  return (
    <div className="min-h-[calc(100vh-64px)] pt-20">
      <div className="mx-auto w-full max-w-6xl px-4">
        <div className="rounded-2xl border border-slate-200 bg-white/70 p-6 shadow-sm backdrop-blur">
          <div className="flex flex-col items-center justify-center gap-2">
            <div className="loader" />
            <p className="text-xs text-slate-500">Завантаження інформації...</p>
          </div>
        </div>
      </div>
    </div>
  );
}

