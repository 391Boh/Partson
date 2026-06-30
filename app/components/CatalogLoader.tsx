type CatalogLoaderProps = {
  message?: string;
  cards?: number;
};

export default function CatalogLoader({ cards = 10 }: CatalogLoaderProps) {
  const placeholders = Array.from({ length: cards });

  return (
    <div className="w-full px-2 pb-6 pt-2 sm:px-3" aria-busy="true">
      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-4">
        {placeholders.map((_, idx) => (
          <div
            key={idx}
            className="flex h-[130px] items-center gap-3 rounded-[18px] border border-slate-200/70 bg-white/90 p-3 shadow-[0_2px_8px_rgba(15,23,42,0.05)]"
          >
            <div className="skeleton-item h-[72px] w-[72px] shrink-0 rounded-[14px] bg-slate-200/80" />
            <div className="min-w-0 flex-1">
              <div className="skeleton-item h-4 w-4/5 rounded-full bg-slate-200/70" />
              <div className="skeleton-item mt-1 h-3 w-3/5 rounded-full bg-slate-200/60" />
              <div className="mt-2 flex gap-1.5">
                <div className="skeleton-item h-5 w-20 rounded-full bg-emerald-100/70" />
              </div>
              <div className="mt-1.5 flex gap-2">
                <div className="skeleton-item h-7 w-24 rounded-xl bg-sky-100/80" />
                <div className="skeleton-item h-7 w-7 rounded-xl bg-slate-200/60" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
