'use client';

import { useEffect, useState } from 'react';

interface DataProps {
  searchQuery: string;
  selectedCars: string[];
  selectedCategories: string[];
}

const ITEMS_PER_PAGE = 16;

const Data: React.FC<DataProps> = ({ searchQuery, selectedCars, selectedCategories }) => {
  const [data, setData] = useState<any[]>([]); 
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/getData');
        if (!response.ok) {
          throw new Error(`Помилка: ${response.status} ${response.statusText}`);
        }
        const result = await response.json();
        setData(result);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Фільтрація даних на основі пошуку та вибору фільтрів
  const filteredData = data?.filter((item) => {
    const matchesSearchQuery = item.name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCar = selectedCars.length === 0 || selectedCars.includes(item.car);
    const matchesCategory = selectedCategories.length === 0 || selectedCategories.includes(item.category);
    
    return matchesSearchQuery && matchesCar && matchesCategory;
  });

  // Розрахунок відображених елементів на поточній сторінці
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const currentPageData = filteredData.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  // Кількість сторінок
  const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);

  // Переміщення на попередню або наступну сторінку
  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  return (
    <div className="p-2 mt-2" style={{ height: 'calc(100vh - 96px)', overflowY: 'auto' }}>
      {loading && (
        <div className="text-center text-blue-500">
          <div className="loader"></div>
          Завантаження...
        </div>
      )}

      {error && <div className="text-center text-red-500">Помилка: {error}</div>}

      {!loading && !error && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mt-2 ml-auto">
            {currentPageData.length > 0 ? (
              currentPageData.map((item) => (
                <div key={item.id || item.cod || item.name} className="border p-6 rounded-xl shadow-lg bg-white hover:shadow-xl transition-all">
                  <h3 className="text-xl font-semibold text-gray-800">{item.name}</h3>
                  <p className="text-sm text-gray-600">Код: {item.cod}</p>
                  <p className="text-sm text-gray-600">Артикул: {item.articul}</p>
                  <p className="text-sm text-gray-600">Вибір авто: {item.car}</p>
                  <p className="text-sm text-gray-600">Категорія: {item.category}</p>
                </div>
              ))
            ) : (
              <div className="col-span-full text-center text-gray-500 text-lg">
                Нічого не знайдено
              </div>
            )}
          </div>

          {/* Pagination Controls */}
          <div className="flex justify-center mt-4 space-x-2">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-4 py-2 bg-blue-500 text-white rounded-md disabled:bg-gray-300"
            >
              Попередня
            </button>
            <span className="flex items-center">{`Сторінка ${currentPage} з ${totalPages}`}</span>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-4 py-2 bg-blue-500 text-white rounded-md disabled:bg-gray-300"
            >
              Наступна
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default Data;
