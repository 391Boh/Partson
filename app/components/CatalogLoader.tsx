import React from "react";

type CatalogLoaderProps = {
  message?: string;
  hint?: string;
  cards?: number;
};

const CatalogLoader: React.FC<CatalogLoaderProps> = ({
  message = "Завантажуємо товари...",
  hint = "Підбираємо актуальні позиції та ціни",
  cards = 10,
}) => {
  const placeholders = Array.from({ length: cards });

  return (
    <div className="w-full px-6 pb-8 pt-4 sm:px-4 lg:px-6" aria-busy="true">
      <div className="flex flex-col items-center justify-center gap-2 pb-3 text-center">
        <div className="loader" aria-label="Завантаження" />
        <div className="space-y-0.5">
          <p className="text-slate-700 text-sm font-semibold">{message}</p>
          {hint ? (
            <p className="text-slate-400 text-xs font-medium">{hint}</p>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white/80 shadow-sm backdrop-blur-sm">
        <div className="grid w-full grid-cols-1 gap-4 px-2 pb-4 pt-2 sm:grid-cols-2 sm:gap-5 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {placeholders.map((_, idx) => (
            <div
              key={idx}
              className="skeleton-card h-[320px] w-full rounded-xl border border-slate-200/60"
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default CatalogLoader;
