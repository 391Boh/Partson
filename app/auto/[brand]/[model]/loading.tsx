import DirectoryHeroBackdrop from "app/components/DirectoryHeroBackdrop";
import { catalogPageBackgroundClass, directoryPanelClass } from "app/components/catalog-directory-styles";

/**
 * The model page's own frame while it loads: the same full-width dark hero
 * (under the transparent header) and group rows, so the page does not jump
 * when the content arrives.
 */
export default function LoadingModel() {
  return (
    <main className={`${catalogPageBackgroundClass} directory-detail-page min-h-screen pb-5 sm:pb-7`} aria-busy="true">
      <div role="status" className="sr-only">Завантаження запчастин для моделі</div>
      <div className="directory-detail-shell">
        <div className="space-y-4 sm:space-y-5">
          <section className="directory-detail-hero model-hero relative overflow-hidden" aria-hidden="true">
            <DirectoryHeroBackdrop tone="auto" />
            <div className="relative grid max-w-3xl gap-4">
              <span className="h-4 w-64 max-w-full rounded-full bg-white/15" />
              <span className="mt-4 h-11 w-[min(30rem,100%)] rounded-[12px] bg-white/20 motion-safe:animate-pulse" />
              <span className="h-4 w-[min(36rem,100%)] rounded-full bg-white/12" />
              <span className="h-4 w-[min(28rem,90%)] rounded-full bg-white/12" />
              <span className="mt-6 h-12 w-[min(26rem,100%)] rounded-[12px] bg-white/10" />
            </div>
          </section>

          <section className={directoryPanelClass} aria-hidden="true">
            <div className="grid gap-2.5 p-4 sm:p-5">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="flex min-h-[68px] items-center gap-3.5 rounded-[18px] border border-slate-200/80 bg-white px-4">
                  <span className="h-11 w-11 shrink-0 rounded-[12px] bg-sky-50 motion-safe:animate-pulse" />
                  <span className="grid flex-1 gap-2">
                    <span className="h-4 w-48 max-w-full rounded-full bg-slate-100" />
                    <span className="h-3 w-28 rounded-full bg-slate-100" />
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
