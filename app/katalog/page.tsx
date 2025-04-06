"use client";

import { useState } from 'react';
import Data from 'app/components/Data'; // Import Data component
import { useSearchParams } from 'next/navigation';
import FilterSidebar from 'app/components/filtrtion'; // Import FilterSidebar component

const Katalog: React.FC = () => {
  // State for selected cars
  const [selectedCars, setSelectedCars] = useState<string[]>([]); // Changed type to an array
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [isSidebarVisible, setIsSidebarVisible] = useState<boolean>(true); // State for sidebar visibility

  // Function to handle car selection
  const handleCarChange = (car: string) => {
    setSelectedCars((prev) => {
      if (prev.includes(car)) {
        return prev.filter((c) => c !== car); // Remove the car if already selected
      } else {
        return [...prev, car]; // Add the car if it's not selected
      }
    });
  };

  // Function to handle category change
  const handleCategoryChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setSelectedCategories(value ? [value] : []); // Update selected categories
  };

  // Get the search query from URL params
  const searchParams = useSearchParams();
  const searchQuery = searchParams?.get('search') || ''; // Search query

  // Toggle sidebar visibility
  const toggleSidebar = () => {
    setIsSidebarVisible((prev) => !prev);
  };

  return (
    <div className="max-w-full mx-auto p-6 mt-25 flex gap-6">
      {/* Filter sidebar */}
      <FilterSidebar
        selectedCars={selectedCars}
        handleCarChange={handleCarChange}
        isSidebarVisible={isSidebarVisible}
        toggleSidebar={toggleSidebar}
      />

      {/* Data component for displaying content */}
      <div className="flex-1 p-4 bg-white rounded-xl shadow-md">
        {/* Pass search query, selected cars, and categories */}
        <Data searchQuery={searchQuery} selectedCars={selectedCars} selectedCategories={selectedCategories} />
      </div>
    </div>
  );
};

export default Katalog;
