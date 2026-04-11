'use client';

import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Building2,
  Clock,
  CreditCard,
  Info,
  MapPin,
  Navigation,
  Package,
  Phone,
  RefreshCcw,
  ShieldCheck,
  Truck,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import {
  getInformationPath,
  getInformationSection,
  informationSections,
  type InformationSectionKey,
} from './section-config';

type InfoCardProps = {
  title: string;
  icon: LucideIcon;
  tone?: string;
  children: ReactNode;
};

type InformationPageClientProps = {
  initialSectionKey: InformationSectionKey;
};

const infoCardBase =
  'group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br p-4 shadow-[0_12px_30px_rgba(15,23,42,0.12)] backdrop-blur-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_35px_rgba(56,189,248,0.22)]';
const listItemClass = 'flex items-start gap-2.5 text-sm text-slate-700';

const iconMap: Record<InformationSectionKey, LucideIcon> = {
  delivery: Truck,
  payment: CreditCard,
  about: Info,
  location: MapPin,
};

const tabs = informationSections.map((section) => ({
  ...section,
  icon: iconMap[section.key],
}));

const InfoCard = memo(function InfoCard({
  title,
  icon: Icon,
  tone = 'from-sky-50/95 via-white to-slate-50',
  children,
}: InfoCardProps) {
  return (
    <article className={`${infoCardBase} ${tone}`}>
      <div className="pointer-events-none absolute inset-0 bg-[image:radial-gradient(circle_at_top_right,rgba(56,189,248,0.16),transparent_50%)]" />
      <div className="relative">
        <div className="mb-3 flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-sky-100 bg-sky-50 text-sky-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
            <Icon size={16} />
          </span>
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        </div>
        <div className="text-[15px] leading-relaxed text-slate-700">{children}</div>
      </div>
    </article>
  );
});

const DeliveryTab = () => (
  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
    <InfoCard title="Доставка по Україні" icon={Truck}>
      <ul className="space-y-2.5">
        <li className={listItemClass}>
          <Package size={16} className="mt-0.5 shrink-0 text-sky-700" />
          <span><strong>Нова Пошта</strong> — найшвидше і найзручніше, відділення у всіх великих містах.</span>
        </li>
        <li className={listItemClass}>
          <Package size={16} className="mt-0.5 shrink-0 text-sky-700" />
          <span><strong>Укрпошта</strong> — стандартна доставка до відділень.</span>
        </li>
        <li className={listItemClass}>
          <Package size={16} className="mt-0.5 shrink-0 text-sky-700" />
          <span><strong>Meest</strong> — доставка з можливістю адресної доставки.</span>
        </li>
        <li className={listItemClass}>
          <Clock size={16} className="mt-0.5 shrink-0 text-sky-700" />
          <span>Відправка <strong>1-2 дні</strong> після оплати.</span>
        </li>
        <li className={listItemClass}>
          <Navigation size={16} className="mt-0.5 shrink-0 text-sky-700" />
          <span>Доставка у відділення або <strong>адресно до дому</strong>.</span>
        </li>
      </ul>
    </InfoCard>

    <InfoCard
      title="Самовивіз та пакування"
      icon={Package}
      tone="from-cyan-50/95 via-white to-emerald-50/70"
    >
      <ul className="space-y-2.5">
        <li className={listItemClass}>
          <Building2 size={16} className="mt-0.5 shrink-0 text-cyan-700" />
          <span><strong>Самовивіз</strong> за попередньою домовленістю у нашому офісі у <strong>Львові</strong>.</span>
        </li>
        <li className={listItemClass}>
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-cyan-700" />
          <span><strong>Посилене пакування</strong> для хрупких і дорогих позицій.</span>
        </li>
        <li className={listItemClass}>
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-cyan-700" />
          <span><strong>Полімерна плівка</strong> + картонна коробка запобігають пошкодженням.</span>
        </li>
      </ul>
    </InfoCard>

    <InfoCard
      title="Вартість доставки"
      icon={Wallet}
      tone="from-teal-50/95 via-white to-cyan-50/80"
    >
      <div className="space-y-2.5">
        <p>Вартість розраховується за <strong>тарифами перевізника</strong>.</p>
        <p>Залежить від:</p>
        <ul className="space-y-1 ml-4">
          <li>• Ваги посилки</li>
          <li>• Розмірів упаковки</li>
          <li>• Регіону доставки</li>
          <li>• Способу доставки (відділення чи адреса)</li>
        </ul>
      </div>
    </InfoCard>

    <InfoCard
      title="Перевірка товару"
      icon={ShieldCheck}
      tone="from-emerald-50/95 via-white to-lime-50/70"
    >
      <ul className="space-y-2.5">
        <li className={listItemClass}>
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-700" />
          <span><strong>Перевіряйте комплектність</strong> при отриманні посилки.</span>
        </li>
        <li className={listItemClass}>
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-700" />
          <span><strong>Звіряйте артикули</strong> з замовленням.</span>
        </li>
        <li className={listItemClass}>
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-700" />
          <span><strong>Звіртаємось з менеджером</strong> щодо повернення протягом 24 годин.</span>
        </li>
      </ul>
    </InfoCard>
  </div>
);

