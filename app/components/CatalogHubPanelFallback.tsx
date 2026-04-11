type CatalogHubPanelFallbackProps = {
  label: string;
};

export default function CatalogHubPanelFallback({
  label,
}: CatalogHubPanelFallbackProps) {
  return (
    <section className="catalog-hub-panel mt-3 flex flex-1" aria-label={label}>
      <div className="relative flex min-h-[520px] flex-1 flex-col overflow-hidden rounded-[24px] border border-white/80 bg-[image:linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(240,249,255,0.92)_100%)] p-3.5 shadow-[0_20px_44px_rgba(8,145,178,0.14)] backdrop-blur-xl sm:p-4">
        <div className="pointer-events-none absolute inset-0 opacity-90 bg-[image:radial-gradient(circle_at_10%_10%,rgba(34,211,238,0.12),transparent_35%),radial-gradient(circle_at_88%_12%,rgba(14,165,233,0.1),transparent_34%),linear-gradient(140deg,rgba(255,255,255,0.18),transparent_60%)]" />

        <div className="relative flex flex-1 items-center justify-center">
          <div className="inline-flex items-center gap-3 rounded-[18px] border border-white/80 bg-white/78 px-4 py-3 text-sm font-medium text-slate-600 shadow-[0_18px_36px_rgba(8,145,178,0.1)] backdrop-blur-xl">
            <span className="loader shrink-0" aria-hidden="true" />
            <span>{label}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
