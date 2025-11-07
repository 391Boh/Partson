'use client';

import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Info, ShoppingCart, ChevronDown } from 'lucide-react';
import { useCart } from 'app/context/CartContext';
import SearchBar from 'app/components/Search';

interface DataProps {
  selectedCars: string[];
  selectedCategories: string[];
}

interface Product {
  Количество: number;
  НоменклатураНаименование: string;
  НоменклатураКод: string;
  НомерПоКаталогу: string;
  ПроизводительНаименование: string;
  РодительНаименование: string;
  РодительРодительНаименование: string;
  Ціна?: number;
}

const ITEMS_PER_PAGE = 16;

const Data: React.FC<DataProps> = ({ selectedCars, selectedCategories }) => {
  const { addToCart, cartItems } = useCart();
  const searchParams = useSearchParams();

  // Дістаємо search і filter з URL
  const searchQuery = searchParams.get('search') || '';
  const searchFilter = (searchParams.get('filter') as 'all' | 'article' | 'name' | 'code') || 'all';

  const groupFromURL = searchParams.get('group');
  const subcategoryFromURL = searchParams.get('subcategory');

  const [data, setData] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [flippedCard, setFlippedCard] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<{ [key: string]: number }>({});
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const requestBody: any = {
          selectedCars,
          selectedCategories,
          НомерСтраницы: currentPage,
        };

        if (searchQuery.trim()) {
          if (searchFilter === 'name') {
            requestBody['Наименование'] = searchQuery.trim();
          } else if (searchFilter === 'code') {
            requestBody['Код'] = searchQuery.trim();
          } else if (searchFilter === 'article') {
            requestBody['НомерПоКаталогу'] = searchQuery.trim();
          } else if (searchFilter === 'all') {
            requestBody['Наименование'] = searchQuery.trim();
          }
        }

        if (groupFromURL && (!subcategoryFromURL || subcategoryFromURL.trim() === '')) {
          requestBody.Подгруппа = groupFromURL;
        } else if (subcategoryFromURL?.trim()) {
          requestBody.Группа = groupFromURL;
          requestBody.Подгруппа = subcategoryFromURL.trim();
        }

  const response = await fetch("/api/proxy?endpoint=getdata", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(requestBody),
});

        if (!response.ok) throw new Error(`Помилка: ${response.status} ${response.statusText}`);
        const result: Product[] = await response.json();

        setData(prev => (currentPage === 1 ? result : [...prev, ...result]));
        setHasMore(result.length === ITEMS_PER_PAGE);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [searchQuery, searchFilter, selectedCars, selectedCategories, currentPage, groupFromURL, subcategoryFromURL]);

  useEffect(() => {
    const initialQuantities: { [key: string]: number } = {};
    data.forEach(item => {
      initialQuantities[item.НоменклатураКод] = 1;
    });
    setQuantities(initialQuantities);
  }, [data]);

  const uniqueData = Array.from(new Map(data.map(item => [item.НоменклатураКод, item])).values());

  const filteredData = uniqueData.filter(item => {
    const query = searchQuery.toLowerCase();
    const matchesQuery =
      searchFilter === 'article' ? item.НомерПоКаталогу?.toLowerCase().includes(query) :
      searchFilter === 'name' ? item.НоменклатураНаименование?.toLowerCase().includes(query) :
      searchFilter === 'code' ? item.НоменклатураКод?.toLowerCase().includes(query) :
      item.НомерПоКаталогу?.toLowerCase().includes(query) ||
      item.НоменклатураНаименование?.toLowerCase().includes(query) ||
      item.НоменклатураКод?.toLowerCase().includes(query);

    const matchesCategory =
      selectedCategories.length === 0 ||
      selectedCategories.includes(item.РодительНаименование) ||
      selectedCategories.includes(item.РодительРодительНаименование);

    return matchesQuery && matchesCategory;
  });

  const toggleFlip = (id: string) => {
    setFlippedCard(prev => (prev === id ? null : id));
  };

  const handleQuantityChange = (code: string, delta: number, maxQty: number) => {
    setQuantities(prev => {
      const current = prev[code] || 1;
      const newQty = Math.max(1, Math.min(current + delta, maxQty));
      return { ...prev, [code]: newQty };
    });
  };

  const handleAddToCart = (item: Product) => {
    const qtyToAdd = quantities[item.НоменклатураКод] || 1;
    const cartItem = cartItems.find(ci => ci.code === item.НоменклатураКод);
    const currentInCart = cartItem?.quantity || 0;

    if (currentInCart + qtyToAdd > item.Количество) {
      alert(`Неможливо додати більше ніж ${item.Количество} шт. усього`);
      return;
    }

    addToCart({
      code: item.НоменклатураКод,
      name: item.НоменклатураНаименование,
      article: item.НомерПоКаталогу,
      quantity: qtyToAdd,
      price: item.Ціна || 1000,
    });
  };

  useEffect(() => {
    if (currentPage > 1 && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [data]);

  return (
    <div className="sticky p-4 pl-18 m-3 pb-32 sm:pb-16" style={{ height: 'calc(100vh - 96px)', overflowY: 'auto' }}>
      <div className="sticky top-0 z-50 bg-transparent shadow-none sm:hidden">
        <SearchBar onSearch={(query) => console.log(query)} />
      </div>

      {!loading && error && <div className="text-center text-red-500">Помилка: {error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mt-2 mx-auto">
        {filteredData.length > 0 ? (
          filteredData.map(item => {
            const isFlipped = flippedCard === item.НоменклатураКод;
            const cartItem = cartItems.find(ci => ci.code === item.НоменклатураКод);
            const qty = quantities[item.НоменклатураКод] || 1;
            const isAvailable = item.Количество > 0;
            const currentInCart = cartItem?.quantity || 0;
            const isMaxReached = currentInCart + qty > item.Количество;
            const isButtonDisabled = !isAvailable || isMaxReached;

            return (
              <div
                key={item.НоменклатураКод}
                className="relative w-full h-[360px] sm:h-[300px] [perspective:1000px] transition-transform duration-300"
              >
                <motion.div
                  className="relative w-full h-full"
                  animate={{ rotateY: isFlipped ? 180 : 0 }}
                  transition={{ duration: 0.6 }}
                  style={{ transformStyle: 'preserve-3d' }}
                >
                  {/* FRONT */}
                  <div className="absolute w-full h-full backface-hidden overflow-hidden bg-gradient-to-br from-gray-50 via-gray-100 to-gray-200 p-3 rounded-xl shadow-lg flex flex-col" style={{ transform: 'rotateY(0deg)', backfaceVisibility: 'hidden' }}>
                    <div className="h-20 overflow-hidden text-center pr-5">
                      <h3 className="text-base font-semibold text-gray-800">
                        {item.НоменклатураНаименование.replace(/\s*\(.*?\)/g, '')}
                      </h3>
                    </div>
                    <div className="flex flex-row gap-4">
                      <div className="w-28 h-28 bg-gray-200 rounded-lg flex items-center justify-center shrink-0">
                        <span className="text-gray-400 text-sm text-center">Фото<br />товару</span>
                      </div>
                      <div className="flex flex-col justify-start text-sm w-full pt-3 gap-1">
                        <div className="flex justify-between"><span className="text-gray-600">Код:</span><span className="text-gray-800">{item.НоменклатураКод}</span></div>
                        <div className="flex justify-between"><span className="text-gray-600">Артикул:</span><span className="text-gray-800">{item.НомерПоКаталогу}</span></div>
                        <div className="flex justify-between"><span className="text-gray-600">Виробник:</span><span className="text-gray-800">{item.ПроизводительНаименование}</span></div>
                      </div>
                    </div>
                    <div className="text-right mb-2 mt-auto">
                      <span className="text-xl text-gray-600 mr-1">Ціна:</span>
                      <span className="text-xl font-bold text-gray-800">{item.Ціна ? `${item.Ціна} грн` : '1000 грн'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex flex-col items-start gap-2 flex-grow">
                        <p className={`text-sm ${isAvailable ? 'text-green-600' : 'text-red-600'}`}>
                          {isAvailable ? `Доступно: ${item.Количество} шт.` : 'Під замовлення'}
                        </p>
                        <div className="flex items-center bg-gray-100 border border-gray-300 rounded-full px-2 py-1 shadow-inner">
                          <button onClick={() => handleQuantityChange(item.НоменклатураКод, -1, item.Количество)} className="w-8 h-8 rounded-full text-lg font-bold text-gray-600 hover:bg-gray-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed" disabled={qty <= 1}>−</button>
                          <span className="w-10 text-center font-semibold text-gray-800">{qty}</span>
                          <button onClick={() => handleQuantityChange(item.НоменклатураКод, 1, item.Количество)} className="w-8 h-8 rounded-full text-lg font-bold text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed" disabled={isMaxReached}>+</button>
                        </div>
                      </div>
                      <div className="ml-4 flex items-center gap-3">
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: !isButtonDisabled ? 0.9 : 1 }}
                          onClick={() => handleAddToCart(item)}
                          className={`relative p-3 rounded-md transition-colors ${!isButtonDisabled ? 'bg-red-400 text-white hover:bg-red-600' : 'bg-gray-300 text-gray-600 cursor-not-allowed'}`}
                          disabled={isButtonDisabled}
                          title={isButtonDisabled ? (isAvailable ? 'Максимальна кількість у кошику' : 'Немає в наявності') : 'Додати у кошик'}
                        >
                          <ShoppingCart size={24} />
                          {cartItem && (
                            <span className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full px-1.5 text-xs font-bold">
                              {cartItem.quantity}
                            </span>
                          )}
                        </motion.button>
                        <button
                          onClick={() => toggleFlip(item.НоменклатураКод)}
                          className="text-gray-500 hover:text-gray-700 transition-colors"
                          title="Детальніше"
                        >
                          <Info size={24} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* BACK */}
                  <div
                    className="absolute w-full h-full backface-hidden bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl shadow-lg p-3 flex flex-col"
                    style={{ transform: 'rotateY(180deg)', backfaceVisibility: 'hidden' }}
                  >
                    <h3 className="text-lg font-semibold mb-2">{item.НоменклатураНаименование}</h3>
                    <p className="text-sm text-gray-700 overflow-y-auto flex-grow">{item.РодительРодительНаименование || item.РодительНаименование || '-'}</p>
                    <button
                      onClick={() => toggleFlip(item.НоменклатураКод)}
                      className="mt-3 self-end text-gray-500 hover:text-gray-700 transition-colors"
                      title="Назад"
                    >
                      <ChevronDown size={24} className="rotate-180" />
                    </button>
                  </div>
                </motion.div>
              </div>
            );
          })
        ) : (
          !loading && !error && (
            <div className="col-span-full text-center flex flex-col items-center gap-10 py-10 px-4 bg-slate-500 rounded-2xl shadow-2xl">
              <p className="text-xl sm:text-2xl font-bold text-white">
                На жаль, <span className="text-rose-400">«{searchQuery}»</span> не знайдено
              </p>
              <p className="text-sm sm:text-base text-slate-300 max-w-md leading-relaxed">
                Ми не змогли знайти запчастину з такою назвою у базі. Можливо, вона є в наявності, але ще не додана на сайт.
                <br />Зв'яжіться з нашим менеджером — він допоможе знайти саме те, що вам потрібно.
              </p>
            </div>
          )
        )}
      </div>

      <div ref={bottomRef}></div>

      {hasMore && !loading && (
       <button
  onClick={() => setCurrentPage(prev => prev + 1)}
  className="block mx-auto mt-8 px-6 py-3 bg-gradient-to-r from-blue-600 via-blue-500 to-blue-700 text-white font-semibold rounded-xl shadow-lg hover:brightness-110 active:scale-95 transition transform duration-200"
>
 Більше товарів
</button>

      )}

    {loading && (
  <div className="text-center mt-6">
    <div className="loader mx-auto"></div>
  </div>
)}

    </div>
  );
};

export default Data;
