'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { MapPin, CreditCard, Truck, Info, ChevronLeft, ChevronRight } from 'lucide-react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';

// Динамічний імпорт карти з вимкненим SSR
const MapComponent = dynamic(() => import('app/components/Map'), {
  ssr: false,
  loading: () => (
  <div className="h-[400px] flex items-center justify-center">
  <div className="loader"></div>
</div>

  ),
});

const tabData = [
  {
    key: 'delivery',
    icon: <Truck size={24} />, title: '📦 Доставка',
    text: (
      <div className="text-center">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 text-left">
          <div className="p-6 border border-blue-300 bg-blue-50 rounded-xl shadow-lg hover:scale-105 hover:shadow-xl hover:bg-blue-100 transition">
            <h4 className="text-2xl text-center font-semibold text-indigo-700 mb-4">🚚 Доставка по Україні</h4>
            <p className="mb-4">Ми доставляємо товари по всій Україні зручними для вас службами:</p>
            <ul className="space-y-3 text-sm">
              <li><strong className="text-blue-600">🚛 Нова Пошта:</strong> доставка у відділення або кур'єром.</li>
              <li><strong className="text-blue-600">📦 Укрпошта:</strong> бюджетна доставка у відділення або поштомат.</li>
              <li><strong className="text-blue-600">🔵 Meest Express:</strong> швидка адресна доставка.</li>
              <li><strong className="text-blue-600">📬 Justin:</strong> отримання у поштоматах.</li>
            </ul>
            <p className="mt-5 text-sm"><strong>💰 Вартість:</strong> згідно з тарифами перевізника.</p>
            <p className="text-sm"><strong>⏳ Термін доставки:</strong> зазвичай 1-3 дні.</p>
          </div>
          <div className="p-6 border border-indigo-300 bg-indigo-50 rounded-xl shadow-lg hover:scale-105 hover:shadow-xl hover:bg-indigo-100 transition">
            <h4 className="text-2xl text-center font-semibold text-indigo-700 mb-4">🚴 Доставка у Львові</h4>
            <p className="mb-4">Для мешканців Львова доступні такі варіанти:</p>
            <ul className="space-y-3 text-sm">
              <li><strong className="text-blue-600">🚴 Кур'єрська доставка:</strong> від 50 грн, час – 2-4 години.</li>
              <li><strong className="text-blue-600">🏪 Самовивіз:</strong> вул. Перфецького (Пн-Сб 08:00-19:00, Нд 09:00-17:00).</li>
              <li><strong className="text-blue-600">🛵 Експрес-доставка:</strong> за 1-2 години (за додаткову плату).</li>
            </ul>
            <p className="mt-5 text-sm">📞 <strong>+38 (063) 421-18-51</strong></p>
          </div>
        </div>
      </div>
    ),
  },
  {
    key: 'payment',
    icon: <CreditCard size={24} />, title: '💳 Оплата',
    text: (
      <div className="text-center">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 text-left">
          <div className="p-6 border border-green-300 bg-green-50 rounded-xl shadow-lg hover:scale-105 hover:shadow-xl hover:bg-green-100 transition">
            <h4 className="text-2xl font-semibold text-green-700 mb-4">💻 Оплата на сайті</h4>
            <p className="mb-4">Ви можете швидко та безпечно оплатити своє замовлення безпосередньо на сайті за допомогою платіжної картки.</p>
            <ul className="space-y-3 text-sm">
              <li><strong className="text-green-600">🔒 Безпека:</strong> Ваші дані захищені на всіх етапах транзакції за допомогою сучасних технологій шифрування.</li>
              <li><strong className="text-green-600">💳 Доступні методи оплати:</strong> Visa, MasterCard, Приват24.</li>
              <li><strong className="text-green-600">⏱️ Швидкість:</strong> Оплата займає лише кілька хвилин, і ваше замовлення одразу ж обробляється.</li>
            </ul>
            <p className="mt-5 text-sm"><strong>📌 Вартість:</strong> без додаткових комісій.</p>
          </div>
          <div className="p-6 border border-orange-300 bg-orange-50 rounded-xl shadow-lg hover:scale-105 hover:shadow-xl hover:bg-orange-100 transition">
            <h4 className="text-2xl font-semibold text-orange-700 mb-4">📦 Оплата при отриманні</h4>
            <p className="mb-4">Якщо ви обрали доставку на відділення пошти або самовивіз, ви можете оплатити замовлення при отриманні:</p>
            <ul className="space-y-3 text-sm">
              <li><strong className="text-orange-600">💵 Готівка:</strong> Сплатіть замовлення безпосередньо при отриманні на відділенні або при самовивозі.</li>
              <li><strong className="text-orange-600">💳 Карта:</strong> Ви також можете розплатитись карткою прямо на відділенні, використовуючи POS-термінал.</li>
              <li><strong className="text-orange-600">🕰️ Час оплати:</strong> Оплата здійснюється безпосередньо під час отримання замовлення або під час самовивозу.</li>
            </ul>
            <p className="mt-5 text-sm"><strong>💰 Комісія:</strong> може бути додатково стягнена за оплату при отриманні.</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    key: 'about',
    icon: <Info size={24} />, title: 'Про нас',
    text: (
      <div className="text-center">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 text-left">
          <div className="p-6 border border-purple-300 bg-purple-50 rounded-xl shadow-lg hover:scale-105 hover:shadow-xl hover:bg-purple-100 transition">
            <h4 className="text-2xl font-semibold text-purple-700 mb-4">🌟 Наша місія</h4>
            <p className="mb-4">Ми прагнемо надавати нашим клієнтам тільки найкращі товари та послуги, створюючи при цьому безпечну та зручну покупку на кожному етапі.</p>
            <p className="mb-4">Наша мета — це не просто продаж, а забезпечення вашого задоволення від кожної покупки, щоб ви поверталися до нас знову і знову.</p>
            <ul className="space-y-3 text-sm">
              <li><strong className="text-purple-600">🌍 Стабільність:</strong> Наша компанія працює на ринку вже понад 5 років, з успішними проектами та відгуками клієнтів.</li>
              <li><strong className="text-purple-600">💼 Професіоналізм:</strong> Наші співробітники — це команда фахівців, які завжди готові допомогти вам на кожному етапі покупки.</li>
              <li><strong className="text-purple-600">💬 Взаємодія:</strong> Ми активно взаємодіємо з клієнтами, отримуючи зворотний зв'язок, щоб удосконалювати наші послуги та товари.</li>
            </ul>
          </div>
          <div className="p-6 border border-blue-300 bg-blue-50 rounded-xl shadow-lg hover:scale-105 hover:shadow-xl hover:bg-blue-100 transition">
            <h4 className="text-2xl font-semibold text-blue-700 mb-4">👨‍👩‍👧‍👦 Наша команда</h4>
            <p className="mb-4">Ми — це команда людей, які люблять свою роботу і кожен день прагнуть зробити ваш досвід покупок неперевершеним.</p>
            <p className="mb-4">Наші співробітники — це висококваліфіковані спеціалісти, готові дати відповідь на будь-яке ваше питання та допомогти в будь-якій ситуації.</p>
            <ul className="space-y-3 text-sm">
              <li><strong className="text-blue-600">👨‍💻 Професіонали:</strong> Кожен член нашої команди має багаторічний досвід роботи у сфері продажів та клієнтського обслуговування.</li>
              <li><strong className="text-blue-600">📈 Розвиток:</strong> Ми постійно розвиваємось, впроваджуючи нові технології та покращуючи процеси роботи для вашої зручності.</li>
              <li><strong className="text-blue-600">💡 Ідеї:</strong> Ми відкриті для нових ідей та інновацій, і завжди шукаємо способи покращити наш сервіс і продукти.</li>
            </ul>
          </div>
        </div>
      </div>
    ),
  },
  {
    key: 'location',
    icon: <MapPin size={24} />,
    title: '📍 Локація',
    text: (
      <motion.div
        className="space-y-4 md:space-y-6 px-4 md:px-0"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 3, type: 'spring', stiffness: 50 }}
      >
        <p className="text-center text-base md:text-lg">
          Ми розташовані у місті <strong>Львів</strong>, на вулиці <strong>Перфецького</strong>, в сучасній новобудові.
        </p>
        <p className="text-center text-base md:text-lg">
          У нашому магазині на вас чекає <strong>великий асортимент товарів</strong> 
        </p>
       
        <div className="w-full h-[4 00px] md:h-[400px]">
          <MapComponent />
        </div>
      </motion.div>
    ),
  }
  
];

