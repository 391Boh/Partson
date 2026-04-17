type PageLoadingShellProps = {
  label?: string;
  cardsCount?: number;
  variant?: "grid" | "detail";
};

export default function PageLoadingShell({
  label = "Завантаження сторінки...",
  variant = "grid",
}: PageLoadingShellProps) {
  const topPadding = variant === "detail" ? "py-4 sm:py-5" : "py-3 sm:py-4";

  return (
    <div className="page-loading-shell min-h-[calc(100vh-4rem)] bg-slate-50/70">
      <div className={`page-shell-inline ${topPadding}`}>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80"
          role="status"
          aria-label={label}
        >
          <div className="h-full w-1/3 animate-pulse rounded-full bg-sky-500" />
        </div>
        <p className="sr-only">{label}</p>
      </div>
    </div>
  );
}
