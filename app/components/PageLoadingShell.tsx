type PageLoadingShellProps = {
  label?: string;
  cardsCount?: number;
  variant?: "grid" | "detail";
};

// Deliberately blank (no skeleton cards/shapes) — NavigationProgress (the
// top loading bar, mounted in LayoutHost) already signals "in flight", and
// the view-transition crossfade handles visual continuity between pages. A
// content-shaped skeleton here used to flash in between those two signals,
// making fast navigations feel like several separate transitions stacked
// back to back instead of one smooth one. Keeping the two variants (and the
// cardsCount prop, unused now) so call sites don't need to change.
function GridSkeleton() {
  return (
    <div
      className="min-h-[calc(100vh-4rem)]"
      style={{
        background:
          "radial-gradient(circle at 0% 0%, rgba(14,165,233,0.12), transparent 30%), linear-gradient(180deg, #edf5f9, #f8fafc)",
      }}
    />
  );
}

function DetailSkeleton() {
  return (
    <div
      className="min-h-[calc(100vh-4rem)]"
      style={{
        backgroundImage:
          "radial-gradient(circle at 0% 0%, rgba(14,165,233,0.18), transparent 24%), radial-gradient(circle at 100% 8%, rgba(20,184,166,0.1), transparent 22%), linear-gradient(180deg, #edf5f9 0%, #f8fafc 42%, #eef4f8 100%)",
      }}
    />
  );
}

export default function PageLoadingShell({
  label = "Завантаження...",
  variant = "grid",
}: PageLoadingShellProps) {
  return (
    <div role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      {variant === "detail" ? <DetailSkeleton /> : <GridSkeleton />}
    </div>
  );
}
