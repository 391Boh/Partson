'use client';

import { FC, useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Auto from 'app/components/Auto';
import Category from 'app/components/katkomp';
import { FaChevronLeft, FaChevronRight, FaCar, FaTh } from 'react-icons/fa';

interface FilterSidebarProps {
  selectedCars: string[];
  handleCarChange: (car: string) => void;
  isSidebarVisible: boolean;
  toggleSidebar: () => void;
}

const FilterSidebar: FC<FilterSidebarProps> = ({
  selectedCars,
  handleCarChange,
  isSidebarVisible,
  toggleSidebar,
}) => {
  const searchParams = useSearchParams();
  const [activeComponent, setActiveComponent] = useState<'auto' | 'category'>('auto');
  const [internalSelectedCars, setInternalSelectedCars] = useState<string[]>(selectedCars);
  const [sortByPriceAsc, setSortByPriceAsc] = useState(true);

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const touchEndY = useRef<number | null>(null);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'category' || tabParam === 'auto') {
      setActiveComponent(tabParam);
    }
  }, [searchParams]);

  useEffect(() => {
    setInternalSelectedCars(selectedCars);
  }, [selectedCars]);

  const handleInternalCarChange = useCallback(
    (car: string) => {
      setInternalSelectedCars(prev => {
        const updated = prev.includes(car)
          ? prev.filter(c => c !== car)
          : [...prev, car];
        handleCarChange(car);
        return updated;
      });
    },
    [handleCarChange]
  );

  const toggleSortOrder = useCallback(() => {
    setSortByPriceAsc(prev => !prev);
  }, []);

  const handleComponentToggle = useCallback((component: 'auto' | 'category') => {
    setActiveComponent(component);
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
    touchEndY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement;

    if (target.closest('.scrollable')) return;

    if (
      touchStartX.current !== null &&
      touchEndX.current !== null &&
      touchStartY.current !== null &&
      touchEndY.current !== null
    ) {
      const deltaX = touchStartX.current - touchEndX.current;
      const deltaY = touchStartY.current - touchEndY.current;

      if (Math.abs(deltaY) > Math.abs(deltaX)) return;

      if (Math.abs(deltaX) > 50 && Math.abs(deltaY) < 50) {
        if (deltaX > 0 && isSidebarVisible) toggleSidebar();
        else if (deltaX < 0 && !isSidebarVisible) toggleSidebar();
      }
    }

    touchStartX.current = null;
    touchEndX.current = null;
    touchStartY.current = null;
    touchEndY.current = null;
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={!isSidebarVisible ? toggleSidebar : undefined}
      className={`fixed top-0 mt-28 left-0 z-[9999] transition-all duration-200 ease-out
        ${isSidebarVisible
          ? 'w-full h-[445vh] sm:h-500vh] md:h-[105vh] lg:w-1/3 lg:h-[60vh]'
          : 'w-12 h-screen cursor-pointer'}
        ${isSidebarVisible ? 'rounded-none sm:rounded-xl' : 'rounded-xl'}
        overflow-hidden shadow-lg ml-2
        bg-gradient-to-br from-blue-100/50 to-pink-50/50 backdrop-blur-sm`}
    >
      {isSidebarVisible && (
        <button
          onClick={e => {
            e.stopPropagation();
            toggleSidebar();
          }}
          className="absolute top-3 right-3 p-4 text-gray-600 hover:text-gray-800 focus:outline-none z-10 transition duration-200"
          aria-label="Згорнути панель"
        >
          <FaChevronLeft size={18} />
        </button>
      )}

      {!isSidebarVisible && (
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center space-y-3 z-20">
          <FaChevronRight size={18} className="mb-4 text-gray-500 animate-pulse" />
          <button
            onClick={e => {
              e.stopPropagation();
              setActiveComponent('auto');
              toggleSidebar();
            }}
            className="bg-white p-2 rounded-full shadow-lg hover:bg-gray-200 transition"
            aria-label="Вибір авто"
          >
            <FaCar size={18} className="text-gray-600" />
          </button>
          <button
            onClick={e => {
              e.stopPropagation();
              setActiveComponent('category');
              toggleSidebar();
            }}
            className="bg-white p-2 rounded-full shadow-lg hover:bg-gray-200 transition"
            aria-label="Вибір категорії"
          >
            <FaTh size={18} className="text-gray-600" />
          </button>
        </div>
      )}

      {isSidebarVisible && (
        <div className="p-3 pt-4 flex flex-col h-full">
          <div className="flex-1 overflow-auto scrollable max-h-[42vh] sm:max-h-[520vh]">
            {activeComponent === 'auto' ? (
              <Auto selectedCars={internalSelectedCars} handleCarChange={handleInternalCarChange} />
            ) : (
              <Category />
            )}
          </div>

          <div className="pt-2 flex space-x-2 text-sm">
            <button
              onClick={() => handleComponentToggle('auto')}
              className={`flex-1 py-2 px-2 rounded-xl shadow-md backdrop-blur-sm transition-all hover:scale-105 ${
                activeComponent === 'auto'
                  ? 'bg-blue-200/70 text-blue-800 font-semibold'
                  : 'bg-white/30 text-gray-700 hover:bg-white/50'
              }`}
            >
              Вибір авто
            </button>
            <button
              onClick={() => handleComponentToggle('category')}
              className={`flex-1 py-2 px-2 rounded-xl shadow-md backdrop-blur-sm transition-all hover:scale-105 ${
                activeComponent === 'category'
                  ? 'bg-pink-100/60 text-pink-800 font-semibold'
                  : 'bg-white/30 text-gray-700 hover:bg-white/50'
              }`}
            >
              Категорії
            </button>
          </div>

          <div className="mt-3 flex justify-between items-center text-sm">
            <h3 className="font-medium text-gray-800">Сортування</h3>
            <button
              onClick={toggleSortOrder}
              className={`px-3 py-1 rounded-xl shadow-md backdrop-blur-sm transition-all hover:scale-105 ${
                sortByPriceAsc
                  ? 'bg-blue-200/60 text-blue-800'
                  : 'bg-pink-100/60 text-pink-800'
              }`}
            >
              {sortByPriceAsc ? '↓ Ціна' : '↑ Ціна'}
            </button>
          </div>

          <div className="mt-4">
            <button
              onClick={() => alert('Знайти!')}
              className="w-full py-2 px-3 rounded-xl bg-blue-600 text-white font-semibold shadow-lg hover:bg-blue-700 active:bg-blue-800 transition-all text-sm"
            >
              Знайти
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FilterSidebar;
