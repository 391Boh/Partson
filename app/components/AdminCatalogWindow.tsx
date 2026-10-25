import { FolderTree, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";

// The catalog editor (groups, producers) in its own window, opened from its
// own floating button (LayoutHost.tsx). Same shell as the admin panel.

const AdminCatalogPanel = dynamic(() => import("./AdminCatalogPanel"), {
  ssr: false,
  loading: () => (
    <div className="space-y-1.5 pt-2" aria-busy="true" aria-label="Завантаження каталогу">
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="h-12 animate-pulse rounded-[14px] border border-[#1d2a40] bg-[#111c30]" />
      ))}
    </div>
  ),
});

export default function AdminCatalogWindow({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      // The products table opens over this window and closes first.
      if (event.key !== "Escape" || document.querySelector("[data-admin-dialog]")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <section
      data-admin-overlay
      aria-labelledby="admin-catalog-window-title"
      className="admin-panel-shell admin-density-compact app-overlay-panel fixed inset-x-2 bottom-2 top-[4.25rem] z-50 flex max-h-[calc(100dvh-4.75rem)] min-h-0 flex-col overflow-hidden rounded-[22px] border border-[#24324a] bg-[#0b1424] shadow-[0_28px_80px_rgba(2,6,23,0.62)] sm:inset-x-3 sm:bottom-3 sm:top-[4.75rem] sm:max-h-[calc(100dvh-5.5rem)] md:bottom-auto md:top-[4.5rem] md:h-[min(860px,calc(100dvh-4rem))] md:max-h-none md:rounded-[28px]"
    >
      <header className="flex items-center gap-2.5 border-b border-[#23324b] bg-[#0e192c] px-3 py-2.5 sm:px-4">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-emerald-200/25 bg-[linear-gradient(145deg,#065f46,#0d9488)] text-white">
          <FolderTree className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-200/90">Каталог 1С</p>
          <h2 id="admin-catalog-window-title" className="font-display text-[16px] font-black leading-tight text-white">
            Групи та виробники
          </h2>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Закрити каталог"
          title="Закрити"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] border border-[#2c3d5a] bg-[#13213a] text-slate-100 transition hover:bg-[#1a2b47] hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="admin-panel-scroll app-panel-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-slate-100 [touch-action:pan-y] sm:px-4">
        <AdminCatalogPanel />
      </div>
    </section>
  );
}
