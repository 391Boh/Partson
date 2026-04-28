import { memo, type ReactNode } from 'react';
import Link from 'next/link';
import {
  Award,
  Building2,
  Car,
  CheckCircle,
  Clock,
  CreditCard,
  Info,
  MapPin,
  MessageCircle,
  Navigation,
  Package,
  Phone,
  RefreshCcw,
  ShieldCheck,
  Star,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import {
  getInformationPath,
  informationSections,
  type InformationSectionKey,
} from './section-config';

// ─── Константи контактів ───────────────────────────────────────────────────
const PHONE_RAW = '+380634211851';
const PHONE_DISPLAY = '+38 (063) 421-18-51';
const ADDRESS = 'Львів, вул. Перфецького, 8';
const MAPS_URL = 'https://www.google.com/maps?cid=11517394092669341405';
const MAPS_EMBED_URL = 'https://www.google.com/maps?cid=11517394092669341405&output=embed';
const VIBER_URL = 'https://connect.viber.com/business/36969536-f36d-11f0-84df-f601f1189001';

// ─── Типи ──────────────────────────────────────────────────────────────────
type InfoCardProps = {
  title: string;
  icon: LucideIcon;
  accent?: 'sky' | 'emerald' | 'amber' | 'violet' | 'cyan' | 'rose' | 'slate';
  featured?: boolean;
  children: ReactNode;
};

type InformationPageClientProps = {
  initialSectionKey: InformationSectionKey;
};

// ─── Іконки вкладок ────────────────────────────────────────────────────────
const iconMap: Record<InformationSectionKey, LucideIcon> = {
  delivery: Truck,
  payment: CreditCard,
  about: Info,
  location: MapPin,
  privacy: ShieldCheck,
};

const tabs = informationSections.map((s) => ({ ...s, icon: iconMap[s.key] }));

// ─── Стилі акцентів ────────────────────────────────────────────────────────
const ACCENT = {
  sky:     { wrap: 'border-sky-200     bg-sky-50      text-sky-700',     glow: 'group-hover:from-sky-50/80     group-hover:to-cyan-50/60',   border: 'border-sky-200/60',   shadow: 'shadow-[0_4px_18px_rgba(14,165,233,0.14)]',   ring: 'ring-sky-200/40'     },
  emerald: { wrap: 'border-emerald-200 bg-emerald-50  text-emerald-700', glow: 'group-hover:from-emerald-50/80 group-hover:to-teal-50/60',   border: 'border-emerald-200/60', shadow: 'shadow-[0_4px_18px_rgba(16,185,129,0.14)]',   ring: 'ring-emerald-200/40' },
  amber:   { wrap: 'border-amber-200   bg-amber-50    text-amber-700',   glow: 'group-hover:from-amber-50/80   group-hover:to-orange-50/60', border: 'border-amber-200/60',   shadow: 'shadow-[0_4px_18px_rgba(245,158,11,0.14)]',   ring: 'ring-amber-200/40'   },
  violet:  { wrap: 'border-violet-200  bg-violet-50   text-violet-700',  glow: 'group-hover:from-violet-50/80  group-hover:to-purple-50/60', border: 'border-violet-200/60',  shadow: 'shadow-[0_4px_18px_rgba(139,92,246,0.14)]',   ring: 'ring-violet-200/40'  },
  cyan:    { wrap: 'border-cyan-200    bg-cyan-50     text-cyan-700',    glow: 'group-hover:from-cyan-50/80    group-hover:to-sky-50/60',    border: 'border-cyan-200/60',    shadow: 'shadow-[0_4px_18px_rgba(6,182,212,0.14)]',    ring: 'ring-cyan-200/40'    },
  rose:    { wrap: 'border-rose-200    bg-rose-50     text-rose-700',    glow: 'group-hover:from-rose-50/80    group-hover:to-pink-50/60',   border: 'border-rose-200/60',    shadow: 'shadow-[0_4px_18px_rgba(244,63,94,0.14)]',    ring: 'ring-rose-200/40'    },
  slate:   { wrap: 'border-slate-300   bg-slate-100   text-slate-600',   glow: 'group-hover:from-slate-100/80  group-hover:to-slate-50/60',  border: 'border-slate-200/80',   shadow: 'shadow-[0_4px_18px_rgba(15,23,42,0.08)]',    ring: 'ring-slate-200/40'   },
} as const;

// ─── Компонент картки ──────────────────────────────────────────────────────
const InfoCard = memo(function InfoCard({ title, icon: Icon, accent = 'sky', featured = false, children }: InfoCardProps) {
  const a = ACCENT[accent];
  return (
    <article className={`group relative overflow-hidden rounded-2xl border-2 bg-white p-5 transition-all duration-300 hover:-translate-y-0.5 ${a.border} ${a.shadow} hover:shadow-[0_14px_38px_rgba(15,23,42,0.16)] ${featured ? `ring-2 ${a.ring}` : ''}`}>
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br from-transparent to-transparent transition-all duration-300 ${a.glow}`} />
      <div className="relative">
        <div className="mb-4 flex items-center gap-3">
          <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 shadow-md ${a.wrap}`}>
            <Icon size={18} strokeWidth={1.8} />
          </span>
          <h3 className="text-[15px] font-bold leading-tight text-slate-800">{title}</h3>
        </div>
        <div className="text-[13.5px] leading-relaxed text-slate-600">{children}</div>
      </div>
    </article>
  );
});

