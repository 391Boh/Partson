import { catalogPageBackgroundClass } from "app/components/catalog-directory-styles";

// Deliberately blank — see app/katalog/loading.tsx for why.
export default function Loading() {
  return (
    <main
      className={`${catalogPageBackgroundClass} min-h-screen`}
      role="status"
      aria-label="Завантаження виробників..."
    >
      <span className="sr-only">Завантаження виробників...</span>
    </main>
  );
}
