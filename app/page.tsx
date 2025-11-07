"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";

import { getAuth, onAuthStateChanged } from "firebase/auth";

import Data from "app/components/Data";
import Footer from "app/components/footer";
import ProductFetcher from "app/components/ProductFetcher";
import LoginModal from "app/components/Login";
import RegisterModal from "app/components/Register";
import Perevag from "app/components/AdvantagesSection";
import BrandCarousel from "app/components/Brands";
import Auto from "app/components/Auto";

export default function Home() {
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [selectedCar, setSelectedCar] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user);
    });

    return () => unsubscribe();
  }, []);

  const handleCarChange = (car: string) => setSelectedCar(car);

  const openLoginModal = () => {
    setIsLoginModalOpen(true);
    setIsRegisterModalOpen(false);
    setIsRegistering(false);
  };

  const openRegisterModal = () => {
    setIsRegisterModalOpen(true);
    setIsLoginModalOpen(false);
    setIsRegistering(true);
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Фоновий градієнт */}
      <motion.div
        className="fixed inset-0 bg-gradient-to-b from-blue-300 via-blue-300 to-red-300 opacity-10 z-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.1 }}
        transition={{ duration: 1, ease: "easeInOut" }}
      />

      <main className="max-w-screen relative bg-white">
        <section className="py-6 px-4 sm:px-6 relative">
          <motion.div
            className="absolute inset-0 bg-gradient-to-br from-gray-800 via-blue-600 to-gray-700 opacity-0"
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2 }}
          />

          <div className="max-w-700 mx-auto relative">
            <div className="flex flex-col lg:flex-row items-stretch">
              {/* Текстовий блок */}
            <motion.div
  className="w-full px-4 sm:px-6"
  initial={{ opacity: 0, y: 30 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.8, ease: 'easeOut' }}
>
  <div className="w-full max-w-6xl mx-auto relative overflow-hidden rounded-3xl p-6 sm:p-10 shadow-2xl border border-white/10 backdrop-blur-lg bg-white/5">
    
    {/* Анімований градієнтний фон */}
    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 via-cyan-500 to-blue-600 animate-gradient-flow opacity-80 rounded-3xl pointer-events-none" />
    
    {/* Світлові ефекти */}
    <div className="absolute -top-24 -left-24 w-72 h-72 bg-cyan-300/30 blur-3xl rounded-full animate-float-slow" />
    <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-indigo-400/30 blur-3xl rounded-full animate-float-slow delay-500" />

    {/* Контент */}
    <div className="relative z-10 text-center sm:text-left">
      <motion.h1
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, delay: 0.2, ease: 'easeOut' }}
        className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight"
        style={{ fontFamily: "'Segoe UI', 'Roboto', sans-serif" }}
      >
       <span className="block bg-gradient-to-r from-cyan-100 via-blue-200 to-blue-100 bg-clip-text text-transparent text-4xl drop-shadow-lg text-right sm:text-left">
  Магазин атвозапчастин
</span>

      </motion.h1>

      <motion.span
        className="block mt-3 text-base sm:text-xl font-medium text-gray-200 text-right sm:text-left"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
      >
        Все для вашого авто — в одному місці
      </motion.span>

      <motion.p
        className="mt-4 text-sm sm:text-base text-blue-200 font-semibold text-right sm:text-left"
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.6, duration: 0.6 }}
      >
        Кожна <span className="text-red-300">деталь</span> має значення.
      </motion.p>
    </div>
  </div>

  {/* CSS для анімацій */}
  <style jsx>{`
    @keyframes gradientFlow {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    .animate-gradient-flow {
      background-size: 200% 200%;
      animation: gradientFlow 10s ease infinite;
    }
    @keyframes floatSlow {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-15px); }
    }
    .animate-float-slow {
      animation: floatSlow 8s ease-in-out infinite;
    }
  `}</style>
</motion.div>


              {/* Зображення */}
              <motion.div
                className="hidden md:flex items-center justify-center w-full max-w-md mx-auto"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.3 }}
              >
                <div className="relative w-full h-40 sm:h-50">
                  <Image
                    src="/Car-parts.png"
                    alt="Автозапчастини"
                    fill
                    className="object-contain p-2"
                    priority
                  />
                </div>
              </motion.div>

              {/* Блок бонусів */}
              <motion.div
                className="w-full"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4 }}
              >
                <div className="relative w-full max-w-xl mx-auto rounded-xl shadow-lg border-3 border-red-300/10 overflow-hidden group">
                  <div className="absolute inset-0 animate-gradient-slow bg-[length:400%_400%] bg-gradient-to-r from-blue-500 via-blue-400 to-blue-800 group-hover:brightness-110 transition duration-1000 ease-in-out blur-md" />
                  <div className="relative z-10 flex flex-col justify-center py-4 px-6 sm:px-5 backdrop-blur-md bg-white/10 rounded-xl">
                    <motion.div
                      className="text-xl font-extrabold text-white text-center mb-2"
                      whileHover={{ scale: 1.05 }}
                    >
                      <div className="flex items-center justify-center">
                        <span className="text-yellow-400 text-3xl">🎁</span>
                        <span className="ml-3 text-2xl text-blue-100 font-bold">
                          Отримайте бонуси!
                        </span>
                      </div>
                    </motion.div>

                    <ul className="space-y-1 text-white/90 text-base sm:text-lg">
                      {[
                        "5% знижка на перше замовлення",
                        "Ексклюзивні пропозиції",
                        "Пріоритетна підтримка",
                      ].map((item, index) => (
                        <motion.li
                          key={index}
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.6 + index * 0.1 }}
                          className="flex items-center"
                        >
                          <motion.span
                            className="flex items-center gap-2"
                            whileHover={{ scale: 1.1 }}
                          >
                            <span className="text-green-400 text-lg">✓</span>
                            {item}
                          </motion.span>
                        </motion.li>
                      ))}
                    </ul>

                    {!isAuthenticated && (
                      <div className="w-full flex justify-end space-x-3 mt-4">
                        <motion.button
                          onClick={openLoginModal}
                          className="py-2 px-5 rounded-lg text-white text-sm font-medium bg-gradient-to-br from-blue-500 to-cyan-500 hover:from-cyan-500 hover:to-blue-600 transition shadow-md focus:ring-2 focus:ring-blue-400"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          Увійти
                        </motion.button>

                        <motion.button
                          onClick={openRegisterModal}
                          className="py-2 px-5 rounded-lg text-white text-sm font-medium bg-gradient-to-br from-orange-400 to-pink-500 hover:from-pink-500 hover:to-orange-500 transition shadow-md focus:ring-2 focus:ring-orange-400"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          Швидка реєстрація
                        </motion.button>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Модальні вікна */}
        {!isAuthenticated && isLoginModalOpen && !isRegistering && (
          <div className="fixed inset-0 z-50 flex justify-center items-center">
            <LoginModal onClose={() => setIsLoginModalOpen(false)} onShowRegister={openRegisterModal} />
          </div>
        )}

        {!isAuthenticated && isRegisterModalOpen && isRegistering && (
          <div className="fixed inset-0 z-50 flex justify-center items-center">
            <RegisterModal onClose={() => setIsRegisterModalOpen(false)} onShowLogin={openLoginModal} />
          </div>
        )}

        {/* Додаткові компоненти */}
        <ProductFetcher />
      <Auto selectedCars={selectedCar ?? ""} handleCarChange={handleCarChange} />

        <BrandCarousel />
           <Perevag />
        <Footer />
      </main>
    </div>
  );
}