// ─── Пункт списку ──────────────────────────────────────────────────────────
const Li = ({ icon: Icon, cls, children }: { icon: LucideIcon; cls: string; children: ReactNode }) => (
  <li className="flex items-start gap-3">
    <span className={`mt-0.5 shrink-0 ${cls}`}><Icon size={15} strokeWidth={1.8} /></span>
    <span className="text-[13.5px] leading-relaxed text-slate-600">{children}</span>
  </li>
);

// ─── Іконка Viber ──────────────────────────────────────────────────────────
const ViberIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden="true">
    <path d="M11.918.002a23.04 23.04 0 0 1 5.455.784C20.147 1.77 22.393 3.66 23.238 6.49c.514 1.764.733 3.596.758 5.437.044 3.22-.45 6.31-2.287 9.012-1.498 2.198-3.672 3.334-6.233 3.72-1.338.2-2.695.224-4.046.236-.604.006-1.208-.036-1.811-.065-.193-.01-.36.05-.518.162-1.065.755-2.136 1.5-3.204 2.252-.153.107-.31.208-.498.196-.33-.022-.448-.277-.448-.573v-2.773c0-.206-.07-.32-.261-.412-2.163-1.045-3.49-2.803-4.035-5.118C.247 16.53.03 14.447.002 12.36c-.031-2.277.258-4.498 1.19-6.6C2.32 3.138 4.566 1.595 7.38.882A19.77 19.77 0 0 1 11.918.002zm5.27 13.567s.863.085 1.32-.528c.444-.592.616-1.57-.098-2.716-.71-1.14-2.06-2.45-2.96-2.8-.905-.35-1.438.23-1.6.448-.16.218-.345.437-.443.66-.134.304-.022.57.122.76.567.76 1.218 1.47 1.73 2.12.31.39.22.865-.066 1.13-.18.165-.468.38-.716.47-.264.094-.43-.1-.596-.28-.74-.82-1.516-1.62-2.26-2.44-.433-.474-.97-1.006-1.27-1.58-.33-.625-.15-1.254.195-1.786.13-.2.276-.39.41-.587.35-.504.3-.936-.087-1.417C9.7 5.04 9.002 4.24 8.37 3.64c-.317-.3-.718-.44-1.13-.29-.48.17-.96.46-1.34.84-.47.47-.72 1.08-.7 1.78.023.79.207 1.537.48 2.265 1.06 2.84 2.82 5.22 5.1 7.08 1.104.903 2.38 1.614 3.73 2.06.744.246 1.5.36 2.27.22.79-.147 1.35-.6 1.63-1.34.13-.34.17-.7.09-1.047a.988.988 0 0 0-.312-.54z" />
  </svg>
);

