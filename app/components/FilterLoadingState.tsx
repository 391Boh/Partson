// Loading state for the catalog filter tabs. No card of its own: a small
// spinner with a label, then placeholders laid out like the cards that will
// replace them (1 column on phones, 3 from 640px), so nothing jumps when the
// real content arrives.
export default function FilterLoadingState({
  label,
  variant = "cards",
  count = 6,
}: {
  label: string;
  variant?: "cards" | "chips";
  count?: number;
}) {
  return (
    <div className="catalog-filter-loading" role="status" aria-live="polite">
      <p className="catalog-filter-loading-label">
        <span className="catalog-filter-loading-spinner" aria-hidden="true" />
        {label}
      </p>
      <div className={`catalog-filter-loading-${variant}`} aria-hidden="true">
        {Array.from({ length: count }, (_, index) =>
          variant === "chips" ? (
            <span key={index} className="catalog-filter-skeleton catalog-filter-skeleton-chip" />
          ) : (
            <span key={index} className="catalog-filter-skeleton catalog-filter-skeleton-card">
              <span className="catalog-filter-skeleton-icon" />
              <span className="catalog-filter-skeleton-lines">
                <span />
                <span />
              </span>
            </span>
          )
        )}
      </div>
    </div>
  );
}
