"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { carBrands, CarBrand } from "../components/carBrands";
import { debounce } from "lodash";
import CarModels from "./CarModels";

interface AutoProps {
  selectedCars: string;
  handleCarChange: (car: string) => void;
}

const AutoSection: React.FC<AutoProps> = ({ selectedCars, handleCarChange }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedBrand, setSelectedBrand] = useState<CarBrand | null>(null);
  const [activeTab, setActiveTab] = useState<"brand" | "model" | "engine">(
    "brand"
  );

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  const debouncedSetSearchTerm = useMemo(
    () => debounce((value: string) => setSearchTerm(value), 250),
    []
  );

  const handleSearchChange = (value: string) => {
    debouncedSetSearchTerm(value);
  };

  const filteredBrands = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return carBrands.filter((brand) =>
      brand.name.toLowerCase().includes(term)
    );
  }, [searchTerm]);

  const onModelSelect = (model: string) => {
    if (selectedBrand) {
      handleCarChange(`${selectedBrand.name} ${model}`);
      setActiveTab("engine");
    }
  };

  const brandVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: i * 0.05, duration: 0.35, ease: "easeOut" },
    }),
  };

  return (
    <motion.section
      whileHover={{
        background:
          "linear-gradient(135deg, rgba(168, 184, 206, 0.15), rgba(191,219,254,0.8))",
        transition: { duration: 0.2, ease: "easeInOut" },
      }}
      initial={{
        background:
          "linear-gradient(135deg, rgba(240,249,255,0.8), rgba(224,242,254,0.8))",
      }}
      animate={{
        background:
          "linear-gradient(135deg, rgba(240,249,255,0.8), rgba(224,242,254,0.8))",
        transition: { duration: 0.6 },
      }}
      className="w-full px-4 sm:px-6 py-10 sm:py-14 
                 overflow-hidden rounded-2xl 
                 transition-all duration-500 shadow-lg"
    >
     <div
  className={`w-full mx-auto flex flex-col-reverse lg:flex-row 
              ${selectedBrand ? "lg:flex-row-reverse" : "lg:flex-row"} 
              gap-6 lg:gap-10 max-w-8xl`}
>

        {/* 🚗 Список брендів/моделей */}
        <div className="flex-1 pt-2 pb-6 relative min-w-0">
          <AnimatePresence mode="wait">
            {!selectedBrand ? (
              <motion.div
                key="brands"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="relative h-full"
              >
                <div
                  ref={scrollRef}
                  className="overflow-x-auto overflow-y-hidden py-4 px-1 sm:px-2 
                             scrollbar-thin scrollbar-thumb-blue-300/80 scrollbar-track-transparent"
                  style={{
                    scrollbarGutter: "stable",
                    height: "360px",
                    minWidth: "100%",
                  }}
                >
                  <div
                    className="inline-grid grid-rows-2 grid-flow-col gap-5 sm:gap-6 px-2 sm:px-4"
                    style={{
                      width: `${Math.ceil(filteredBrands.length / 6) * 300}px`,
                    }}
                  >
                    {filteredBrands.map((brand, i) => (
                      <motion.button
                        key={brand.id}
                        onClick={() => {
                          setSelectedBrand(brand);
                          setActiveTab("model");
                        }}
                        className="group relative bg-white border border-gray-200 
                                   rounded-2xl p-5 flex flex-col items-center justify-center 
                                   transition-all duration-300 ease-in-out w-[150px] h-[150px] 
                                   overflow-hidden hover:scale-[1.1] hover:bg-blue-200 hover:border-blue-400 hover:shadow-xl"
                        initial="hidden"
                        animate="visible"
                        custom={i}
                        variants={brandVariants}
                        aria-label={`Вибрати ${brand.name}`}
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-white/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        <div className="h-20 w-full flex items-center justify-center mb-3 z-10">
                          <img
                            src={brand.logo}
                            alt={brand.name}
                            className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-110"
                            loading="lazy"
                          />
                        </div>
                        <span className="text-base font-semibold text-gray-800 text-center z-10 select-none group-hover:text-blue-500 transition-colors">
                          {brand.name}
                        </span>
                      </motion.button>
                    ))}
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="models"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <CarModels
                  selectedBrand={selectedBrand.name}
                  onModelSelect={onModelSelect}
                  onBack={() => {
                    setSelectedBrand(null);
                    setActiveTab("brand");
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 🔍 Пошук + опис/вкладки */}
        <motion.div
          whileHover={{
            scale: 1.01,
            backgroundColor: "rgba(250, 252, 255, 0.39)",
            transition: { duration: 0.2 },
          }}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="w-full lg:w-[38%] px-6 sm:px-20 py-10 flex flex-col justify-start 
                     bg-white backdrop-blur-md rounded-3xl shadow-2xl border border-blue-300/40 
                     transition-all duration-300"
          style={{ boxShadow: "0 20px 40px rgba(59,130,246,0.2)" }}
        >
          {!selectedBrand ? (
            <>
              <h2 className="text-blue-500 text-3xl sm:text-4xl font-extrabold mb-6 leading-snug tracking-tight border-l-4 border-blue-600 pl-5 font-sans">
                Оберіть марку авто
              </h2>
              <p className="text-gray-600 mb-6 text-lg font-medium tracking-wide font-sans max-w-xl">
                Оберіть марку автомобіля серед більш ніж 60 марок у списку або
                скористайтесь пошуком.
              </p>
              <div className="relative w-full sm:max-w-md mt-2">
                <input
                  type="text"
                  placeholder="Наприклад Ford..."
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="w-full pl-5 pr-12 py-3 
                             rounded-xl border border-blue-200 
                             bg-white/90 shadow-sm
                             text-base text-gray-700 font-medium
                             placeholder:text-blue-300
                             focus:ring-2 focus:ring-blue-400 focus:border-blue-400 focus:outline-none
                             transition-all duration-300 hover:border-blue-300"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg 
                             bg-blue-100 text-blue-500 hover:bg-blue-200 
                             transition-colors duration-300"
                  aria-label="Пошук"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    viewBox="0 0 24 24"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-5-5" />
                  </svg>
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Вкладки тільки після вибору марки */}
              <div className="flex gap-4 mb-6 border-b border-blue-200">
                {["brand", "model", "engine"].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => {
                      if (tab === "brand") {
                        setSelectedBrand(null);
                        setActiveTab("brand");
                      } else {
                        setActiveTab(tab as any);
                      }
                    }}
                    className={`pb-2 text-lg font-semibold transition-colors ${
                      activeTab === tab
                        ? "text-blue-600 border-b-2 border-blue-600"
                        : "text-gray-500 hover:text-blue-400"
                    }`}
                  >
                    {tab === "brand"
                      ? "Марка"
                      : tab === "model"
                      ? "Модель"
                      : "Двигун"}
                  </button>
                ))}
              </div>

              <h2 className="text-blue-500 text-3xl sm:text-4xl font-extrabold mb-6 leading-snug tracking-tight border-l-4 border-blue-600 pl-5 font-sans">
                {activeTab === "model"
                  ? `Оберіть модель ${selectedBrand?.name}`
                  : "Оберіть двигун"}
              </h2>
            </>
          )}
        </motion.div>
      </div>
    </motion.section>
  );
};

export default AutoSection;
