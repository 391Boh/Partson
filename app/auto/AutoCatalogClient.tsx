"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { getAuth } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { ArrowRight, CarFront } from "lucide-react";

import type { PersistedCarSelection } from "app/components/Auto";
import { db } from "../../firebase";

const Auto = dynamic(() => import("app/components/Auto"), {
  loading: () => (
    <div className="flex min-h-[520px] items-center justify-center rounded-[16px] border border-white/80 bg-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
      <div className="inline-flex items-center gap-3 rounded-[16px] border border-slate-200/80 bg-white/90 px-4 py-3 text-sm font-medium text-slate-600 shadow-[0_16px_30px_rgba(14,165,233,0.08)]">
        <span className="loader shrink-0" aria-hidden="true" />
        <span>Завантаження селектора авто...</span>
      </div>
    </div>
  ),
});

const STORAGE_KEYS = {
  cars: "partson:selectedCars",
  selection: "partson:selectedCarSelection",
  vin: "partson:selectedVin",
} as const;

const SESSION_KEYS = {
  skipRemoteLoad: "partson:catalogSkipRemoteLoad",
  scrollTarget: "catalogScrollTarget",
} as const;

const normalizeCarLabel = (value: string) => value.trim();

export default function AutoCatalogClient() {
  const router = useRouter();
  const redirectingRef = useRef(false);
  const [selectedCars, setSelectedCars] = useState<string[]>([]);

  const handleCarChange = useCallback((car: string) => {
    const normalized = normalizeCarLabel(car);
    if (!normalized) return;

    setSelectedCars((prev) =>
      prev.includes(normalized)
        ? prev.filter((item) => item !== normalized)
        : [...prev, normalized]
    );
  }, []);

  const persistSelection = useCallback(
    (selection: PersistedCarSelection) => {
      const mergedCars = Array.from(
        new Set(
          [...selectedCars, selection.label]
            .map(normalizeCarLabel)
            .filter(Boolean)
        )
      );

      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEYS.cars, JSON.stringify(mergedCars));
        window.localStorage.setItem(
          STORAGE_KEYS.selection,
          JSON.stringify(selection)
        );
        window.localStorage.removeItem(STORAGE_KEYS.vin);
        window.sessionStorage.setItem(SESSION_KEYS.skipRemoteLoad, "1");
        window.sessionStorage.setItem(SESSION_KEYS.scrollTarget, "results");
      }

      const currentUser = getAuth().currentUser;
      if (currentUser) {
        const docRef = doc(db, "users", currentUser.uid);
        void setDoc(
          docRef,
          {
            selectedCars: mergedCars,
            selectedCarSelection: selection,
            selectedVin: null,
            avto: {
              cars: mergedCars,
              selection,
              vin: null,
            },
          },
          { merge: true }
        ).catch((error) => {
          console.error("Failed to save selected auto from /auto:", error);
        });
      }

      if (redirectingRef.current) return;
      redirectingRef.current = true;
      router.push("/katalog?tab=auto");
    },
    [router, selectedCars]
  );

  const handleSelectionChange = useCallback(
    (selection: PersistedCarSelection | null) => {
      if (!selection) return;

      setSelectedCars((prev) =>
        prev.includes(selection.label) ? prev : [...prev, selection.label]
      );
      persistSelection(selection);
    },
    [persistSelection]
  );

  return (
    <section className="catalog-hub-panel mt-0 flex flex-1">
      <div className="relative flex min-h-full flex-1 flex-col overflow-hidden rounded-[24px] border border-white/80 bg-[image:linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(240,249,255,0.92)_100%)] p-3.5 shadow-[0_20px_44px_rgba(8,145,178,0.14)] backdrop-blur-xl select-none [&_input]:select-text [&_textarea]:select-text sm:p-4">
        <div className="pointer-events-none absolute inset-0 opacity-90 bg-[image:radial-gradient(circle_at_10%_10%,rgba(34,211,238,0.12),transparent_35%),radial-gradient(circle_at_88%_12%,rgba(14,165,233,0.1),transparent_34%),linear-gradient(140deg,rgba(255,255,255,0.18),transparent_60%)]" />

        <div className="soft-panel-header">
          <div className="flex min-w-0 items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-cyan-200/80 bg-[image:linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(224,242,254,0.88)_100%)] text-cyan-800 shadow-[0_14px_28px_rgba(8,145,178,0.14)]">
              <CarFront size={18} strokeWidth={2.1} />
            </span>
            <div className="min-w-0">
              <span className="soft-panel-eyebrow">Авто</span>
              <h2 className="soft-panel-title mt-2">
                Селектор авто для переходу в каталог
              </h2>
              <p className="soft-panel-subtitle">
                Виберіть марку, модель і модифікацію без зайвих кроків, а потім відкрийте каталог уже з прив&apos;язаним авто.
              </p>
            </div>
          </div>

          <span className="soft-chip inline-flex items-center gap-2 px-3 py-1 text-[11px] font-medium shadow-[0_10px_18px_rgba(15,23,42,0.05)]">
            <ArrowRight size={13} className="text-cyan-700" />
            Перехід у каталог
          </span>
        </div>

        <div className="relative mt-3 min-h-0 flex-1 overflow-hidden rounded-[18px] border border-white/80 bg-[image:linear-gradient(145deg,rgba(255,255,255,0.9),rgba(239,246,255,0.74),rgba(224,242,254,0.68))] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_14px_28px_rgba(14,165,233,0.06)] sm:p-2">
          <Auto
            selectedCars={selectedCars}
            handleCarChange={handleCarChange}
            initialSelection={null}
            onSelectionChange={handleSelectionChange}
            playEntranceAnimations={false}
            showSummary={false}
            showAllBrands
          />
        </div>
      </div>
    </section>
  );
}
