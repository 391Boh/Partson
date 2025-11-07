'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Data from 'app/components/Data';
import FilterSidebar from 'app/components/filtrtion';
import Order from 'app/components/Order';

interface CartItem {
  name: string;
  code: string;
  quantity: number;
  price: number;
}

const Katalog: React.FC = () => {
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    const search = searchParams.get('search') || '';
    setSearchQuery(search);
  }, [searchParams]);

  const [selectedCars, setSelectedCars] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [isSidebarVisible, setIsSidebarVisible] = useState<boolean>(true);
  const [isOrderVisible, setIsOrderVisible] = useState<boolean>(false);

  const handleCarChange = (car: string) => {
    setSelectedCars((prev) =>
      prev.includes(car) ? prev.filter((c) => c !== car) : [...prev, car]
    );
  };

  const handleCategoryChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setSelectedCategories(value ? [value] : []);
  };

  const toggleSidebar = () => {
    setIsSidebarVisible((prev) => !prev);
  };

  const toggleOrder = () => {
    setIsOrderVisible((prev) => !prev);
  };

  const addToCart = (item: CartItem) => {
    console.log('🛒 Додано в кошик:', item);
    // логіка додавання в кошик
  };

  return (
    <div className="fixed inset-0 mt-20 flex overflow-hidden">
      <FilterSidebar
        selectedCars={selectedCars}
        handleCarChange={handleCarChange}
        isSidebarVisible={isSidebarVisible}
        toggleSidebar={toggleSidebar}
      />

      <div className="flex-1">
        <Data
          searchQuery={searchQuery}
          searchFilter="all"
          selectedCars={selectedCars}
          selectedCategories={selectedCategories}
        />
      </div>

      {isOrderVisible && <Order onClose={toggleOrder} />}
    </div>
  );
};

export default Katalog;
