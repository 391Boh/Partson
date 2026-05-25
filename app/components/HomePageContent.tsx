"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import AdvantagesSection from "./AdvantagesSection";
import Footer from "./footer";
import Hero from "./hero";
import SectionBoundary from "./SectionBoundary";
import { useFirebaseAuthState } from "app/lib/firebase-auth-state";

type RequestIdleCallback = (callback: () => void, options?: { timeout: number }) => number;

const placeholderHeights = [
  "clamp(360px, 74svh, 520px)",
  "clamp(400px, 78svh, 560px)",
  "clamp(300px, 62svh, 380px)",
] as const; // must match HomeSectionFallback heights in HomeDeferredStack.tsx

const HomeDeferredStackPlaceholder = () => (
  <>
    {placeholderHeights.map((minHeight, index) => (
      <section
        key={`home-placeholder-${minHeight}`}
        className="home-section-stage relative w-full"
        aria-busy="true"
      >
        <div className="page-shell-inline">
          <div className="rounded-[20px] border border-sky-100/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(240,249,255,0.88))] p-3 shadow-[0_12px_28px_rgba(15,23,42,0.05)] sm:rounded-[28px] sm:p-5 sm:shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
            <div
              className="h-5 rounded-full bg-slate-200/80"
              style={{ width: index === 0 ? "9rem" : index === 1 ? "10rem" : "8rem" }}
            />
            <div
              className="mt-4 rounded-[22px] bg-[linear-gradient(135deg,rgba(226,232,240,0.8),rgba(255,255,255,0.92),rgba(224,242,254,0.76))]"
              style={{ minHeight }}
            />
          </div>
        </div>
      </section>
    ))}
  </>
);

export default function HomePageContent() {
  const { ready: authReady, user } = useFirebaseAuthState();
  const isAuthenticated = Boolean(user);
  const [HomeDeferredStackComponent, setHomeDeferredStackComponent] =
    useState<ComponentType | null>(null);
  const [shouldLoadDeferredHome, setShouldLoadDeferredHome] = useState(false);
  const deferredHomeSentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!shouldLoadDeferredHome || HomeDeferredStackComponent) return;

    let cancelled = false;
    void import("./HomeDeferredStack")
      .then((module) => {
        if (cancelled) return;
        setHomeDeferredStackComponent(() => module.default);
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
              rootMargin: "1400px 0px",
            }
          )
        : null;

    if (observer && deferredHomeSentinelRef.current) {
      observer.observe(deferredHomeSentinelRef.current);
    }

    let timeoutId: number | null = null;
    let idleId: number | null = null;

    if (typeof win.requestIdleCallback === "function") {
      idleId = win.requestIdleCallback(markReady, { timeout: 1400 });
    } else {
      timeoutId = window.setTimeout(markReady, 1200);
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
    <div className="home-static relative min-h-screen overflow-hidden bg-blue-100 text-white">
      <div className="section-reveal home-section-stage home-section-stage-hero">
        <Hero
          isAuthenticated={isAuthenticated}
          authReady={authReady}
          onLogin={openLoginModal}
          onRegister={openRegisterModal}
          onAddVin={openVinModal}
        />
      </div>

      <div ref={deferredHomeSentinelRef} aria-hidden="true" className="h-px w-full" />

      {HomeDeferredStackComponent ? <HomeDeferredStackComponent /> : <HomeDeferredStackPlaceholder />}

      <div className="home-section-stage">
        <SectionBoundary title="Інформаційний блок тимчасово недоступний">
          <AdvantagesSection />
        </SectionBoundary>
      </div>

      <Footer />
    </div>
  );
}
