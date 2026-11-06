import CatalogSectionNav from "app/components/CatalogSectionNav";
import DirectoryHeroBackdrop from "app/components/DirectoryHeroBackdrop";
import { catalogPageBackgroundClass } from "app/components/catalog-directory-styles";
import type { DirectorySection } from "app/lib/directory-appearance";

/**
 * The detail pages' own frame while they load. Without it a category,
 * subgroup or producer page fell back to its hub's loading shell, whose
 * title and layout were then replaced by a different hero.
 */
export default function DirectoryDetailLoading({ current, status }: { current: DirectorySection; status: string }) {
  return (
    <main className={`${catalogPageBackgroundClass} directory-detail-page directory-detail-shell directory-detail-loading`} aria-busy="true">
      <div role="status" className="sr-only">{status}</div>
      <div>
        <section className="directory-detail-hero relative overflow-hidden">
          <DirectoryHeroBackdrop tone={current} />
          <CatalogSectionNav current={current} warmup={false} />
          <div className="relative z-[1] mb-4 flex" aria-hidden="true">
            <span className="directory-skeleton-bar w-56" />
          </div>
          <div className="relative grid max-w-4xl" aria-hidden="true">
            <div className="directory-detail-identity grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
              <div className="directory-skeleton-tile" />
              <div className="directory-skeleton-copy">
                <span className="directory-skeleton-title" />
                <span className="directory-skeleton-bar w-[min(40rem,100%)]" />
                <span className="directory-skeleton-bar w-[min(32rem,90%)]" />
                <span className="directory-skeleton-action" />
              </div>
            </div>
          </div>
        </section>
      </div>
      <section className="directory-panel directory-skeleton-panel" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => <span key={index} />)}
      </section>
    </main>
  );
}
