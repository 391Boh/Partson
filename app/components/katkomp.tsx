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
      className="p-4 mb-4 rounded-2xl bg-gradient-to-br from-gray-100 via-white to-gray-100 border border-gray-200 shadow-md h-full flex flex-col"
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
      }}
    >
      {/* Заголовок */}
      <div className="flex items-center gap-3 mb-3">
        <div className="bg-red-100 w-10 h-10 rounded-full flex items-center justify-center">
          <span className="text-lg font-bold text-red-600">2</span>
        </div>
        <h3 className="text-lg md:text-xl font-semibold text-gray-800">Обирай категорію</h3>
      </div>

      {/* Пошук */}
      <div className="relative mb-4">
        <input
          type="text"
          placeholder="Пошук категорії..."
          className="bg-white w-full p-2.5 pl-10 text-sm md:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent shadow-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <svg
          className="w-4 h-4 md:w-5 md:h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      {/* Список категорій */}
      <motion.div
        ref={scrollRef}
        className="relative overflow-x-auto no-scrollbar pb-2 flex-grow select-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ overflowY: "hidden", scrollBehavior: "smooth" }}
      >
        {filteredCategories.length > 0 ? (
          <div className="flex gap-3">
            {filteredCategories.map((category) => {
              const isSelected = selectedCategory === category.name;
              return (
                <motion.button
                  key={category.id}
                  onClick={() => handleCategoryChange(category.name)}
                  className={`flex flex-col items-center justify-center rounded-xl flex-shrink-0 transition-all min-w-[140px] md:min-w-[160px] h-28 md:h-32 ${
                    isSelected
                      ? "bg-red-500 text-white shadow-lg"
                      : "bg-white border border-gray-200 hover:border-red-400 hover:shadow-md text-gray-800"
                  }`}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                >
                  <div className="w-12 h-12 md:w-14 md:h-14 mb-1.5">
                    <img
                      src={category.logo}
                      alt={category.name}
                      className="w-full h-full object-contain"
                      loading="lazy"
                    />
                  </div>
                  <span className="text-xs md:text-sm font-medium text-center leading-tight px-2">
                    {category.name}
                  </span>
                </motion.button>
              );
            })}
          </div>
        ) : (
          <motion.div
            className="text-center py-6 text-gray-500 text-sm md:text-base flex items-center justify-center w-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            Категорії не знайдено
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default Category;
