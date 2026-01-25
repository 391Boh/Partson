'use client';

import { useState, useEffect, useRef, memo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin,
  CreditCard,
  Truck,
  Info,
  Package,
  Clock,
  ShieldCheck,
  Wallet,
  RefreshCcw,
  Building2,
  Phone,
  Navigation,
} from 'lucide-react';

/* ================= MAP ================= */

const MapComponent = dynamic(() => import('app/components/Map'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-slate-500">
      Завантаження карти…
    </div>
  ),
});

/* ================= CARD ================= */

const Card = memo(
  ({
    title,
    icon: Icon,
    gradient,
    children,
  }: {
    title: string;
    icon: any;
    gradient: string;
    children: any;
  }) => (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className={`
        group relative overflow-hidden rounded-2xl
        border border-white/60
        bg-gradient-to-br ${gradient}
        p-4 shadow-sm backdrop-blur
        transition-all duration-300
        hover:-translate-y-0.5 hover:shadow-md
      `}
    >
      <div className="mb-2 flex items-center gap-2">
        <Icon size={18} className="text-slate-500 group-hover:text-sky-600 transition" />
        <h4 className="text-sm font-semibold text-slate-700">{title}</h4>
      </div>
      <div className="text-[15px] text-slate-700 leading-relaxed">
        {children}
      </div>
    </motion.div>
  )
);

/* ================= TABS CONTENT ================= */

const DeliveryTab = () => (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <Card title="Доставка по Україні" icon={Truck} gradient="from-sky-50 to-white">
      <ul className="space-y-2">
        <li className="flex gap-2"><Package size={16} /> Нова Пошта, Укрпошта, Meest</li>
        <li className="flex gap-2"><Clock size={16} /> Відправка 1–2 дні</li>
        <li className="flex gap-2"><Navigation size={16} /> Відділення або адресно</li>
      </ul>
    </Card>

    <Card title="Самовивіз та пакування" icon={Package} gradient="from-indigo-50 to-white">
      <ul className="space-y-2">
        <li className="flex gap-2"><Building2 size={16} /> Самовивіз за домовленістю</li>
        <li className="flex gap-2"><ShieldCheck size={16} /> Посилене пакування</li>
      </ul>
    </Card>

    <Card title="Вартість доставки" icon={Wallet} gradient="from-teal-50 to-white">
      За тарифами перевізника.
    </Card>

    <Card title="Перевірка товару" icon={ShieldCheck} gradient="from-emerald-50 to-white">
      Перевіряйте посилку при отриманні.
    </Card>
  </div>
);

const PaymentTab = () => (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <Card title="Онлайн-оплата" icon={CreditCard} gradient="from-green-50 to-white">
      Visa / MasterCard через захищений шлюз.
    </Card>

    <Card title="Післяплата" icon={Wallet} gradient="from-amber-50 to-white">
      Оплата у відділенні або курʼєру.
    </Card>

    <Card title="Безготівковий рахунок" icon={Building2} gradient="from-cyan-50 to-white">
      Для СТО та бізнесу.
    </Card>

    <Card title="Гарантія та повернення" icon={RefreshCcw} gradient="from-rose-50 to-white">
      За погодженням з менеджером.
    </Card>
  </div>
);

const AboutTab = () => (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <Card title="Про PartsON" icon={Info} gradient="from-purple-50 to-white">
      Професійний підбір автозапчастин.
    </Card>

    <Card title="Наш підхід" icon={ShieldCheck} gradient="from-blue-50 to-white">
      Чесні консультації та строки.
    </Card>

    <Card title="Підбір по VIN" icon={Package} gradient="from-orange-50 to-white">
      Надішліть VIN — підберемо швидко.
    </Card>

    <Card title="Підтримка" icon={Phone} gradient="from-slate-50 to-white">
      Онлайн-чат у робочий час.
    </Card>
  </div>
);

