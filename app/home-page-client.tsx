"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { MotionConfig } from "framer-motion";
import { getAuth, onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import Hero from "./components/hero";
import SectionBoundary from "./components/SectionBoundary";
import DeferredSection from "./components/DeferredSection";
import type { PersistedCarSelection } from "./components/Auto";
import { db } from "../firebase";

const ProductFetcher = dynamic(() => import("./components/tovar"), {
  ssr: false,
  loading: () => <HomeSectionFallback minHeight="520px" />,
});
const Auto = dynamic(() => import("./components/Auto"), {
  ssr: false,
  loading: () => <HomeSectionFallback minHeight="560px" />,
});
const BrandCarousel = dynamic(() => import("./components/Brands"), {
  ssr: false,
  loading: () => <HomeSectionFallback minHeight="380px" />,
});
const AdvantagesSection = dynamic(() => import("./components/AdvantagesSection"), {
  ssr: false,
  loading: () => <HomeSectionFallback minHeight="340px" />,
});
const Footer = dynamic(() => import("./components/footer"), {
  ssr: false,
  loading: () => <HomeSectionFallback minHeight="220px" />,
});
const AuthModal = dynamic(() => import("./components/AuthModal"), {
  ssr: false,
});

const STORAGE_KEYS = {
  cars: "partson:selectedCars",
  selection: "partson:selectedCarSelection",
  vin: "partson:selectedVin",
};

type StoredCarState = {
  cars: string[];
  selection: PersistedCarSelection | null;
  vin: string | null;
};

const normalizeCars = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "")
    : [];

const parseSelection = (value: unknown): PersistedCarSelection | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const brand = typeof record.brand === "string" && record.brand.trim() ? record.brand : "";
  const model = typeof record.model === "string" && record.model.trim() ? record.model : "";
  const label = typeof record.label === "string" && record.label.trim() ? record.label : "";
  const year = typeof record.year === "number" && Number.isFinite(record.year) ? record.year : null;
  const volume =
    typeof record.volume === "string" && record.volume.trim() ? record.volume : null;
  const power = typeof record.power === "string" && record.power.trim() ? record.power : null;
  const gearbox =
    typeof record.gearbox === "string" && record.gearbox.trim() ? record.gearbox : null;
  const drive = typeof record.drive === "string" && record.drive.trim() ? record.drive : null;

  if (!brand || !model || !label) return null;
  return { brand, model, year, volume, power, gearbox, drive, label };
};

const parseVin = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const arraysEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const selectionEqual = (
  a: PersistedCarSelection | null,
  b: PersistedCarSelection | null
) =>
  a?.brand === b?.brand &&
  a?.model === b?.model &&
  a?.year === b?.year &&
  a?.volume === b?.volume &&
  a?.power === b?.power &&
  a?.gearbox === b?.gearbox &&
  a?.drive === b?.drive &&
  a?.label === b?.label;

const readStoredCarState = (storage: Storage): StoredCarState => {
  const rawCars = storage.getItem(STORAGE_KEYS.cars);
  const rawSelection = storage.getItem(STORAGE_KEYS.selection);
  const rawVin = storage.getItem(STORAGE_KEYS.vin);
  const parsedCars = rawCars ? (JSON.parse(rawCars) as unknown) : [];
  const parsedSelection = rawSelection ? (JSON.parse(rawSelection) as unknown) : null;

  const cars = normalizeCars(parsedCars);
  const selection = parseSelection(parsedSelection);
  const vin = parseVin(rawVin);

  if (selection && !cars.includes(selection.label)) {
    return { cars: [...cars, selection.label], selection, vin };
  }

  return { cars, selection, vin };
};

