'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

interface SearchBarProps {
  onSearch: (searchQuery: string, filterBy: 'all' | 'article' | 'name' | 'code') => void;
}

const SearchBar: React.FC<SearchBarProps> = ({ onSearch }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBy, setFilterBy] = useState<'all' | 'article' | 'name' | 'code'>('all');
  const [isClient, setIsClient] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleSearch = () => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) return;

    onSearch(trimmedQuery, filterBy);

    router.push(`/katalog?search=${encodeURIComponent(trimmedQuery)}&filter=${filterBy}`);

    setSearchQuery('');
    setFilterBy('all');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  if (!isClient) return null;

  return (
    <div className="flex items-center border border-gray-500 rounded-full overflow-hidden w-full max-w-full mx-auto shadow-md transition-all hover:shadow-xl focus-within:ring-2 focus-within:ring-blue-500">
      <input
        type="text"
        placeholder="Пошук..."
        className="bg-gray-800 text-white px-3 py-2 outline-none w-full text-sm transition-all focus:bg-gray-700 placeholder-gray-400"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={handleKeyPress}
      />
      <select
        className="bg-gray-700 text-white h-9 border-l border-gray-600 outline-none text-sm px-2 py-2"
        value={filterBy}
        onChange={(e) => setFilterBy(e.target.value as 'all' | 'article' | 'name' | 'code')}
      >
        <option value="all">Усюди</option>
        <option value="article">Артикул</option>
        <option value="name">Назва</option>
        <option value="code">Код</option>
      </select>
      <button
        className="bg-red-600 px-3 py-2 hover:bg-red-700 transition flex items-center justify-center"
        onClick={handleSearch}
      >
        <Search size={20} className="text-white" />
      </button>
    </div>
  );
};

export default SearchBar;