const LocationTab = ({ active }: { active: boolean }) => (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <div className="flex flex-col gap-4">
      <Card title="Локація" icon={MapPin} gradient="from-slate-50 to-white">
        Адреса — у менеджера.
      </Card>
      <Card title="Графік" icon={Clock} gradient="from-sky-50 to-white">
        Будні + частина суботи.
      </Card>
      <Card title="Контакти" icon={Phone} gradient="from-emerald-50 to-white">
        Звʼяжіться з нами у чаті.
      </Card>
    </div>

    <div className="h-[260px] md:h-[320px] lg:h-[360px] rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      {active && <MapComponent />}
    </div>
  </div>
);

/* ================= PAGE ================= */

const tabs = [
  { key: 'delivery', title: 'Доставка', icon: Truck, content: <DeliveryTab /> },
  { key: 'payment', title: 'Оплата', icon: CreditCard, content: <PaymentTab /> },
  { key: 'about', title: 'Про нас', icon: Info, content: <AboutTab /> },
  { key: 'location', title: 'Локація', icon: MapPin, content: <LocationTab active /> },
];

export default function InformationPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeIdx, setActiveIdx] = useState(0);
  const startX = useRef(0);
  const minSwipe = 70;

  useEffect(() => {
    if (!tabParam) return;
    const idx = tabs.findIndex((t) => t.key === tabParam);
    if (idx < 0) return;
    setActiveIdx(idx);
  }, [tabParam]);

  const handleTabChange = useCallback(
    (idx: number) => {
      const next = tabs[idx]?.key;
      if (!next) return;

      setActiveIdx(idx);

      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set('tab', next);
      router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  return (
    <div
      className="
        flex h-[calc(100vh-80px)] flex-col overflow-hidden
        bg-[radial-gradient(800px_400px_at_10%_-10%,#e0f2fe,transparent),
            radial-gradient(600px_300px_at_90%_10%,#ede9fe,transparent),
            linear-gradient(to_bottom,#f8fafc,#ffffff)]
      "
    >
   <nav
  className="
    relative
    px-4 py-4
    backdrop-blur-xl
    bg-[linear-gradient(180deg,rgba(255,255,255,0.85),rgba(255,255,255,0.65))]
    shadow-[0_8px_24px_rgba(15,23,42,0.04)]
  "
>
  {/* subtle background glow */}
  <div
    className="
      pointer-events-none absolute inset-0
      bg-[radial-gradient(600px_200px_at_50%_-50%,rgba(56,189,248,0.15),transparent)]
    "
  />

  <div className="relative grid grid-cols-2 md:grid-cols-4 gap-3 max-w-6xl mx-auto">
    {tabs.map((t, i) => {
      const active = i === activeIdx;
      const Icon = t.icon;

      return (
        <button
          key={t.key}
          onClick={() => handleTabChange(i)}
          className={`
            group relative rounded-2xl px-4 py-3 text-xs font-medium
            transition-all duration-300
            ${
              active
                ? `
                  bg-gradient-to-br from-sky-400 to-indigo-400
                  text-white shadow-md
                `
                : `
                  bg-white/70 text-slate-600
                  hover:bg-white hover:text-sky-600
                `
            }
          `}
        >
          {/* active glow */}
          {active && (
            <span className="absolute inset-0 -z-10 rounded-2xl bg-sky-400/25 blur-xl" />
          )}

          <div className="flex items-center justify-center gap-2">
            <Icon
              size={16}
              className="transition-transform duration-300 group-hover:scale-110"
            />
            <span className="tracking-wide">{t.title}</span>
          </div>
        </button>
      );
    })}
  </div>
</nav>


      {/* CONTENT + SWIPE */}
      <main
        className="flex-1 p-4 overflow-hidden"
        onTouchStart={(e) => (startX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          const diff = startX.current - e.changedTouches[0].clientX;
          if (diff > minSwipe) handleTabChange((activeIdx + 1) % tabs.length);
          if (diff < -minSwipe) handleTabChange((activeIdx - 1 + tabs.length) % tabs.length);
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={tabs[activeIdx].key}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="h-full"
          >
            {tabs[activeIdx].content}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
