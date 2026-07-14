// Deliberately blank — see app/katalog/loading.tsx for why.
export default function PartnershipLoading() {
  return (
    <div
      className="min-h-screen bg-[linear-gradient(180deg,#f0f9ff,#f8fafc_40%,#ffffff)]"
      role="status"
      aria-label="Завантаження партнерської програми..."
    >
      <span className="sr-only">Завантаження партнерської програми...</span>
    </div>
  );
}
