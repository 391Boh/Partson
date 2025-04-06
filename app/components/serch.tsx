'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

interface SearchBarProps {
  onSearch: (query: string) => void;
}

const SearchBar: React.FC<SearchBarProps> = ({ onSearch }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();

  // Функція для виконання пошуку
  const handleSearch = () => {
    if (searchQuery.trim()) {
      onSearch(searchQuery);
      router.push(`/katalog?search=${encodeURIComponent(searchQuery)}`);
    }
  };

  // Обробник натискання клавіші Enter
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="flex items-center border border-gray-600 rounded-full overflow-hidden w-[500px] mx-auto shadow-md transition-all hover:shadow-xl focus-within:ring-2 focus-within:ring-blue-500">
      <input
        type="text"
        placeholder="Пошук запчастин..."
        className="bg-gray-800 text-white px-5 py-3 outline-none w-full transition-all focus:bg-gray-700 focus:pl-6 placeholder-gray-400"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={handleKeyPress}
      />
      <button
        className="bg-red-600 px-5 py-3 hover:bg-red-700 transition hover:scale-110 active:scale-95"
        onClick={handleSearch}
      >
        <Search size={22} className="text-white" />
      </button>
    </div>
  );
};

export default SearchBar;
