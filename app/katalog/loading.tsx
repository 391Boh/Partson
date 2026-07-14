import { catalogPageBackgroundClass } from "app/components/catalog-directory-styles";

// Deliberately blank (no skeleton cards) — NavigationProgress (the top
// loading bar) already signals "in flight", and the view-transition
// crossfade handles visual continuity. A content-shaped skeleton here used
// to flash in between those two, making fast navigations feel like three
// separate transitions instead of one smooth one.
export default function Loading() {
  return (
    <div
      className={`${catalogPageBackgroundClass} min-h-screen`}
      role="status"
      aria-label="Завантаження каталогу..."
    >
      <span className="sr-only">Завантаження каталогу...</span>
    </div>
  );
}
