// Deliberately blank — see app/katalog/loading.tsx for why.
export default function InformLoading() {
  return (
    <div
      className="min-h-[calc(100vh-4rem)]"
      style={{ background: "linear-gradient(160deg,#f0f9ff 0%,#e8f4fd 40%,#eef2ff 100%)" }}
      role="status"
      aria-label="Завантаження інформації..."
    >
      <span className="sr-only">Завантаження інформації...</span>
    </div>
  );
}