// ─── Вкладки ───────────────────────────────────────────────────────────────
const DeliveryTab = () => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
    <InfoCard title="Доставка по Україні" icon={Truck} accent="sky" featured>
      <ul className="space-y-3">
        <Li icon={Package} cls="text-sky-500"><strong className="font-semibold text-slate-700">Нова Пошта</strong> — у відділення або адресна доставка</Li>
        <Li icon={Truck} cls="text-sky-500"><strong className="font-semibold text-slate-700">Укрпошта</strong> та <strong className="font-semibold text-slate-700">Meest</strong> — за запитом клієнта</Li>
        <Li icon={Clock} cls="text-sky-500">Відправка зазвичай <strong className="font-semibold text-slate-700">1–2 робочих дні</strong> після підтвердження</Li>
      </ul>
    </InfoCard>

    <InfoCard title="Доставка по Львову" icon={MapPin} accent="emerald">
      <ul className="space-y-3">
        <Li icon={Navigation} cls="text-emerald-500">Доставка по місту <strong className="font-semibold text-slate-700">за домовленістю</strong> з менеджером</Li>
        <Li icon={Building2} cls="text-emerald-500">Самовивіз зі складу за попередньою домовленістю</Li>
      </ul>
    </InfoCard>

    <InfoCard title="Вартість доставки" icon={Wallet} accent="amber">
      <ul className="space-y-3">
        <Li icon={CheckCircle} cls="text-amber-500">По Україні — за <strong className="font-semibold text-slate-700">тарифами Нової Пошти</strong> залежно від ваги та розмірів посилки</Li>
        <Li icon={CheckCircle} cls="text-amber-500">По Львову — <strong className="font-semibold text-slate-700">за домовленістю</strong></Li>
      </ul>
    </InfoCard>

    <InfoCard title="Пакування та перевірка" icon={ShieldCheck} accent="cyan">
      <ul className="space-y-3">
        <Li icon={ShieldCheck} cls="text-cyan-500">Посилене пакування для <strong className="font-semibold text-slate-700">крихких і габаритних</strong> позицій</Li>
        <Li icon={CheckCircle} cls="text-cyan-500">Рекомендуємо перевіряти комплектність і стан посилки <strong className="font-semibold text-slate-700">під час отримання</strong></Li>
      </ul>
    </InfoCard>
  </div>
);

const PaymentTab = () => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
    <InfoCard title="Онлайн-оплата картою" icon={CreditCard} accent="emerald" featured>
      <ul className="space-y-3">
        <Li icon={CheckCircle} cls="text-emerald-500"><strong className="font-semibold text-slate-700">Visa / MasterCard</strong> через захищений платіжний шлюз</Li>
        <Li icon={ShieldCheck} cls="text-emerald-500">Безпечна транзакція з шифруванням даних</Li>
      </ul>
    </InfoCard>

    <InfoCard title="Оплата при отриманні" icon={Wallet} accent="amber">
      <ul className="space-y-3">
        <Li icon={Package} cls="text-amber-500">{"Оплата "}<strong className="font-semibold text-slate-700">у відділенні Нової Пошти</strong>{" або кур'єру після огляду"}</Li>
        <Li icon={CheckCircle} cls="text-amber-500">Можливість оглянути товар перед оплатою</Li>
      </ul>
    </InfoCard>

    <InfoCard title="Безготівковий розрахунок" icon={Building2} accent="sky">
      <ul className="space-y-3">
        <Li icon={CheckCircle} cls="text-sky-500">Повний пакет документів для <strong className="font-semibold text-slate-700">СТО, ФОП та компаній</strong></Li>
        <Li icon={Award} cls="text-sky-500">Рахунок, накладна, акт виконаних робіт</Li>
      </ul>
    </InfoCard>

    <InfoCard title="Гарантія та повернення" icon={RefreshCcw} accent="rose">
      <ul className="space-y-3">
        <Li icon={CheckCircle} cls="text-rose-500">Умови повернення та обміну <strong className="font-semibold text-slate-700">уточнюються з менеджером</strong> залежно від товарної групи</Li>
        <Li icon={ShieldCheck} cls="text-rose-500">Якість товару — наш пріоритет</Li>
      </ul>
    </InfoCard>
  </div>
);

