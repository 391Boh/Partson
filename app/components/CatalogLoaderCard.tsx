type CatalogLoaderCardProps = {
  label?: string;
  kicker?: string;
  className?: string;
};

export default function CatalogLoaderCard({
  label = "Завантажую каталог",
  kicker = "PartsON",
  className = "",
}: CatalogLoaderCardProps) {
  return (
    <div
      className={`catalog-page-loader-card inline-flex min-w-[280px] items-center gap-4 rounded-[22px] border border-sky-100/90 bg-white/96 px-5 py-4 shadow-[0_22px_60px_rgba(14,165,233,0.16)] ring-1 ring-white/90 ${className}`}
    >
      <span className="catalog-page-loader" aria-hidden="true">
        <i />
        <b />
        <em />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-black uppercase tracking-[0.15em] text-sky-700">
          {kicker}
        </span>
        <span className="mt-0.5 block text-sm font-black leading-tight text-slate-800">
          {label}
        </span>
        <span className="catalog-loader-line mt-2 block" aria-hidden="true" />
      </span>
    </div>
  );
}
