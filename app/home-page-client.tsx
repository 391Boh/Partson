"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MotionConfig } from "framer-motion";
import { getAuth, onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import ProductFetcher from "./components/tovar";

import Hero from "./components/hero";
import Auto, { type PersistedCarSelection } from "./components/Auto";
import BrandCarousel from "./components/Brands";
import AdvantagesSection from "./components/AdvantagesSection";
import Footer from "./components/footer";
import AuthModal from "./components/AuthModal";
import SectionBoundary from "./components/SectionBoundary";
import { db } from "../firebase";

const STORAGE_KEYS = {
  cars: "partson:selectedCars",
  selection: "partson:selectedCarSelection",
  vin: "partson:selectedVin",
};
const HOME_ANIMATION_KEY = "partson:home-page-animations-played";

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

const Page = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [playHomeAnimations] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(HOME_ANIMATION_KEY) !== "1";
  });
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
    if (!playHomeAnimations) return;
    window.sessionStorage.setItem(HOME_ANIMATION_KEY, "1");
  }, [playHomeAnimations]);

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

        <section className="section-reveal relative w-full py-1">
          <SectionBoundary title="Модуль товарів тимчасово недоступний">
            <ProductFetcher playEntranceAnimations={playHomeAnimations} />
          </SectionBoundary>
        </section>

        <section className="section-reveal relative w-full overflow-hidden py-1">
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

        <section className="section-reveal relative w-full py-1">
          <SectionBoundary title="Модуль брендів тимчасово недоступний">
            <BrandCarousel playEntranceAnimations={playHomeAnimations} />
          </SectionBoundary>
        </section>

        <section className="section-reveal relative w-full py-1">
          <div className="mx-auto grid w-full max-w-screen">
            <SectionBoundary title="Інформаційний блок тимчасово недоступний">
              <AdvantagesSection playEntranceAnimations={playHomeAnimations} />
            </SectionBoundary>
          </div>
        </section>

        <div className="section-reveal relative w-full pt-1">
          <SectionBoundary title="Нижній блок тимчасово недоступний">
            <Footer />
          </SectionBoundary>
        </div>

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