const PaymentTab = () => (
  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
    <InfoCard
      title="Онлайн-оплата"
      icon={CreditCard}
      tone="from-green-50/95 via-white to-emerald-50/70"
    >
      <div className="space-y-2.5">
        <p><strong>Безпечна оплата</strong> через захищений платіжний шлюз.</p>
        <p>Прийміємо:</p>
        <ul className="space-y-1 ml-4">
          <li>• <strong>Visa</strong> та <strong>MasterCard</strong></li>
          <li>• <strong>Google Pay</strong> та <strong>Apple Pay</strong></li>
          <li>• <strong>ПриватБанк</strong> переводи</li>
        </ul>
        <p className="text-[13px] text-emerald-600">Миттєво підтверджується система, інформація передається в персоналізований чат.</p>
      </div>
    </InfoCard>

    <InfoCard
      title="Післяплата"
      icon={Wallet}
      tone="from-amber-50/95 via-white to-orange-50/70"
    >
      <div className="space-y-2.5">
        <p><strong>Зручна опція для постійних клієнтів</strong>.</p>
        <p>Оплата:</p>
        <ul className="space-y-1 ml-4">
          <li>• У <strong>відділенні перевізника</strong> при отриманні</li>
          <li>• <strong>Курʼєру</strong> при доставці на адресу</li>
          <li>• <strong>Готівкою</strong> чи карткою</li>
        </ul>
        <p className="text-[13px] text-amber-600">Застосовується тільки для перевірених клієнтів.</p>
      </div>
    </InfoCard>

    <InfoCard
      title="Безготівковий рахунок"
      icon={Building2}
      tone="from-cyan-50/95 via-white to-sky-50/80"
    >
      <div className="space-y-2.5">
        <p><strong>Для СТО, ФОП та юридичних осіб</strong>.</p>
        <p>Ми підготуємо:</p>
        <ul className="space-y-1 ml-4">
          <li>• <strong>Рахунок</strong> на реквізити компанії</li>
          <li>• <strong>Акт виконаних робіт</strong></li>
          <li>• <strong>Накладну</strong> за необхідністю</li>
        </ul>
        <p className="text-[13px] text-cyan-600">Напишіть у чат, і менеджер все уточнить.</p>
      </div>
    </InfoCard>

    <InfoCard
      title="Гарантія та повернення"
      icon={RefreshCcw}
      tone="from-rose-50/95 via-white to-orange-50/60"
    >
      <div className="space-y-2.5">
        <p><strong>Гарантія залежить від товарної групи</strong>:</p>
        <ul className="space-y-2 ml-4 text-[13px]">
          <li>🔧 <strong>Електроніка</strong> — 12-24 місяці (від виробника)</li>
          <li>⚙️ <strong>Механічні деталі</strong> — 6-12 місяців</li>
          <li>🛢️ <strong>Мастила, рідини</strong> — гарантія якості</li>
        </ul>
        <p className="text-[13px] text-rose-600 mt-2">Повернення — уточніть з менеджером перед замовленням.</p>
      </div>
    </InfoCard>
  </div>
);

