import CatalogSectionNav from "app/components/CatalogSectionNav";
import DirectoryHeroBackdrop from "app/components/DirectoryHeroBackdrop";

/** A prefetched shell lets navigation commit before the 1C model lookup. */
export default function LoadingBrand() {
  return (
    <main className="catalog-directory-page directory-brand-loading" aria-busy="true">
      <div role="status" className="sr-only">Завантаження моделей автомобіля</div>
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
      <div className="page-shell-inline py-5">
        <div className="directory-brand-loading-cards" aria-hidden="true">
          {Array.from({ length: 12 }, (_, index) => <span key={index} />)}
        </div>
      </div>
    </main>
  );
}
