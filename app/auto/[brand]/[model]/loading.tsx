import CatalogSectionNav from "app/components/CatalogSectionNav";
import DirectoryHeroBackdrop from "app/components/DirectoryHeroBackdrop";

/** The model page's own shape while its breakdown loads, instead of the brand's model grid. */
export default function LoadingModel() {
  return (
    <main className="catalog-directory-page directory-brand-loading" aria-busy="true">
      <div role="status" className="sr-only">Завантаження запчастин для моделі</div>
      <div className="catalog-hub-stage">
        <section className="directory-intro">
          <DirectoryHeroBackdrop tone="auto" />
          <CatalogSectionNav current="auto" />
          <div className="directory-brand-skeleton" aria-hidden="true">
            <span className="directory-brand-skeleton-title" />
            <span className="directory-brand-skeleton-line" />
            <span className="directory-brand-skeleton-line" />
          </div>
        </section>
      </div>
      <div className="page-shell-inline py-5" aria-hidden="true">
        <div className="grid gap-2 rounded-[22px] border border-slate-200/70 bg-white/90 p-3 sm:p-4">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="flex items-center gap-3 rounded-[16px] border border-slate-100 px-3 py-2.5">
              <span className="h-14 w-14 shrink-0 rounded-[12px] bg-sky-50 motion-safe:animate-pulse" />
              <span className="h-4 flex-1 rounded-full bg-slate-100 motion-safe:animate-pulse" />
              <span className="h-6 w-20 shrink-0 rounded-full bg-slate-100 motion-safe:animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