const AboutTab = () => (
  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
    <InfoCard title="Про PartsON" icon={Info}>
      <div className="space-y-2.5">
        <p>Спеціалізований каталог <strong>оригінальних та якісних аналогів</strong> автозапчастин.</p>
        <p>Ми фокусуємося на:</p>
        <ul className="space-y-1 ml-4 text-[13px]">
          <li>✓ <strong>100% сумісність</strong> деталей</li>
          <li>✓ <strong>Наявність у каталозі</strong> реальних товарів</li>
          <li>✓ <strong>Честні ціни</strong> без переплат</li>
          <li>✓ <strong>Швидкий підбір</strong> та доставка</li>
        </ul>
      </div>
    </InfoCard>

    <InfoCard
      title="Наш підхід"
      icon={ShieldCheck}
      tone="from-blue-50/95 via-white to-cyan-50/70"
    >
      <div className="space-y-2.5">
        <p><strong>Прозорість на кожному етапі</strong>:</p>
        <ul className="space-y-1 ml-4 text-[13px]">
          <li>📲 <strong>Швидка консультація</strong> — відповідь за 15 хв</li>
          <li>✔️ <strong>Перевірка сумісності</strong> перед замовленням</li>
          <li>📦 <strong>Коректна упаковка</strong> для безпеки</li>
          <li>🔔 <strong>Сповіщення на кожному етапі</strong> доставки</li>
        </ul>
      </div>
    </InfoCard>

    <InfoCard
      title="Підбір по VIN"
      icon={Package}
      tone="from-orange-50/95 via-white to-amber-50/70"
    >
      <div className="space-y-2.5">
        <p><strong>Надішліть VIN — отримайте точний підбір</strong></p>
        <p>Нам потрібно:</p>
        <ul className="space-y-1 ml-4 text-[13px]">
          <li>• <strong>VIN-код</strong> вашого авто</li>
          <li>• <strong>Назва деталі</strong> яка потрібна</li>
          <li>• <strong>Гос. номер</strong> (опціонально)</li>
        </ul>
        <p className="text-[13px] text-orange-600 mt-2">Результат — точні позиції <strong>без помилок</strong>.</p>
      </div>
    </InfoCard>

    <InfoCard
      title="Підтримка 24/7"
      icon={Phone}
      tone="from-slate-100/95 via-white to-sky-50/70"
    >
      <div className="space-y-2.5">
        <p><strong>Оперативний звʼязок у робочий час</strong>:</p>
        <ul className="space-y-1 ml-4 text-[13px]">
          <li>💬 <strong>Чат</strong> — найшвидше (Пн-Пт 09:00-18:00)</li>
          <li>📞 <strong>Телефон</strong> — для значних замовлень</li>
          <li>✉️ <strong>Email</strong> — для документів та рахунків</li>
        </ul>
        <p className="text-[13px] text-slate-600 mt-2">Менеджер допоможе знайти рідкісні позиції.</p>
      </div>
    </InfoCard>
  </div>
);

const LocationTab = ({ active }: { active: boolean }) => (
  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
    <div className="grid gap-4">
      <InfoCard title="Наш офіс" icon={MapPin}>
        <div className="space-y-2">
          <p><strong>Львів, вул. Перфецького, 8</strong></p>
          <p className="text-[13px] text-slate-600">Офіс розташований у центральній частині міста, доступна паркування.</p>
          <p className="text-[13px] text-slate-600">Самовивіз товару доступний за попередньою домовленістю через чат.</p>
        </div>
      </InfoCard>
      <InfoCard title="Графік роботи" icon={Clock} tone="from-sky-50/95 via-white to-cyan-50/70">
        <div className="space-y-2">
          <p><strong>Пн-Пт</strong>: 09:00 - 18:00</p>
          <p><strong>Субота</strong>: за узгодженням</p>
          <p><strong>Неділя</strong>: вихідний</p>
          <p className="text-[13px] text-sky-600 mt-2">Рекомендуємо писати у ночі — менеджер відповідь з ранку.</p>
        </div>
      </InfoCard>
      <InfoCard title="Зв'язок з нами" icon={Phone} tone="from-emerald-50/95 via-white to-cyan-50/70">
        <div className="space-y-2">
          <p><strong>Найшвидше</strong> — напишіть у чат на сайті.</p>
          <p className="text-[13px] text-slate-600">Менеджер проглядає повідомлення першим ділом та відповідає оперативно.</p>
          <p className="text-[13px] text-slate-600">Ми готові допомогти підібрати деталь, відповісти на питання про доставку і оплату.</p>
        </div>
      </InfoCard>
    </div>

    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-100 to-sky-50 shadow-[0_12px_28px_rgba(15,23,42,0.14)]">
      <div className="flex h-[280px] flex-col items-center justify-center gap-4 px-5 text-center sm:h-[340px] lg:h-full lg:min-h-[438px]">
        {!active ? null : (
          <>
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-sky-100 bg-white text-sky-700 shadow-[0_10px_24px_rgba(56,189,248,0.16)]">
              <MapPin size={24} />
            </div>
            <div className="space-y-2">
              <p className="text-lg font-semibold text-slate-900">Відкрити маршрут у Google Maps</p>
              <p className="text-sm leading-6 text-slate-600">
                Швидкий перехід до навігації без важкого картографічного bundle у dev-режимі.
              </p>
            </div>
            <a
              href="https://maps.google.com/?q=Львів,+вул.+Перфецького,+8"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-sky-800 transition hover:border-sky-300 hover:bg-sky-50"
            >
              <Navigation size={16} />
              Відкрити карту
            </a>
          </>
        )}
      </div>
    </div>
  </div>
);

