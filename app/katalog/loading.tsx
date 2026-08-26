import { catalogPageBackgroundClass } from "app/components/catalog-directory-styles";
import CatalogLoaderCard from "app/components/CatalogLoaderCard";

export default function Loading() {
  return (
    <div
      className={`${catalogPageBackgroundClass} min-h-screen`}
      role="status"
      aria-label="Завантаження каталогу..."
    >
      <div className="page-shell flex min-h-[55vh] items-start justify-center px-4 py-14 sm:py-20">
        <CatalogLoaderCard />
      </div>
      <span className="sr-only">Завантаження каталогу...</span>
    </div>
  );
}
