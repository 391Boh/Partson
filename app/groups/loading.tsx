import { catalogPageBackgroundClass } from "app/components/catalog-directory-styles";

// Deliberately blank — see app/katalog/loading.tsx for why.
export default function Loading() {
  return (
    <div
      className={`${catalogPageBackgroundClass} min-h-screen`}
      role="status"
      aria-label="Завантаження груп каталогу..."
    >
      <span className="sr-only">Завантаження груп каталогу...</span>
    </div>
  );
}