const AboutTab = () => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
    <div className="sm:col-span-2">
      <InfoCard title="Про PartsON" icon={Star} accent="sky" featured>
        <p>
          Магазин з великим асортиментом товарів усіх популярних категорій запчастин для всіх поширених
          моделей авто. На ринку <strong className="font-semibold text-slate-700">більше 20 років</strong> —
          досвід і репутація, яким довіряють. Зручний та надійний сервіс для кожного покупця.
        </p>
      </InfoCard>
    </div>

    <InfoCard title="Професійний персонал" icon={Users} accent="emerald">
      <p>Кваліфіковані консультанти підберуть деталь за кодом, артикулом або VIN — без ризиків і переплат.</p>
    </InfoCard>

    <InfoCard title="Широкий асортимент" icon={Car} accent="sky">
      <p>Тисячі позицій у наявності: від фільтрів і гальм до деталей підвіски, двигуна та кузова для більшості популярних марок.</p>
    </InfoCard>

    <InfoCard title="Підбір по VIN" icon={Package} accent="violet">
      <p>Надішліть VIN або параметри авто — підготуємо <strong className="font-semibold text-slate-700">точний перелік позицій</strong> без помилок у підборі.</p>
    </InfoCard>

    <InfoCard title={"Зв'язок та підтримка"} icon={MessageCircle} accent="cyan">
      <p>{"Оперативний зв'язок через чат у робочий час. Менеджер зорієнтує по наявності, термінах і доставці."}</p>
    </InfoCard>
  </div>
);