const renderTabContent = (key: InformationSectionKey) => {
  switch (key) {
    case 'delivery':
      return <DeliveryTab />;
    case 'payment':
      return <PaymentTab />;
    case 'about':
      return <AboutTab />;
    case 'location':
      return <LocationTab active />;
    default:
      return <DeliveryTab />;
  }
};

export default function InformationPageClient({
  initialSectionKey,
}: InformationPageClientProps) {
  const router = useRouter();
  const pathname = usePathname() || "/inform";
  const [activeIdx, setActiveIdx] = useState(() =>
    Math.max(
      tabs.findIndex((tab) => tab.key === initialSectionKey),
      0
    )
  );
  const startTouch = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const pathKey = pathname.split('/').filter(Boolean).at(-1) || '';
    const resolvedSection =
      getInformationSection(pathKey) || getInformationSection(initialSectionKey);
    if (!resolvedSection) return;

    const idx = tabs.findIndex((tab) => tab.key === resolvedSection.key);
    if (idx >= 0) setActiveIdx(idx);
  }, [initialSectionKey, pathname]);

  const handleTabChange = useCallback(
    (idx: number) => {
      const next = tabs[idx]?.key;
      if (!next) return;
      setActiveIdx(idx);
      router.replace(getInformationPath(next), { scroll: false });
    },
    [router]
  );

  const activeTab = tabs[activeIdx];

  return (
    <div
      className="relative min-h-[calc(100vh-4rem)] overflow-hidden bg-sky-50 text-slate-100 select-none"
      onCopy={(event) => event.preventDefault()}
      onCut={(event) => event.preventDefault()}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[image:radial-gradient(circle_at_12%_10%,rgba(56,189,248,0.24),transparent_42%),radial-gradient(circle_at_88%_10%,rgba(125,211,252,0.22),transparent_38%),linear-gradient(180deg,rgba(240,249,255,0.96)_0%,rgba(226,232,240,0.9)_45%,rgba(224,242,254,0.92)_100%)]" />
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(148,163,184,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.18)_1px,transparent_1px)] [background-size:38px_38px]" />
      </div>

      <section className="page-shell-inline relative grid gap-4 py-4 sm:py-6">
        <nav className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          <Link href="/" className="transition hover:text-slate-200">
            Головна
          </Link>
          <span>/</span>
          <span className="text-slate-200">Інформація</span>
          <span>/</span>
          <span className="text-sky-200">{activeTab.title}</span>
        </nav>

        <nav className="rounded-3xl border border-white/10 bg-slate-900/60 p-2 shadow-[0_12px_34px_rgba(2,6,23,0.32)] backdrop-blur-xl sm:p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            {tabs.map((tab, idx) => {
              const isActive = idx === activeIdx;
              const Icon = tab.icon;

              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => handleTabChange(idx)}
                  className={`relative rounded-2xl border px-3 py-3 text-left transition duration-300 ${
                    isActive
                      ? 'border-sky-200/70 bg-gradient-to-br from-sky-300 to-cyan-400 text-slate-950 shadow-[0_10px_24px_rgba(56,189,248,0.45)]'
                      : 'border-white/10 bg-white/10 text-slate-200 hover:border-sky-200/30 hover:bg-white/15'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <div className="flex items-center gap-2">
                    <Icon size={16} className={isActive ? 'text-slate-900' : 'text-sky-200'} />
                    <span className="text-sm font-semibold">{tab.title}</span>
                  </div>
                  <p className={`mt-1 text-[11px] ${isActive ? 'text-slate-800/80' : 'text-slate-300/80'}`}>
                    {tab.subtitle}
                  </p>
                </button>
              );
            })}
          </div>
        </nav>

        <main
          className="rounded-3xl border border-white/10 bg-slate-900/55 p-3 shadow-[0_18px_46px_rgba(2,6,23,0.34)] backdrop-blur-xl sm:p-4 lg:p-5"
          onTouchStart={(event) => {
            startTouch.current = {
              x: event.touches[0].clientX,
              y: event.touches[0].clientY,
            };
          }}
          onTouchEnd={(event) => {
            const diffX = startTouch.current.x - event.changedTouches[0].clientX;
            const diffY = startTouch.current.y - event.changedTouches[0].clientY;
            if (Math.abs(diffX) < 70 || Math.abs(diffY) > Math.abs(diffX)) return;
            if (diffX > 0) handleTabChange((activeIdx + 1) % tabs.length);
            if (diffX < 0) handleTabChange((activeIdx - 1 + tabs.length) % tabs.length);
          }}
        >
          <div key={activeTab.key}>
            {renderTabContent(activeTab.key)}
          </div>
        </main>
      </section>
    </div>
  );
}
