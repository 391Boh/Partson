import { FC, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Auto from 'app/components/autochose';
import Category from 'app/components/katkomp';
import { FaChevronLeft, FaChevronRight, FaCar, FaTh } from 'react-icons/fa';

interface FilterSidebarProps {
  selectedCars: string[];
  handleCarChange: (car: string) => void;
  isSidebarVisible: boolean;
  toggleSidebar: () => void;
}

const FilterSidebar: FC<FilterSidebarProps> = ({
  selectedCars, // Виправлено опечатку (було selectedCars)
  handleCarChange,
  isSidebarVisible,
  toggleSidebar,
}) => {
  const searchParams = useSearchParams();
  const [activeComponent, setActiveComponent] = useState<'auto' | 'category'>('auto');
  const [internalSelectedCars, setInternalSelectedCars] = useState<string[]>(selectedCars); // Ініціалізуємо з пропсів
  const [sortByPriceAsc, setSortByPriceAsc] = useState(true);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'category' || tabParam === 'auto') {
      setActiveComponent(tabParam);
    }
  }, [searchParams]);

  useEffect(() => {
    setInternalSelectedCars(selectedCars);
  }, [selectedCars]);

  const handleInternalCarChange = useCallback((car: string) => {
    setInternalSelectedCars(prev => {
      const updatedCars = prev.includes(car)
        ? prev.filter(c => c !== car)
        : [...prev, car];
      handleCarChange(car); // Викликаємо оригінальний обробник
      return updatedCars;
    });
  }, [handleCarChange]);

  const handleComponentToggle = useCallback((component: 'auto' | 'category') => {
    setActiveComponent(component);
  }, []);

  return (
    <div
      className={`ml-5 relative transition-all duration-200 ease-out ${
        isSidebarVisible ? 'w-1/3' : 'w-16'
      } overflow-hidden rounded-xl shadow-lg fixed top-0 left-0 z-30 bg-gradient-to-br from-blue-100/50 to-pink-50/50 backdrop-blur-sm`}
      style={{ height: 'calc(95vh - 96px)' }}
    >
      {/* Toggle button */}
      <button
        onClick={toggleSidebar}
        className="absolute top-4 right-4 p-2 text-gray-600 hover:text-gray-800 focus:outline-none z-10 cursor-pointer transition duration-200 ease-in-out"
        aria-label={isSidebarVisible ? 'Згорнути панель' : 'Розгорнути панель'}
      >
        {isSidebarVisible ? <FaChevronLeft size={24} /> : <FaChevronRight size={24} />}
      </button>

      {/* Icons when collapsed */}
      {!isSidebarVisible && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center space-y-4 z-20">
          <button
            onClick={() => {
              setActiveComponent('auto');
              toggleSidebar();
            }}
            className="flex items-center justify-center bg-white p-3 rounded-full shadow-lg hover:bg-gray-200 focus:outline-none"
            aria-label="Вибір авто"
          >
            <FaCar size={20} className="text-gray-600" />
          </button>

          <button
            onClick={() => {
              setActiveComponent('category');
              toggleSidebar();
            }}
            className="flex items-center justify-center bg-white p-3 rounded-full shadow-lg hover:bg-gray-200 focus:outline-none"
            aria-label="Вибір категорії"
          >
            <FaTh size={20} className="text-gray-600" />
          </button>
        </div>
      )}

      {/* Sidebar content */}
      {isSidebarVisible && (
        <div className="p-4 flex pt-20 flex-col h-full">
          <div className="flex-1 overflow-auto">
            {activeComponent === 'auto' ? (
              <div className="h-full">
                <Auto 
                  selectedCars={internalSelectedCars} 
                  handleCarChange={handleInternalCarChange} 
                />
              </div>
            ) : (
              <div className="h-full flex flex-col">
                <Category 
                  // Додайте необхідні пропси для Category, якщо потрібно
                />
              </div>
            )}
          </div>

          {/* Switch buttons */}
          <div className="mt-4 flex space-x-2">
            <button
              onClick={() => handleComponentToggle('auto')}
              className={`flex-1 py-2 px-4 rounded-xl shadow-md backdrop-blur-sm transition-all duration-300 hover:scale-105 ${
                activeComponent === 'auto'
                  ? 'bg-blue-200/70 text-blue-800 font-semibold'
                  : 'bg-white/30 text-gray-700 hover:bg-white/50'
              }`}
            >
              Вибір авто
            </button>
            <button
              onClick={() => handleComponentToggle('category')}
              className={`flex-1 py-2 px-4 rounded-xl shadow-md backdrop-blur-sm transition-all duration-300 hover:scale-105 ${
                activeComponent === 'category'
                  ? 'bg-pink-100/60 text-pink-800 font-semibold'
                  : 'bg-white/30 text-gray-700 hover:bg-white/50'
              }`}
            >
              Вибір категорії
            </button>
          </div>

          {/* Sort by price */}
          <div className="mt-6 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-800">Сортування</h3>
            <button
              onClick={() => setSortByPriceAsc(!sortByPriceAsc)}
              className={`px-4 py-2 rounded-xl shadow-md backdrop-blur-sm transition-all duration-500 ease-in-out hover:scale-105 ${
                sortByPriceAsc
                  ? 'bg-blue-200/60 text-blue-800'
                  : 'bg-pink-100/60 text-pink-800'
              }`}
            >
              {sortByPriceAsc ? 'Низька ціна' : 'Висока ціна'}
            </button>
          </div>

          {/* Search button */}
          <div className="mt-6">
            <button
              onClick={() => alert('Знайти!')}
              className="w-full py-2 px-4 rounded-xl bg-blue-600 text-white font-semibold shadow-lg hover:bg-blue-700 active:bg-blue-800 transition-all duration-300"
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