const HomeSectionFallback = ({
  minHeight,
}: {
  minHeight: string;
}) => (
  <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-5 lg:px-7">
    <div className="animate-pulse rounded-[28px] border border-sky-100/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(240,249,255,0.88))] p-5 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
      <div className="h-5 w-36 rounded-full bg-slate-200/80" />
      <div
        className="mt-4 rounded-[22px] bg-[linear-gradient(135deg,rgba(226,232,240,0.8),rgba(255,255,255,0.92),rgba(224,242,254,0.76))]"
        style={{ minHeight }}
      />
    </div>
  </div>
);

const Page = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const playHomeAnimations = false;
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<"login" | "register">(
    "login"
  );
  const [authInitialTab, setAuthInitialTab] = useState<
    "profile" | "vins" | "security" | null
  >(null);
  const [user, setUser] = useState<User | null>(null);
  const [selectedCars, setSelectedCars] = useState<string[]>([]);
  const [selectedCarSelection, setSelectedCarSelection] =
    useState<PersistedCarSelection | null>(null);
  const [selectedVin, setSelectedVin] = useState<string | null>(null);
  const [localReady, setLocalReady] = useState(false);
  const [carsLoaded, setCarsLoaded] = useState(false);
  const skipNextRemoteSaveRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      setIsAuthenticated(!!authUser);
      setUser(authUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const nextState = readStoredCarState(window.localStorage);
      setSelectedCars((prev) => (arraysEqual(prev, nextState.cars) ? prev : nextState.cars));
      setSelectedCarSelection((prev) =>
        selectionEqual(prev, nextState.selection) ? prev : nextState.selection
      );
      setSelectedVin((prev) => (prev === nextState.vin ? prev : nextState.vin));
    } catch (error) {
      console.error("Failed to load cars from local storage:", error);
    } finally {
      setLocalReady(true);
    }
  }, []);

  useEffect(() => {
    if (!localReady) return;
    if (!user?.uid) {
      setCarsLoaded(true);
      return;
    }

    let cancelled = false;
    setCarsLoaded(false);

    const extractCars = (value: unknown) =>
      Array.isArray(value)
        ? (value as unknown[]).filter(
            (car): car is string => typeof car === "string" && car.trim() !== ""
          )
        : [];

    const extractSelection = (value: unknown): PersistedCarSelection | null => {
      if (!value || typeof value !== "object") return null;
      const record = value as Record<string, unknown>;
      const brand =
        typeof record.brand === "string" && record.brand.trim()
          ? record.brand
          : "";
      const model =
        typeof record.model === "string" && record.model.trim()
          ? record.model
          : "";
      const label =
        typeof record.label === "string" && record.label.trim()
          ? record.label
          : "";
      const year =
        typeof record.year === "number" && Number.isFinite(record.year)
          ? record.year
          : null;
      const volume =
        typeof record.volume === "string" && record.volume.trim()
          ? record.volume
          : null;
      const power =
        typeof record.power === "string" && record.power.trim()
          ? record.power
          : null;
      const gearbox =
        typeof record.gearbox === "string" && record.gearbox.trim()
          ? record.gearbox
          : null;
      const drive =
        typeof record.drive === "string" && record.drive.trim()
          ? record.drive
          : null;

      if (!brand || !model || !label) return null;
      return { brand, model, year, volume, power, gearbox, drive, label };
    };
    const extractVin = (value: unknown): string | null => {
      if (typeof value !== "string") return null;
      const trimmed = value.trim();
      return trimmed ? trimmed : null;
    };

    const loadCars = async () => {
      try {
        const docRef = doc(db, "users", user.uid);
        const snap = await getDoc(docRef);
        if (!snap.exists()) return;
        const data = snap.data() as {
          avto?: { cars?: unknown; selection?: unknown; vin?: unknown };
          selectedCars?: unknown;
          selectedCarSelection?: unknown;
          selectedVin?: unknown;
        };
        const avtoData = data.avto ?? null;

        const avtoCars = extractCars(avtoData?.cars);
        let storedCars = avtoCars.length ? avtoCars : extractCars(data.selectedCars);

        const avtoSelection = extractSelection(avtoData?.selection);
        const storedSelection =
          avtoSelection ?? extractSelection(data.selectedCarSelection);
        const avtoVin = extractVin(avtoData?.vin);
        const storedVin = avtoVin ?? extractVin(data.selectedVin);

        const hasRemoteSelection =
          Boolean(storedSelection) || storedCars.length > 0 || Boolean(storedVin);
        if (!hasRemoteSelection || cancelled) return;

        if (storedSelection && !storedCars.includes(storedSelection.label)) {
          storedCars = [...storedCars, storedSelection.label];
        }
        setSelectedCars(storedCars);
        setSelectedCarSelection(storedSelection ?? null);
        if (storedVin) {
          setSelectedVin(storedVin);
        } else {
          setSelectedVin(null);
        }
        skipNextRemoteSaveRef.current = true;
      } catch (error) {
        console.error("Failed to load saved cars from Firestore:", error);
      } finally {
        if (!cancelled) {
          setCarsLoaded(true);
        }
      }
    };

    loadCars();

    return () => {
      cancelled = true;
    };
  }, [localReady, user]);

  useEffect(() => {
    if (!localReady) return;
    if (typeof window === "undefined") return;

    const handleStorage = (event: StorageEvent) => {
      if (
        event.key !== STORAGE_KEYS.cars &&
        event.key !== STORAGE_KEYS.selection &&
        event.key !== STORAGE_KEYS.vin
      ) {
        return;
      }

      try {
        const nextState = readStoredCarState(window.localStorage);
        setSelectedCars((prev) => (arraysEqual(prev, nextState.cars) ? prev : nextState.cars));
        setSelectedCarSelection((prev) =>
          selectionEqual(prev, nextState.selection) ? prev : nextState.selection
        );
        setSelectedVin((prev) => (prev === nextState.vin ? prev : nextState.vin));
      } catch (error) {
        console.error("Failed to sync cars from local storage:", error);
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [localReady]);

  const handleCarChange = useCallback((car: string) => {
    const normalized = car.trim();
    if (!normalized) return;
    setSelectedCars((prev) => {
      if (prev.includes(normalized)) {
        return prev.filter((item) => item !== normalized);
      }
      return [...prev, normalized];
    });
  }, []);

  useEffect(() => {
    if (!localReady) return;
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.cars,
        JSON.stringify(selectedCars)
      );
      if (selectedCarSelection) {
        window.localStorage.setItem(
          STORAGE_KEYS.selection,
          JSON.stringify(selectedCarSelection)
        );
      } else {
        window.localStorage.removeItem(STORAGE_KEYS.selection);
      }
      if (selectedVin) {
        window.localStorage.setItem(STORAGE_KEYS.vin, selectedVin);
      } else {
        window.localStorage.removeItem(STORAGE_KEYS.vin);
      }
    } catch (error) {
      console.error("Failed to save cars to local storage:", error);
    }
  }, [localReady, selectedCarSelection, selectedCars, selectedVin]);

  useEffect(() => {
    if (!localReady) return;
    if (!user?.uid) return;
    if (!carsLoaded) return;
    if (skipNextRemoteSaveRef.current) {
      skipNextRemoteSaveRef.current = false;
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const docRef = doc(db, "users", user.uid);
        const avtoPayload = {
          cars: selectedCars,
          selection: selectedCarSelection,
          vin: selectedVin ?? null,
        };
        await setDoc(
          docRef,
          {
            selectedCars,
            selectedCarSelection,
            selectedVin: selectedVin ?? null,
            avto: avtoPayload,
          },
          { merge: true }
        );
      } catch (error) {
        console.error("Failed to save cars to Firestore:", error);
      }
    }, 400);

    return () => window.clearTimeout(timer);
  }, [
    carsLoaded,
    localReady,
    selectedCarSelection,
    selectedCars,
    selectedVin,
    user,
  ]);

  useEffect(() => {
    if (!selectedCarSelection) return;
    if (selectedCars.includes(selectedCarSelection.label)) return;
    setSelectedCarSelection(null);
  }, [selectedCarSelection, selectedCars]);

  const openLoginModal = useCallback(() => {
    setAuthInitialMode("login");
    setAuthInitialTab(null);
    setAuthModalOpen(true);
  }, []);

  const openRegisterModal = useCallback(() => {
    setAuthInitialMode("register");
    setAuthInitialTab(null);
    setAuthModalOpen(true);
  }, []);

  const openVinModal = useCallback(() => {
    setAuthInitialTab("vins");
    setAuthInitialMode("login");
    setAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthInitialTab(null);
    setAuthModalOpen(false);
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <div className="home-static relative min-h-screen bg-blue-100 text-white">
        <div className="section-reveal">
          <Hero
            isAuthenticated={isAuthenticated}
            onLogin={openLoginModal}
            onRegister={openRegisterModal}
            onAddVin={openVinModal}
          />
        </div>

        <DeferredSection
          className="section-reveal relative w-full py-1"
          minHeight="560px"
          rootMargin="220px"
          fallbackDelayMs={10000}
          fallback={<HomeSectionFallback minHeight="520px" />}
        >
          <section className="relative w-full py-1">
          <SectionBoundary title="Модуль товарів тимчасово недоступний">
            <ProductFetcher playEntranceAnimations={playHomeAnimations} />
          </SectionBoundary>
          </section>
        </DeferredSection>

        <DeferredSection
          className="section-reveal relative w-full py-1"
          minHeight="600px"
          rootMargin="180px"
          fallbackDelayMs={12000}
          fallback={<HomeSectionFallback minHeight="560px" />}
        >
          <section className="relative w-full py-1">
          <SectionBoundary title="Модуль підбору авто тимчасово недоступний">
            <Auto
              playEntranceAnimations={playHomeAnimations}
              selectedCars={selectedCars}
              handleCarChange={handleCarChange}
              initialSelection={selectedCarSelection}
              onSelectionChange={setSelectedCarSelection}
              selectedVin={selectedVin}
              onVinSelect={setSelectedVin}
              showSummary
            />
          </SectionBoundary>
          </section>
        </DeferredSection>

        <DeferredSection
          className="section-reveal relative w-full py-1"
          minHeight="420px"
          rootMargin="140px"
          fallbackDelayMs={14000}
          fallback={<HomeSectionFallback minHeight="380px" />}
        >
          <section className="relative w-full py-1">
          <SectionBoundary title="Модуль брендів тимчасово недоступний">
            <BrandCarousel playEntranceAnimations={playHomeAnimations} />
          </SectionBoundary>
          </section>
        </DeferredSection>

        <DeferredSection
          className="section-reveal relative w-full py-1"
          minHeight="380px"
          rootMargin="120px"
          fallbackDelayMs={16000}
          fallback={<HomeSectionFallback minHeight="340px" />}
        >
          <section className="relative w-full py-1">
          <div className="mx-auto grid w-full max-w-screen">
            <SectionBoundary title="Інформаційний блок тимчасово недоступний">
              <AdvantagesSection playEntranceAnimations={playHomeAnimations} />
            </SectionBoundary>
          </div>
          </section>
        </DeferredSection>

        <DeferredSection
          className="section-reveal relative w-full pt-1"
          minHeight="260px"
          rootMargin="80px"
          fallbackDelayMs={18000}
          fallback={<HomeSectionFallback minHeight="220px" />}
        >
          <div className="relative w-full pt-1">
          <SectionBoundary title="Нижній блок тимчасово недоступний">
              <Footer />
            </SectionBoundary>
          </div>
        </DeferredSection>

        {authModalOpen && (
          <AuthModal
            isOpen={authModalOpen}
            user={user}
            initialMode={authInitialMode}
            initialAccountTab={authInitialTab}
            onClose={closeAuthModal}
          />
        )}
      </div>
    </MotionConfig>
  );
};

export default Page;
