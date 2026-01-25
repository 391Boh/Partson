"use client";

import { useCallback, useEffect, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";

import Hero from "./components/hero";
import ProductFetcher from "./components/tovar";
import Auto from "./components/Auto";
import BrandCarousel from "./components/Brands";
import AdvantagesSection from "./components/AdvantagesSection";
import Footer from "./components/footer";
import AuthModal from "./components/AuthModal";

const Page = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<"login" | "register">(
    "login"
  );
  const [user, setUser] = useState<any | null>(null);
  const [selectedCars, setSelectedCars] = useState<string[]>([]);

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user);
      setUser(user);
    });
    return () => unsubscribe();
  }, []);

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

  const openLoginModal = useCallback(() => {
    setAuthInitialMode("login");
    setAuthModalOpen(true);
  }, []);

  const openRegisterModal = useCallback(() => {
    setAuthInitialMode("register");
    setAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthModalOpen(false);
  }, []);

  return (
    <div className="relative min-h-screen bg-blue-100 text-white">
      <Hero
        isAuthenticated={isAuthenticated}
        onLogin={openLoginModal}
        onRegister={openRegisterModal}
      />

      <section className="w-full bg-blue-850/80 py-1">
        <div className="mx-auto grid w-full max-w-screen ">
          <ProductFetcher />
        </div>
      </section>

      <section className="w-full border-t border-white/10 bg-blue-450/90 overflow-hidden">
        <div className="mx-auto grid w-full max-w-screen px-0 ">
          <Auto
            selectedCars={selectedCars}
            handleCarChange={handleCarChange}
            showSummary
          />
        </div>
      </section>

      <BrandCarousel />

      <section className="w-full border-t border-white/10 bg-blue-450/90 py-10">
        <div className="mx-auto grid w-full max-w-[1400px] gap-6 px-4 sm:px-6 lg:px-8">
          <AdvantagesSection />
        </div>
      </section>

      <Footer />

      {!isAuthenticated && authModalOpen && (
        <AuthModal
          isOpen={authModalOpen}
          user={user}
          initialMode={authInitialMode}
          onClose={closeAuthModal}
        />
      )}
    </div>
  );
};

export default Page;
