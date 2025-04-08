"use client";

import { useState } from 'react';
import Data from 'app/components/Data';
import { useSearchParams } from 'next/navigation';
import FilterSidebar from 'app/components/filtrtion';

const Katalog: React.FC = () => {
  const [selectedCars, setSelectedCars] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [isSidebarVisible, setIsSidebarVisible] = useState<boolean>(true);

  const handleCarChange = (car: string) => {
    setSelectedCars((prev) =>
      prev.includes(car) ? prev.filter((c) => c !== car) : [...prev, car]
    );
  };

  const handleCategoryChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setSelectedCategories(value ? [value] : []);
  };

  const searchParams = useSearchParams();
  const searchQuery = searchParams?.get('search') || '';

  const toggleSidebar = () => {
    setIsSidebarVisible((prev) => !prev);
  };

  return (
    <div className="fixed inset-0 top-[94px] flex overflow-hidden">
      <FilterSidebar
        selectedCars={selectedCars}
        handleCarChange={handleCarChange}
        isSidebarVisible={isSidebarVisible}
        toggleSidebar={toggleSidebar}
      />

      <div className="flex-1">
        <Data
          searchQuery={searchQuery}
          selectedCars={selectedCars}
          selectedCategories={selectedCategories}
        />
      </div>
    </div>
  );
};

export default Katalog;