const LocationTab = () => (
  <div className="grid grid-cols-1 gap-4">
    <InfoCard title="Як знайти магазин PartsON" icon={Navigation} accent="cyan" featured>
      <div className="space-y-3">
        <p>
          Магазин автозапчастин <strong className="font-semibold text-slate-700">PartsON</strong>{" "}
          розташований у Львові за адресою <strong className="font-semibold text-slate-700">{ADDRESS}</strong>.
          Тут можна швидко отримати консультацію, уточнити наявність деталей, погодити
          самовивіз замовлення та одразу побудувати маршрут до магазину.
        </p>
        <p>
          На сторінці локації зібрані карта проїзду, графік роботи, контакти для
          швидкого зв&apos;язку та інформація для клієнтів, які планують приїзд у магазин
          або хочуть заздалегідь зорієнтуватися по вулиці, входу та способу отримання замовлення.
        </p>
      </div>
    </InfoCard>

    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      <div className="grid gap-4 content-start">
      <InfoCard title="Адреса" icon={MapPin} accent="sky" featured>
        <ul className="space-y-3">
          <Li icon={MapPin} cls="text-sky-500">{ADDRESS}</Li>
          <li className="pt-1">
            <a
              href={MAPS_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-[13px] font-semibold text-sky-800 transition hover:bg-sky-100 active:scale-95"
            >
              <Navigation size={14} strokeWidth={2} />
              Відкрити в Google Maps
            </a>
          </li>
        </ul>
      </InfoCard>

      <InfoCard title="Графік роботи" icon={Clock} accent="emerald">
        <ul className="space-y-2.5">
          <Li icon={CheckCircle} cls="text-emerald-500"><span><strong className="font-semibold text-slate-700">Пн–Сб:</strong> 08:00 — 18:00</span></Li>
          <Li icon={CheckCircle} cls="text-emerald-500"><span><strong className="font-semibold text-slate-700">Неділя:</strong> 08:00 — 16:00</span></Li>
          <Li icon={CheckCircle} cls="text-emerald-500"><span className="text-slate-500 text-[12px]">Щодня без вихідних</span></Li>
        </ul>
      </InfoCard>

      <InfoCard title="Контакти" icon={Phone} accent="violet">
        <div className="flex flex-col gap-2.5">
          <a
            href={`tel:${PHONE_RAW}`}
            className="inline-flex items-center gap-2.5 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-[15px] font-bold text-violet-900 transition hover:bg-violet-100 active:scale-95"
          >
            <Phone size={15} strokeWidth={2} className="shrink-0 text-violet-500" />
            {PHONE_DISPLAY}
          </a>
          <a
            href={VIBER_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2.5 rounded-xl border border-purple-200 bg-purple-50 px-4 py-2.5 text-[13px] font-semibold text-purple-900 transition hover:bg-purple-100 active:scale-95"
          >
            <span className="text-purple-500"><ViberIcon /></span>
            Написати у Viber
          </a>
        </div>
      </InfoCard>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 shadow-[0_4px_24px_rgba(15,23,42,0.10)] min-h-[320px] lg:min-h-0">
        <iframe
          title="PartsON — Карта Львів"
          src={MAPS_EMBED_URL}
          className="h-full min-h-[320px] w-full border-0 lg:min-h-[520px]"
          loading="lazy"
          allowFullScreen
          referrerPolicy="no-referrer-when-downgrade"
        />
        <div className="border-t border-slate-200/80 bg-white/95 px-4 py-3.5">
          <p className="text-[13px] leading-relaxed text-slate-600">
            Карта допоможе швидко побудувати маршрут до магазину PartsON на вулиці
            Перфецького, 8 у Львові, перевірити локацію для самовивозу та зорієнтуватися
            перед візитом у магазин автозапчастин.
          </p>
        </div>
      </div>
    </div>
  </div>
);

const PrivacyTab = () => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
    <div className="sm:col-span-2">
      <InfoCard title="Політика конфіденційності PartsON" icon={ShieldCheck} accent="sky" featured>
        <div className="space-y-3">
          <p>
            Ця політика пояснює, як PartsON обробляє персональні дані клієнтів і
            відвідувачів сайту під час пошуку автозапчастин, оформлення замовлення,
            оплати, доставки, консультацій та звернень у чат або телефоном.
          </p>
          <p>
            Ми обробляємо дані відповідно до Закону України «Про захист персональних
            даних» та, коли це застосовно, з урахуванням принципів GDPR: законність,
            прозорість, мінімізація даних, обмеження мети, точність, захист і
            відповідальне зберігання.
          </p>
        </div>
      </InfoCard>
    </div>

    <InfoCard title="Які дані ми можемо збирати" icon={Users} accent="emerald">
      <ul className="space-y-3">
        <Li icon={CheckCircle} cls="text-emerald-500">Ім&apos;я, номер телефону, email та інші контактні дані, які ви надаєте для замовлення або консультації.</Li>
        <Li icon={Car} cls="text-emerald-500">Дані авто для підбору: марка, модель, рік, модифікація, VIN, артикул або код деталі.</Li>
        <Li icon={Package} cls="text-emerald-500">Дані доставки: місто, відділення перевізника, адреса доставки у Львові, обраний спосіб отримання.</Li>
        <Li icon={CreditCard} cls="text-emerald-500">Дані про оплату, статус платежу та номер транзакції. Повні реквізити банківської картки PartsON не зберігає.</Li>
      </ul>
    </InfoCard>

    <InfoCard title="Для чого використовуємо дані" icon={Info} accent="cyan">
      <ul className="space-y-3">
        <Li icon={CheckCircle} cls="text-cyan-500">Щоб оформити, підтвердити, оплатити, доставити або видати замовлення.</Li>
        <Li icon={ShieldCheck} cls="text-cyan-500">Щоб перевірити сумісність деталей, підібрати аналоги, уточнити ціну, наявність і строки постачання.</Li>
        <Li icon={MessageCircle} cls="text-cyan-500">Щоб відповідати на звернення, повідомляти про статус замовлення та надавати сервісну підтримку.</Li>
        <Li icon={Building2} cls="text-cyan-500">Щоб виконувати вимоги бухгалтерського, податкового, споживчого та іншого застосовного законодавства.</Li>
      </ul>
    </InfoCard>

    <InfoCard title="Кому можуть передаватися дані" icon={Truck} accent="amber">
      <ul className="space-y-3">
        <Li icon={Truck} cls="text-amber-500">Службам доставки: Нова Пошта, Укрпошта, Meest або іншим перевізникам, яких обирає клієнт.</Li>
        <Li icon={CreditCard} cls="text-amber-500">Платіжним сервісам і банкам для проведення онлайн-оплати або повернення коштів.</Li>
        <Li icon={Building2} cls="text-amber-500">Постачальникам, сервісним партнерам, бухгалтерам, технічним провайдерам сайту — лише в межах необхідного.</Li>
        <Li icon={ShieldCheck} cls="text-amber-500">Державним органам — лише у випадках, прямо передбачених законом.</Li>
      </ul>
    </InfoCard>

    <InfoCard title="Захист і строки зберігання" icon={ShieldCheck} accent="violet">
      <ul className="space-y-3">
        <Li icon={ShieldCheck} cls="text-violet-500">Ми застосовуємо організаційні та технічні заходи для захисту даних від втрати, несанкціонованого доступу або розголошення.</Li>
        <Li icon={Clock} cls="text-violet-500">Дані зберігаються стільки, скільки потрібно для виконання замовлення, гарантійного супроводу, обліку та законних інтересів PartsON.</Li>
        <Li icon={RefreshCcw} cls="text-violet-500">Після завершення необхідного строку дані видаляються, знеособлюються або архівуються відповідно до вимог законодавства.</Li>
      </ul>
    </InfoCard>

    <InfoCard title="Ваші права" icon={RefreshCcw} accent="rose">
      <ul className="space-y-3">
        <Li icon={CheckCircle} cls="text-rose-500">Отримати інформацію про обробку ваших персональних даних.</Li>
        <Li icon={CheckCircle} cls="text-rose-500">Попросити виправити, оновити, обмежити обробку або видалити дані, якщо це не суперечить закону.</Li>
        <Li icon={CheckCircle} cls="text-rose-500">Відкликати згоду на комунікації або заперечити проти окремих видів обробки.</Li>
        <Li icon={Phone} cls="text-rose-500">Звернутися до PartsON телефоном {PHONE_DISPLAY} або email: romaniukbboogg@gmail.com.</Li>
      </ul>
    </InfoCard>

    <InfoCard title="Cookies, аналітика та зміни політики" icon={Clock} accent="slate">
      <ul className="space-y-3">
        <Li icon={Info} cls="text-slate-500">Сайт може використовувати cookies, технічні журнали, кеш браузера та аналітичні інструменти для стабільної роботи, безпеки й покращення сервісу.</Li>
        <Li icon={ShieldCheck} cls="text-slate-500">Ми не продаємо персональні дані клієнтів третім особам.</Li>
        <Li icon={Clock} cls="text-slate-500">Політика може оновлюватися при зміні сервісів або законодавства. Актуальна версія завжди доступна на цій сторінці.</Li>
      </ul>
    </InfoCard>
  </div>
);

// ─── Вміст по ключу вкладки ────────────────────────────────────────────────
const renderTabContent = (key: InformationSectionKey) => {
  switch (key) {
    case 'delivery': return <DeliveryTab />;
    case 'payment':  return <PaymentTab />;
    case 'about':    return <AboutTab />;
    case 'location': return <LocationTab />;
    case 'privacy':  return <PrivacyTab />;
    default:         return <DeliveryTab />;
  }
};

// ─── Головний компонент ────────────────────────────────────────────────────
export default function InformationPageClient({ initialSectionKey }: InformationPageClientProps) {
  const activeTab = tabs.find((tab) => tab.key === initialSectionKey) || tabs[0];

  return (
    <div
      className="relative min-h-[calc(100vh-4rem)] overflow-hidden select-none"
      style={{ background: 'linear-gradient(160deg,#f0f9ff 0%,#e8f4fd 40%,#eef2ff 100%)' }}
    >
      {/* Декоративний фон */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-[500px] w-[500px] rounded-full bg-sky-200/30 blur-[80px]" />
        <div className="absolute top-1/2 -left-32 h-[400px] w-[400px] rounded-full bg-indigo-200/20 blur-[70px]" />
        <div className="absolute -bottom-20 right-1/3 h-[300px] w-[300px] rounded-full bg-cyan-200/25 blur-[60px]" />
      </div>

      <section className="page-shell-inline relative grid gap-5 py-5 sm:py-7">

        {/* Хлібні крихти */}
        <nav className="flex flex-wrap items-center gap-1.5 text-[12px] font-semibold tracking-wide text-slate-400">
          <Link href="/" className="transition hover:text-slate-600">Головна</Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-500">Інформація</span>
          <span className="text-slate-300">/</span>
          <span className="text-sky-600">{activeTab.title}</span>
        </nav>

        {/* Заголовок сторінки */}
        <div className="relative overflow-hidden rounded-3xl border border-white/80 bg-white/70 px-6 py-5 shadow-[0_8px_32px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:px-8 sm:py-6">
          <div className="pointer-events-none absolute inset-0 bg-[image:radial-gradient(circle_at_0%_0%,rgba(56,189,248,0.12),transparent_52%),radial-gradient(circle_at_100%_100%,rgba(99,102,241,0.08),transparent_52%)]" />
          <div className="relative flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-sky-100 bg-sky-50 text-sky-600 shadow-sm">
              {(() => { const I = activeTab.icon; return <I size={22} strokeWidth={1.7} />; })()}
            </span>
            <div>
              <h1 className="text-[1.45rem] font-extrabold leading-tight text-slate-900 sm:text-[1.7rem]">
                {activeTab.seoTitle}
              </h1>
              <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-slate-500 sm:text-[14px]">
                {activeTab.seoDescription}
              </p>
            </div>
          </div>
        </div>

        {/* Навігаційні вкладки */}
        <nav className="relative overflow-hidden rounded-2xl border border-white/80 bg-white/70 p-2 shadow-[0_4px_18px_rgba(15,23,42,0.07)] backdrop-blur-xl">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5 sm:gap-2">
            {tabs.map((tab) => {
              const isActive = tab.key === activeTab.key;
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.key}
                  href={getInformationPath(tab.key)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative rounded-xl px-3 py-3 text-left transition-all duration-200 active:scale-[0.98] ${
                    isActive
                      ? 'bg-gradient-to-br from-sky-500 to-cyan-500 text-white shadow-[0_6px_18px_rgba(14,165,233,0.35)]'
                      : 'text-slate-600 hover:bg-slate-100/80'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon size={15} strokeWidth={isActive ? 2.2 : 1.8} className={isActive ? 'text-white' : 'text-sky-500'} />
                    <span className="text-[13px] font-bold">{tab.title}</span>
                  </div>
                  <p className={`mt-0.5 text-[11px] font-medium ${isActive ? 'text-sky-100' : 'text-slate-400'}`}>
                    {tab.subtitle}
                  </p>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Вміст вкладки */}
        <main>{renderTabContent(activeTab.key)}</main>

      </section>
    </div>
  );
}
