// Auto.tsx
"use client";

import React, { useState, useRef } from "react";
import { motion } from "framer-motion";

interface AutoProps {
  selectedCars: string;
  handleCarChange: (car: string) => void;
}

const Auto: React.FC<AutoProps> = ({ selectedCars, handleCarChange }) => {
  const carBrands = [
    { id: 1, name: "AUDI", logo: "/Carlogo/audi.svg" },
    { id: 2, name: "BMW", logo: "/Carlogo/bmw.svg" },
    { id: 3, name: "CHERY", logo: "/Carlogo/Chery.svg" },
    { id: 4, name: "CHRYSLER", logo: "/Carlogo/Chrysler.svg" },
    { id: 5, name: "CITROEN", logo: "/Carlogo/Citroen.svg" },
    { id: 6, name: "CADILLAC", logo: "/Carlogo/Cadillac.svg" },
    { id: 7, name: "DACIA", logo: "Carlogo/Dacia.svg" },
    { id: 8, name: "DAEWOO", logo: "/Carlogo/Daewoo.svg" },
    { id: 9, name: "DAF", logo: "/Carlogo/Daf.svg" },
    { id: 10, name: "DODGE", logo: "/Carlogo/Dodge.svg" },
    { id: 11, name: "FERRARI", logo: "/Carlogo/Ferrari.svg" },
    { id: 12, name: "FIAT", logo: "/Carlogo/Fiat.svg" },
    { id: 13, name: "FORD", logo: "/Carlogo/Ford.svg" },
    { id: 14, name: "FORD USA", logo: "/Carlogo/Ford.svg" },
    { id: 15, name: "GEELY", logo: "/Carlogo/Geely.svg" },
    { id: 16, name: "HONDA", logo: "/Carlogo/Honda.svg" },
    { id: 17, name: "HUMMER", logo: "/Carlogo/Hummer.svg" },
    { id: 18, name: "HYUNDAI", logo: "/Carlogo/Hyunndai.svg" },
    { id: 19, name: "INFINITI", logo: "/Carlogo/Infiniti.svg" },
    { id: 20, name: "ISUZU", logo: "/Carlogo/Isuzu.svg" },
    { id: 21, name: "IVECO", logo: "/Carlogo/Iveco.svg" },
    { id: 22, name: "JAGUAR", logo: "/Carlogo/Jaguar.svg" },
    { id: 23, name: "JEEP", logo: "/Carlogo/Jeep.svg" },
    { id: 24, name: "KIA", logo: "/Carlogo/KIA.svg" },
    { id: 25, name: "LADA", logo: "/Carlogo/Lada.svg" },
    { id: 26, name: "LAMBORGHINI", logo: "/Carlogo/Lamborghini.svg" },
    { id: 27, name: "LANCIA", logo: "/Carlogo/Lancia.svg" },
    { id: 28, name: "LAND ROVER", logo: "/Carlogo/Landrover.svg" },
    { id: 29, name: "LEXUS", logo: "/Carlogo/Lexus.svg" },
    { id: 30, name: "LINCOLN", logo: "/Carlogo/Lincoln.svg" },
    { id: 31, name: "LOTUS", logo: "/Carlogo/Lotus.svg" },
    { id: 32, name: "MAN", logo: "/Carlogo/man.png" },
    { id: 33, name: "MASERATI", logo: "/Carlogo/Maserati.svg" },
    { id: 34, name: "MAYBACH", logo: "/Carlogo/Maybach.svg" },
    { id: 35, name: "MAZDA", logo: "/Carlogo/Mazda.svg" },
    { id: 36, name: "MERCEDES-BENZ", logo: "/Carlogo/Mercedes.svg" },
    { id: 37, name: "MINI", logo: "/Carlogo/Mini.svg" },
    { id: 38, name: "MITSUBISHI", logo: "/Carlogo/Mitsubishi.svg" },
    { id: 39, name: "NISSAN", logo: "/Carlogo/Nissan.svg" },
    { id: 40, name: "OPEL", logo: "/Carlogo/Opel.svg" },
    { id: 41, name: "PEUGEOT", logo: "/Carlogo/Peugeot.svg" },
    { id: 42, name: "PONTIAC", logo: "/Carlogo/Pontiac.png" },
    { id: 43, name: "PORSCHE", logo: "/Carlogo/Porsche.svg" },
    { id: 44, name: "RAM", logo: "/Carlogo/Ram.png" },
    { id: 45, name: "RENAULT", logo: "/Carlogo/Renault.svg" },
    { id: 46, name: "ROLLS-ROYCE", logo: "/Carlogo/Rollsroyce.svg" },
    { id: 47, name: "ROVER", logo: "/Carlogo/Rover.png" },
    { id: 48, name: "SAAB", logo: "/Carlogo/Saab.png" },
    { id: 49, name: "SEAT", logo: "/Carlogo/Seat.svg" },
    { id: 50, name: "SKODA", logo: "/Carlogo/Skoda.png" },
    { id: 51, name: "SMART", logo: "/Carlogo/Smart.svg" },
    { id: 52, name: "SSANGYONG", logo: "/Carlogo/Ssangyong.svg" },
    { id: 53, name: "SUBARU", logo: "/Carlogo/Subaru.svg" },
    { id: 54, name: "SUZUKI", logo: "/Carlogo/Suzuki.svg" },
    { id: 55, name: "TESLA", logo: "/Carlogo/Tesla.svg" },
    { id: 56, name: "TOYOTA", logo: "/Carlogo/Toyota.svg" },
    { id: 57, name: "VOLVO", logo: "/Carlogo/Volvo.svg" },
    { id: 58, name: "VOLKSWAGEN", logo: "/Carlogo/Volkswagen.svg" },
    { id: 59, name: "ACURA", logo: "/Carlogo/Acura.svg" },
    { id: 60, name: "ALFA ROMEO", logo: "/Carlogo/Alfaromeo.svg" },
    { id: 61, name: "ASTON MARTIN", logo: "/Carlogo/Astonmartin.svg" },
    { id: 62, name: "BENTLEY", logo: "/Carlogo/Bentley.svg" }
  ];

  const [searchTerm, setSearchTerm] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const filteredBrands = carBrands.filter((brand) =>
    brand.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setStartX(e.pageX - (scrollRef.current?.offsetLeft || 0));
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollRef.current) return;
    const x = e.pageX - (scrollRef.current?.offsetLeft || 0);
    const scroll = (x - startX) * 1.5;
    scrollRef.current.scrollLeft -= scroll;
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <motion.div
    className="p-6 rounded-2xl border bg-gradient-to-br from-gray-300 via-gray-200 to-gray-100 border-gray-200 hover:border-blue-500 transition-all hover:shadow-md backdrop-blur-sm h-full flex flex-col"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ 
      duration: 0.6,
      delay: 0.2,
      ease: [0.16, 1, 0.3, 1]
    }}
    whileHover={{
      y: -6,
      transition: { duration: 0.3 },
    }}
  >
      {/* Header */}
      <div className="flex items-center justify-start mb-4">
        <div className="bg-blue-100 w-12 h-12 rounded-full flex items-center justify-center mr-3">
          <span className="text-xl font-bold text-blue-600">1</span>
        </div>
        <h3 className="text-xl font-semibold text-gray-800 w-full text-left">Обирай марку авто</h3>
      </div>

      {/* Search Input */}
      <div className="relative mb-6">
        <input
          type="text"
          placeholder="Пошук бренду..."
          className="bg-white w-full p-3 pl-12 text-lg border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <svg
          className="w-5 h-5 absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>

      {/* Car Brand Buttons - Now with fixed height and flex-grow */}
      <motion.div
        ref={scrollRef}
        className="relative overflow-x-auto bg-gradient-to-br from-blue-1 via-blue-30 to-blue-50 scrollbar-thumb-blue-300 scrollbar-track-gray-200 scrollbar-thumb-rounded-full scrollbar-w-2 scrollbar-h-2 pb-2 flex-grow"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ scrollbarColor: "#93c5fd #e5e7eb", scrollbarWidth: "thin" }}
      >
        {filteredBrands.length > 0 ? (
          <div className="flex gap-4 h-full items-center">
            {filteredBrands.map((brand) => {
              const isSelected = selectedCars === brand.name;
              return (
                <motion.button
                  key={brand.id}
                  onClick={() => handleCarChange(brand.name)}
                  className={`flex flex-col items-center justify-center p-4 rounded-2xl flex-shrink-0 transition-all w-48 h-36 ${
                    isSelected
                      ? "bg-blue-500 text-white shadow-md"
                      : "bg-white border border-gray-200 hover:border-blue-400 hover:shadow-md text-gray-800"
                  }`}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <div className="w-16 h-16 mb-2">
                    <img
                      src={brand.logo}
                      alt={brand.name}
                      className="w-full h-full object-contain"
                      loading="lazy"
                    />
                  </div>
                  <span className="text-sm font-bold text-center leading-tight">
                    {brand.name}
                  </span>
                </motion.button>
              );
            })}
          </div>
        ) : (
          <motion.div
            className="text-center py-6 text-gray-500 text-lg h-full flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            Бренди не знайдено
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default Auto;