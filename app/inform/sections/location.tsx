import { Clock, MapPin, Navigation, Phone } from 'lucide-react';

import {
  AddressMapLink,
  Block,
  Callout,
  Card,
  ContactButtons,
  MAPS_EMBED_URL,
  MAPS_URL,
  PartsOnLink,
  Prose,
  Steps,
  type TocItem,
} from '../ui';

export const toc: TocItem[] = [
  { id: 'address', label: 'Адреса та карта' },
  { id: 'hours', label: 'Графік і контакти' },
  { id: 'visit', label: 'Як підготуватися до візиту' },
];

const HOURS = [
  { day: 'Понеділок – Субота', time: '08:00 – 18:00' },
  { day: 'Неділя', time: '08:00 – 16:00' },
];

export default function LocationSection() {
  return (
    <>
      <Block id="address" kicker="Адреса" title={<>Як знайти магазин <PartsOnLink className="no-underline" /></>}>
        <Prose className="mb-5">
          <p>
            Магазин автозапчастин <PartsOnLink /> розташований у Львові за адресою <AddressMapLink />.
            Тут можна отримати консультацію, уточнити наявність деталей, забрати замовлення самовивозом
            і одразу побудувати маршрут.
          </p>
        </Prose>
        <div className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.09)]">
          <iframe
            title="Карта: магазин PartsON у Львові, вул. Перфецького, 8"
            src={MAPS_EMBED_URL}
            className="block h-[340px] w-full border-0 sm:h-[440px]"
            loading="lazy"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
          />
          <div className="flex flex-col gap-3 border-t border-slate-200/80 bg-[linear-gradient(135deg,#f8fbff,#f0fdfa)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="flex items-center gap-2 text-[14px] font-semibold text-slate-700">
              <MapPin size={16} className="shrink-0 text-sky-600" aria-hidden="true" />
              Львів, вул. Перфецького, 8
            </p>
            <a
              href={MAPS_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#0ea5e9,#0284c7_52%,#0d9488)] px-4 text-[13.5px] font-bold text-white shadow-[0_12px_26px_rgba(14,165,233,0.28)] transition hover:-translate-y-0.5 hover:brightness-105"
            >
              <Navigation size={15} strokeWidth={2} aria-hidden="true" />
              Прокласти маршрут
            </a>
          </div>
        </div>
      </Block>

      <Block id="hours" kicker="Коли і як" title="Графік роботи та контакти">
        <div className="info-content-grid grid gap-6 md:grid-cols-2">
          <Card title="Графік роботи" icon={Clock} tone="teal">
            <dl className="divide-y divide-slate-100">
              {HOURS.map((row) => (
                <div key={row.day} className="flex items-center justify-between gap-4 py-2.5">
                  <dt className="font-semibold text-slate-700">{row.day}</dt>
                  <dd className="font-bold tabular-nums text-slate-900">{row.time}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-[12px] font-bold text-teal-800">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-500" aria-hidden="true" />
              Щодня без вихідних
            </p>
          </Card>
          <Card title="Зв'язатися з магазином" icon={Phone} tone="indigo">
            <p className="mb-4">Менеджер підтвердить наявність деталі й готовність замовлення до самовивозу.</p>
            <ContactButtons />
          </Card>
        </div>
      </Block>

      <Block id="visit" kicker="Перед візитом" title="Як підготуватися до приїзду в магазин">
        <Steps
          tone="cyan"
          steps={[
            { title: 'Зателефонуйте', text: 'Повідомте, яка деталь потрібна, або назвіть номер замовлення.' },
            { title: 'Отримайте підтвердження', text: 'Менеджер перевірить наявність і готовність замовлення.' },
            { title: 'Приїжджайте', text: 'Прокладіть маршрут за картою та заберіть замовлення в зручний час.' },
          ]}
        />
        <Callout tone="tip" title="Не впевнені в сумісності?" className="mt-4">
          Візьміть із собою техпаспорт авто або стару деталь — так ми швидше перевіримо, що нова підходить.
        </Callout>
      </Block>
    </>
  );
}
