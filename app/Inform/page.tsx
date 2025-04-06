'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { MapPin, CreditCard, Truck, Info, ChevronLeft, ChevronRight } from 'lucide-react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion'; 

// Динамічний імпорт карти з вимкненим SSR
const MapComponent = dynamic(() => import('app/components/Map'), {
  ssr: false,
  loading: () => <div className="h-[400px] flex items-center justify-center">Завантаження карти...</div>
});

const tabData = [
  {
    key: 'delivery',
    icon: <Truck size={24} />,
    title: '📦 Доставка',
    text: (
      <div className="text-center">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 text-left">
          {/* Доставка по Україні */}
          <div className="p-6 border border-blue-300 bg-blue-50 rounded-xl shadow-lg transition-transform transform hover:scale-105 hover:shadow-xl hover:bg-blue-100">
            <h4 className="text-2xl text-center font-semibold text-indigo-700 mb-4">🚚 Доставка по Україні</h4>
            <p className="mb-4">Ми доставляємо товари по всій Україні зручними для вас службами:</p>
            <ul className="space-y-3">
              <li><strong className="text-blue-600">🚛 Нова Пошта:</strong> доставка у відділення або кур'єром.</li>
              <li><strong className="text-blue-600">📦 Укрпошта:</strong> бюджетна доставка у відділення або поштомат.</li>
              <li><strong className="text-blue-600">🔵 Meest Express:</strong> швидка адресна доставка.</li>
              <li><strong className="text-blue-600">📬 Justin:</strong> отримання у поштоматах.</li>
            </ul>
            <p className="mt-5"><strong className="text-indigo-700">💰 Вартість:</strong> згідно з тарифами перевізника.</p>
            <p><strong className="text-indigo-700">⏳ Термін доставки:</strong> зазвичай 1-3 дні.</p>
          </div>
  
          {/* Доставка у Львові */}
          <div className="p-6 border border-indigo-300 bg-indigo-50 rounded-xl shadow-lg transition-transform transform hover:scale-105 hover:shadow-xl hover:bg-indigo-100">
            <h4 className="text-2xl text-center font-semibold text-indigo-700 mb-4">🚴 Доставка у Львові</h4>
            <p className="mb-4">Для мешканців Львова доступні такі варіанти:</p>
            <ul className="space-y-3">
              <li><strong className="text-blue-600">🚴 Кур'єрська доставка:</strong> від 50 грн, час – 2-4 години.</li>
              <li><strong className="text-blue-600">🏪 Самовивіз:</strong> вул. Перфецького (Пн-Сб 08:00-19:00, Нд 09:00-17:00).</li>
              <li><strong className="text-blue-600">🛵 Експрес-доставка:</strong> за 1-2 години (за додаткову плату).</li>
            </ul>
            <p className="mt-5">📞 <strong className="text-indigo-700">Телефон для уточнень:</strong> +38 (063)-421-18-51</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    key: 'payment',
    icon: <CreditCard size={24} />,
    title: '💳 Оплата',
    text: (
      <div className="text-center">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 text-left">
          {/* Оплата на сайті */}
          <div className="p-6 border border-green-300 bg-green-50 rounded-xl shadow-lg transition-transform transform hover:scale-105 hover:shadow-xl hover:bg-green-100">
            <h4 className="text-2xl font-semibold text-green-700 mb-4">💻 Оплата на сайті</h4>
            <p className="mb-4">Ви можете швидко та безпечно оплатити своє замовлення безпосередньо на сайті за допомогою платіжної картки.</p>
            <ul className="space-y-3">
              <li><strong className="text-green-600">🔒 Безпека:</strong> Ваші дані захищені на всіх етапах транзакції за допомогою сучасних технологій шифрування.</li>
              <li><strong className="text-green-600">💳 Доступні методи оплати:</strong> Visa, MasterCard, Приват24.</li>
              <li><strong className="text-green-600">⏱️ Швидкість:</strong> Оплата займає лише кілька хвилин, і ваше замовлення одразу ж обробляється.</li>
            </ul>
            <p className="mt-5"><strong className="text-green-700">📌 Вартість:</strong> без додаткових комісій.</p>
          </div>
  
          {/* Оплата при отриманні на пошті або самовивозі */}
          <div className="p-6 border border-orange-300 bg-orange-50 rounded-xl shadow-lg transition-transform transform hover:scale-105 hover:shadow-xl hover:bg-orange-100">
            <h4 className="text-2xl font-semibold text-orange-700 mb-4">📦 Оплата при отриманні</h4>
            <p className="mb-4">Якщо ви обрали доставку на відділення пошти або самовивіз, ви можете оплатити замовлення при отриманні:</p>
            <ul className="space-y-3">
              <li><strong className="text-orange-600">💵 Готівка:</strong> Сплатіть замовлення безпосередньо при отриманні на відділенні пошти або при самовивозі.</li>
              <li><strong className="text-orange-600">💳 Карта:</strong> Ви також можете розплатитись карткою прямо на відділенні, використовуючи POS-термінал.</li>
              <li><strong className="text-orange-600">🕰️ Час оплати:</strong> Оплата здійснюється безпосередньо під час отримання замовлення або під час самовивозу.</li>
            </ul>
            <p className="mt-5"><strong className="text-orange-700">💰 Комісія:</strong> може бути додатково стягнена за оплату готівкою або карткою при отриманні в залежності від політики перевізника.</p>
          </div>
        </div>
      </div>
    ),
  },
  
  {
    key: 'about',
    icon: <Info size={24} />,
    title: 'Про нас',
    text: (
      <div className="text-center">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 text-left">
          {/* Місія компанії */}
          <div className="p-6 border border-purple-300 bg-purple-50 rounded-xl shadow-lg transition-transform transform hover:scale-105 hover:shadow-xl hover:bg-purple-100">
            <h4 className="text-2xl font-semibold text-purple-700 mb-4">🌟 Наша місія</h4>
            <p className="mb-4">Ми прагнемо надавати нашим клієнтам тільки найкращі товари та послуги, створюючи при цьому безпечну та зручну покупку на кожному етапі.</p>
            <p className="mb-4">Наша мета — це не просто продаж, а забезпечення вашого задоволення від кожної покупки, щоб ви поверталися до нас знову і знову.</p>
            <ul className="space-y-3">
              <li><strong className="text-purple-600">🌍 Стабільність:</strong> Наша компанія працює на ринку вже понад 5 років, з успішними проектами та відгуками клієнтів.</li>
              <li><strong className="text-purple-600">💼 Професіоналізм:</strong> Наші співробітники — це команда фахівців, які завжди готові допомогти вам на кожному етапі покупки.</li>
              <li><strong className="text-purple-600">💬 Взаємодія:</strong> Ми активно взаємодіємо з клієнтами, отримуючи зворотний зв'язок, щоб удосконалювати наші послуги та товари.</li>
            </ul>
          </div>
  
          {/* Команда */}
          <div className="p-6 border border-blue-300 bg-blue-50 rounded-xl shadow-lg transition-transform transform hover:scale-105 hover:shadow-xl hover:bg-blue-100">
            <h4 className="text-2xl font-semibold text-blue-700 mb-4">👨‍👩‍👧‍👦 Наша команда</h4>
            <p className="mb-4">Ми — це команда людей, які люблять свою роботу і кожен день прагнуть зробити ваш досвід покупок неперевершеним.</p>
            <p className="mb-4">Наші співробітники — це висококваліфіковані спеціалісти, готові дати відповідь на будь-яке ваше питання та допомогти в будь-якій ситуації.</p>
            <ul className="space-y-3">
              <li><strong className="text-blue-600">👨‍💻 Професіонали:</strong> Кожен член нашої команди має багаторічний досвід роботи у сфері продажів та клієнтського обслуговування.</li>
              <li><strong className="text-blue-600">📈 Розвиток:</strong> Ми постійно розвиваємось, впроваджуючи нові технології та покращуючи процеси роботи для вашої зручності.</li>
              <li><strong className="text-blue-600">💡 Ідеї:</strong> Ми відкриті для нових ідей та інновацій, і завжди шукаємо способи покращити наш сервіс і продукти.</li>
            </ul>
          </div>
        </div>
      </div>
    ),
  }
  ,
  {
    key: 'location',
    icon: <MapPin size={24} />,
    title: '📍Локація',
    text: (
      <div className="w-full h-full space-y-6">
        {/* Використовуємо flex для розміщення карти та тексту поряд */}
        <motion.div
          className="flex flex-col lg:flex-row items-start justify-between"
          initial={{ opacity: 0, y: 20 }}  // Початкові значення
          animate={{ opacity: 1, y: 0 }}   // Кінцеві значення
          transition={{ duration: 3, ease: [0.16, 1, 0.3, 1] }}  // Тривалість та ефект
        >
          {/* Карта */}
          <motion.div
            className="map-container w-full lg:w-1/2 h-80 mb-6 lg:mb-0"
            initial={{ opacity: 0, x: -100 }}  // Початкові значення для карти
            animate={{ opacity: 1, x: 0 }}     // Кінцеві значення для карти
            transition={{ duration: 0.8, delay: 0.2 }}  // Тривалість для карти з затримкою
          >
            <MapComponent />
          </motion.div>
  
          {/* Текстова частина */}
          <motion.div
            className="lg:w-1/2 lg:pl-8 space-y-4 text-gray-800"
            initial={{ opacity: 0, x: 100 }}  // Початкові значення для тексту
            animate={{ opacity: 1, x: 0 }}     // Кінцеві значення для тексту
            transition={{ duration: 0.8, delay: 0.3 }}  // Тривалість для тексту з затримкою
          >
            <div className="font-bold text-2xl text-blue-700 mb-2">Адреса</div>
            <p className="text-lg text-gray-600">Львів, вулиця Перфецького</p>
            
            <div className="font-bold text-2xl text-blue-700 mb-2">Години роботи</div>
            <p className="text-lg text-gray-600">
              Пн-Сб: 08:00-19:00
              <br />
              Нд: 09:00-17:00
            </p>
  
            <div className="font-bold text-2xl text-blue-700 mb-2">Опис</div>
            <p className="text-lg text-gray-600">
              Магазин автозапчастин знаходиться у новобудові, що гарантує сучасні умови для комфортного шопінгу.
            </p>
            <p className="text-lg text-blue-600 font-semibold">
              Великий асортимент та зручний сервіс!
            </p>
          </motion.div>
        </motion.div>
      </div>
    )
  }
];

const InformationPage = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement>(null);
  const isManualChange = useRef(false);

  const currentTab = searchParams.get('tab');
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const tabFromUrl = currentTab || tabData[0].key;
    const newIndex = tabData.findIndex(tab => tab.key === tabFromUrl);
    if (newIndex >= 0 && newIndex !== activeIndex) {
      setActiveIndex(newIndex);
      scrollToTab(newIndex);
    }
  }, [currentTab]);

  const scrollToTab = useCallback((index: number) => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const tabWidth = container.clientWidth;
    isManualChange.current = true;
    container.scrollTo({ left: index * tabWidth, behavior: 'smooth' });

    setTimeout(() => { isManualChange.current = false; }, 500);
  }, []);

  const changeTab = useCallback((index: number) => {
    const newIndex = Math.max(0, Math.min(index, tabData.length - 1));
    setActiveIndex(newIndex);
    router.replace(`${pathname}?tab=${tabData[newIndex].key}`);
    scrollToTab(newIndex);
  }, [router, pathname, scrollToTab]);

  const handleScroll = () => {
    if (isManualChange.current || !scrollRef.current) return;
    const container = scrollRef.current;
    const tabWidth = container.clientWidth;
    const scrollPosition = container.scrollLeft;
    const newIndex = Math.floor(scrollPosition / tabWidth);
    if (newIndex !== activeIndex) {
      setActiveIndex(newIndex);
    }
  };

  useEffect(() => {
    const container = scrollRef.current;
    container?.addEventListener('scroll', handleScroll);
    return () => {
      container?.removeEventListener('scroll', handleScroll);
    };
  }, [activeIndex]);

  return (
    <div className="w-full  h-screen flex flex-col items-center relative">
      {/* Панель навігації */}
      <div className="flex space-x-4 bg-gradient-to-r mt-30 from-blue-100 to-indigo-200 shadow-lg w-full justify-center sticky top-0 z-10 py-4">
        {tabData.map((tab, index) => (
          <button
            key={tab.key}
            className={`flex items-center justify-center p-3  rounded-full transition-all ${
              activeIndex === index ? 'bg-blue-500 text-white shadow-md' : 'bg-transparent'
            }`}
            onClick={() => changeTab(index)}
          >
            {tab.icon}
          </button>
        ))}
      </div>

      {/* Контент для кожного блоку */}
      <div className="relative w-full h-[calc(100vh-120px)] overflow-hidden">
        <button 
          onClick={() => changeTab(activeIndex > 0 ? activeIndex - 1 : tabData.length - 1)}
          className="absolute left-4 top-1/2 transform -translate-y-1/2 z-20 p-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition"
        >
          <ChevronLeft size={28} />
        </button>

        <div 
          ref={scrollRef} 
          className="flex w-full h-full overflow-x-scroll snap-x snap-mandatory scroll-smooth no-scrollbar"
        >
          {tabData.map((tab, index) => (
            <div 
              key={tab.key} 
              className="w-full min-w-full flex-shrink-0 snap-always snap-center p-6"
            >
              <div className="w-full h-full flex flex-col items-center justify-start p-8 rounded-xl text-gray-800 bg-gradient-to-b from-white to-blue-100 shadow-lg">
                <h2 className="text-3xl font-bold mb-6 text-center">{tab.title}</h2>
                <div className="w-full">{tab.text}</div>
              </div>
            </div>
          ))}
        </div>

        <button 
          onClick={() => changeTab(activeIndex < tabData.length - 1 ? activeIndex + 1 : 0)}
          className="absolute right-4 top-1/2 transform -translate-y-1/2 z-20 p-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition"
        >
          <ChevronRight size={28} />
        </button>
      </div>
    </div>
  );
};

export default InformationPage;