export default function InformationPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement>(null);
  const isManual = useRef(false);
  const initIdx = tabData.findIndex(t => t.key === searchParams.get('tab'));
  const [activeIdx, setActiveIdx] = useState(initIdx > -1 ? initIdx : 0);

  const clamp = (idx: number) => Math.max(0, Math.min(idx, tabData.length - 1));

  useEffect(() => {
    router.replace(`${pathname}?tab=${tabData[activeIdx].key}`);
    const container = scrollRef.current;
    if (container) {
      isManual.current = true;
      const left = clamp(activeIdx) * container.clientWidth;
      container.scrollTo({ left, behavior: 'smooth' });
      setTimeout(() => { isManual.current = false; }, 500);
    }
  }, [activeIdx]);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const newIdx = tabData.findIndex(t => t.key === tabParam);
    if (newIdx > -1 && newIdx !== activeIdx) {
      setActiveIdx(newIdx);
    }
  }, [searchParams]);

  const onScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container || isManual.current) return;
    const idx = Math.round(container.scrollLeft / container.clientWidth);
    setActiveIdx(clamp(idx));
  }, [activeIdx]);

  return (
    <div className="relative h-full overflow-hidden lg:overflow-y-hidden">
      {/* Фіксоване меню навігації */}
      <nav className="fixed bottom-0 left-0 w-full bg-gradient-to-r from-blue-100 to-indigo-200 shadow-lg z-10 py-5 pr-5">
  <div className="flex justify-center space-x-4">
    {tabData.map((tab, index) => (
      <button
        key={tab.key}
        onClick={() => setActiveIdx(index)}
        className={`p-3 rounded-full transition-transform focus:outline-none aria-selected:ring-2 aria-selected:ring-blue-600 aria-selected:ring-offset-2 ${
          index === activeIdx ? 'bg-blue-500 text-white scale-110' : 'text-gray-500 hover:bg-blue-100'
        }`}
        aria-selected={index === activeIdx}
        aria-label={`Перейти до вкладки ${tab.title}`}
      >
        {tab.icon}
      </button>
    ))}
  </div>
</nav>


      {/* Контейнер з контентом */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="pt-5 flex w-full h-full overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar"
      >
        {tabData.map(tab => (
          <div key={tab.key} className="w-full flex-shrink-0 snap-center p-4 pb-16 md:p-6 md:pb-24 overflow-y-auto h-full">
            <h2 className="text-3xl font-bold text-center mb-6">{tab.title}</h2>
            <div className="px-4 md:px-8">{tab.text}</div>
          </div>
        ))}
      </div>

      {/* Кнопки навігації */}
      <button
        onClick={() => setActiveIdx(prev => clamp(prev - 1))}
        className="fixed left-4 top-2/3 transform -translate-y-7/8 bg-blue-600 text-white p-3 rounded-full shadow-lg z-10"
        aria-label="Попередня вкладка"
      >
        <ChevronLeft size={20} />
      </button>
      <button
        onClick={() => setActiveIdx(prev => clamp(prev + 1))}
        className="fixed right-4 top-2/3 transform -translate-y-7/8 bg-blue-600 text-white p-3 rounded-full shadow-lg z-10"
        aria-label="Наступна вкладка"
      >
        <ChevronRight size={20} />
      </button>
    </div>
  );
}