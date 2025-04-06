"use client";

import React, { useState, useRef } from "react";
import { motion } from "framer-motion";

interface CategoryProps {
  selectedCategory: string;
  handleCategoryChange: (category: string) => void;
}

const Category: React.FC<CategoryProps> = ({ selectedCategory, handleCategoryChange }) => {
  const categories = [
    { id: 1, name: "Кузовні елементи", logo: "/Katlogo/kyzov.svg" },
    { id: 2, name: "Деталі підвіски", logo: "/Katlogo/suspension.png" },
    { id: 3, name: "Привід та коробка передач", logo: "/Katlogo/transmition.svg" },
    { id: 4, name: "Деталі двигуна", logo: "/Katlogo/engine.png" },
    { id: 5, name: "Гальмівна система", logo: "/Katlogo/brake.svg" },
    { id: 6, name: "Система охолодження", logo: "/Katlogo/ohol.svg" },
    { id: 7, name: "Освітлення", logo: "/Katlogo/osv.svg" },
    { id: 8, name: "Аксесуари для авто", logo: "/Katlogo/accessories.png" },
    { id: 9, name: "Паливна система", logo: "/Katlogo/fuel.png" },
    { id: 10, name: "Вихлопна система", logo: "/Katlogo/exhaust.png" },
    { id: 11, name: "Рідини та мастила", logo: "/Katlogo/oil.svg" },
    { id: 12, name: "Кондиціонування та обігрів", logo: "/Katlogo/ohol.svg" },
    { id: 13, name: "Датчики та електроніка", logo: "/Katlogo/datchuk.svg" },
    { id: 14, name: "Деталі для ТО", logo: "/Katlogo/to.png" },
  ];

  const [searchTerm, setSearchTerm] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const filteredCategories = categories.filter((category) =>
    category.name.toLowerCase().includes(searchTerm.toLowerCase())
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
      className="p-6 rounded-2xl border bg-gradient-to-br from-gray-100 to-gray-200 border-gray-200 hover:border-red-500 transition-all hover:shadow-md backdrop-blur-sm h-full flex flex-col"
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: {
          opacity: 1,
          y: 0,
          transition: {
            duration: 0.6,
            ease: [0.16, 1, 0.3, 1],
          },
        },
      }}
      whileHover={{
        y: -6,
        transition: { duration: 0.3 },
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-start mb-4">
        <div className="bg-red-100 w-12 h-12 rounded-full flex items-center justify-center mr-3">
          <span className="text-xl font-bold text-red-600">2</span>
        </div>
        <h3 className="text-xl font-semibold text-gray-800 w-full text-left">Обирай категорію</h3>
      </div>

      {/* Search Input */}
      <div className="relative mb-6">
        <input
          type="text"
          placeholder="Пошук категорії..."
          className="bg-white w-full p-3 pl-12 text-lg border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
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

      {/* Category Buttons - Now with fixed height and flex-grow */}
      <motion.div
     ref={scrollRef}
     className="relative opacity-100 bg-gradient-to-br from-red-1 via-red-30 to-red-50 overflow-x-auto scrollbar-thumb-red-300 scrollbar-track-gray-200 scrollbar-thumb-rounded-full scrollbar-w-2 scrollbar-h-2 pb-2 flex-grow"
     initial={{ opacity: 0 }}
     animate={{ opacity: 1 }}
     transition={{ delay: 0.4 }}
     onMouseDown={handleMouseDown}
     onMouseMove={handleMouseMove}
     onMouseUp={handleMouseUp}
     onMouseLeave={handleMouseUp}
     style={{
       scrollbarColor: "#db2828 #f0f0f0", // червоний колір для скролбару та світлий фон
       scrollbarWidth: "thin", // Тонкий скролбар
       overflowY: "scroll", // Завжди активний скролбар
     }}
     
      >
        {filteredCategories.length > 0 ? (
          <div className="flex gap-4 h-full items-center">
            {filteredCategories.map((category) => {
              const isSelected = selectedCategory === category.name;
              return (
                <motion.button
                  key={category.id}
                  onClick={() => handleCategoryChange(category.name)}
                  className={`flex flex-col items-center justify-center p-4 rounded-2xl flex-shrink-0 transition-all w-48 h-36 ${
                    isSelected
                      ? "bg-red-500 text-white shadow-md"
                      : "bg-white border border-gray-200 hover:border-red-400 hover:shadow-md text-gray-800"
                  }`}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <div className="w-16 h-16 mb-2">
                    <img
                      src={category.logo}
                      alt={category.name}
                      className="w-full h-full object-contain"
                      loading="lazy"
                    />
                  </div>
                  <span className="text-sm font-bold text-center leading-tight">
                    {category.name}
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
            Категорії не знайдено
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default Category;