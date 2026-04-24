"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import type { Auth } from "firebase/auth";
import AdvantagesSection from "./AdvantagesSection";
import Hero from "./hero";
import SectionBoundary from "./SectionBoundary";

type RequestIdleCallback = (callback: () => void, options?: { timeout: number }) => number;

type HomeAuthDeps = {
  auth: Auth;
  onAuthStateChanged: typeof import("firebase/auth").onAuthStateChanged;
};

let homeAuthDepsPromise: Promise<HomeAuthDeps> | null = null;

const loadHomeAuthDeps = () => {
  homeAuthDepsPromise ??= Promise.all([
    import("../../firebase"),
    import("firebase/auth"),
  ]).then(([firebaseModule, authModule]) => ({
    auth: firebaseModule.auth,
    onAuthStateChanged: authModule.onAuthStateChanged,
  }));

  return homeAuthDepsPromise;
};

const HomeDeferredStackPlaceholder = () => (
  <section className="relative w-full py-2">
    <div className="page-shell-inline">
      <div className="rounded-[28px] border border-sky-100/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(240,249,255,0.88))] p-5 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
        <div className="h-5 w-36 rounded-full bg-slate-200/80" />
        <div className="mt-4 min-h-[180px] rounded-[22px] bg-[linear-gradient(135deg,rgba(226,232,240,0.8),rgba(255,255,255,0.92),rgba(224,242,254,0.76))]" />
      </div>
    </div>
  </section>
);

export default function HomePageContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [HomeDeferredStackComponent, setHomeDeferredStackComponent] =
    useState<ComponentType | null>(null);
  const [shouldLoadDeferredHome, setShouldLoadDeferredHome] = useState(false);
  const deferredHomeSentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    void loadHomeAuthDeps()
      .then(({ auth, onAuthStateChanged }) => {
        if (cancelled) return;
        setIsAuthenticated(Boolean(auth.currentUser));
        unsubscribe = onAuthStateChanged(auth, (authUser) => {
          setIsAuthenticated(Boolean(authUser));
        });
      })
      .catch((error) => {
        console.error("Failed to load home auth deps:", error);
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || shouldLoadDeferredHome) return;

    let cancelled = false;
    const markReady = () => {
      if (!cancelled) {
        setShouldLoadDeferredHome(true);
      }
    };

    const win = window as Window & {
      requestIdleCallback?: RequestIdleCallback;
      cancelIdleCallback?: (id: number) => void;
    };

    const observer =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(
            (entries) => {
              if (entries.some((entry) => entry.isIntersecting)) {
                observer?.disconnect();
                markReady();
              }
            },
            {
              rootMargin: "480px 0px",
            }
          )
        : null;

    if (observer && deferredHomeSentinelRef.current) {
      observer.observe(deferredHomeSentinelRef.current);
    }

    let timeoutId: number | null = null;
    let idleId: number | null = null;

    if (typeof win.requestIdleCallback === "function") {
      idleId = win.requestIdleCallback(markReady, { timeout: 2500 });
    } else {
      timeoutId = window.setTimeout(markReady, 1800);
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (idleId != null && typeof win.cancelIdleCallback === "function") {
        win.cancelIdleCallback(idleId);
      }
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [shouldLoadDeferredHome]);

  useEffect(() => {
    if (!shouldLoadDeferredHome || HomeDeferredStackComponent) return;

    let cancelled = false;
    void import("./HomeDeferredStack")
      .then((module) => {
        if (!cancelled) {
          setHomeDeferredStackComponent(() => module.default);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Failed to load HomeDeferredStack:", error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [HomeDeferredStackComponent, shouldLoadDeferredHome]);

  const openLoginModal = useCallback(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("openAuthModal", {
        detail: {
          initialMode: "login",
          initialAccountTab: null,
        },
      })
    );
  }, []);

  const openRegisterModal = useCallback(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("openAuthModal", {
        detail: {
          initialMode: "register",
          initialAccountTab: null,
        },
      })
    );
  }, []);

  const openVinModal = useCallback(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event("openAccountVin"));
  }, []);

  return (
    <div className="home-static relative min-h-screen bg-blue-100 text-white">
      <div className="section-reveal">
        <Hero
          isAuthenticated={isAuthenticated}
          onLogin={openLoginModal}
          onRegister={openRegisterModal}
          onAddVin={openVinModal}
        />
      </div>

      <SectionBoundary title="Інформаційний блок тимчасово недоступний">
        <AdvantagesSection />
      </SectionBoundary>

      <div ref={deferredHomeSentinelRef} aria-hidden="true" className="h-px w-full" />

      {HomeDeferredStackComponent ? (
        <HomeDeferredStackComponent />
      ) : shouldLoadDeferredHome ? (
        <HomeDeferredStackPlaceholder />
      ) : (
        <div className="h-6 w-full" />
      )}
    </div>
  );
}
