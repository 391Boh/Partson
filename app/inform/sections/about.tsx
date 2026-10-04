import Image from 'next/image';
import {
  Award,
  Building2,
  Car,
  CheckCircle,
  Clock,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  RefreshCcw,
  ShieldCheck,
  Star,
  Truck,
  Users,
  Wrench,
} from 'lucide-react';

import {
  AddressMapLink,
  Block,
  Card,
  Li,
  List,
  MAPS_URL,
  PHONE_DISPLAY,
  PHONE_RAW,
  PartsOnLink,
  Prose,
  Steps,
  Strong,
  type TocItem,
} from '../ui';

export const toc: TocItem[] = [
  { id: 'story', label: 'Хто ми' },
  { id: 'how', label: 'Як ми підбираємо деталі' },
  { id: 'why', label: 'Що ви отримуєте' },
];

export default function AboutSection() {
  return (
    <>
      <Block id="story" kicker="Магазин у Львові" title={<><PartsOnLink className="no-underline" /> — точний підбір автозапчастин з першого разу</>}>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)] lg:items-stretch">
          <div className="flex flex-col justify-between gap-5">
            <Prose>
              <p>
                Ми уточнюємо авто, <Strong>перевіряємо сумісність деталі ще до оплати</Strong> і пропонуємо
                оригінал або перевірений аналог — щоб ремонт не затягувався через помилку з підбором.
              </p>
              <p>
                Магазин <PartsOnLink /> працює у Львові за адресою <AddressMapLink />. Тут можна отримати
                консультацію, оглянути товар і забрати замовлення, а для клієнтів з інших міст працює
                доставка автозапчастин по всій Україні.
              </p>
            </Prose>
            <div className="flex flex-wrap gap-2.5">
              <a
                href={`tel:${PHONE_RAW}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 text-[13.5px] font-bold text-sky-900 shadow-[0_10px_20px_rgba(14,165,233,0.08)] transition hover:-translate-y-0.5 hover:bg-sky-100"
              >
                <Phone size={15} strokeWidth={2} aria-hidden="true" />
                Богдан: {PHONE_DISPLAY}
              </a>
              <a
                href={MAPS_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 text-[13.5px] font-bold text-teal-900 shadow-[0_10px_20px_rgba(20,184,166,0.08)] transition hover:-translate-y-0.5 hover:bg-teal-100"
              >
                <MapPin size={15} strokeWidth={2} aria-hidden="true" />
                Маршрут до Перфецького, 8
              </a>
            </div>
          </div>

          <figure className="group relative min-h-[300px] overflow-hidden rounded-[24px] border border-sky-100 bg-sky-50 shadow-[0_22px_44px_rgba(14,165,233,0.16)] ring-1 ring-white/80">
            <Image
              src="/storefront/photos/partson-store-1.jpg"
              alt="Магазин автозапчастин PartsON у Львові на вул. Перфецького, 8"
              fill
              sizes="(min-width: 1024px) 420px, 100vw"
              className="object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.04]"
            />
            <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/75 via-slate-950/30 to-transparent px-5 pb-5 pt-14 text-white">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-sky-100">Фото магазину PartsON</p>
              <p className="mt-1 text-[15px] font-extrabold">Львів, вул. Перфецького, 8</p>
            </figcaption>
          </figure>
        </div>
      </Block>

      <Block
        id="how"
        kicker="Підхід"
        title="Як ми підбираємо автозапчастини"
        lead="Для перевірки використовуємо VIN-код, артикул, дані про марку, модель, рік і модифікацію автомобіля."
      >
        <Steps
          steps={[
            { title: 'Дані авто', text: 'Надсилаєте VIN, артикул, код товару або марку, модель і рік автомобіля.' },
            { title: 'Перевірка сумісності', text: 'Звіряємо деталь із вашим авто ще до оплати, щоб зменшити ризик помилки.' },
            { title: 'Оригінал чи аналог', text: 'Порівнюємо варіанти за ціною, наявністю й строками та радимо оптимальний.' },
            { title: 'Отримання', text: 'Самовивіз у Львові або доставка в будь-яке місто України.' },
          ]}
        />
      </Block>

      <Block id="why" kicker="Переваги" title="Що ви отримуєте, звертаючись у PartsON">
        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Підбір і сумісність" icon={Users} tone="teal">
            <List>
              <Li tone="teal">Підбір за VIN-кодом, артикулом, кодом товару або параметрами авто.</Li>
              <Li icon={ShieldCheck} tone="teal">Перевірка сумісності перед замовленням.</Li>
              <Li icon={MessageCircle} tone="teal">Консультація щодо оригіналів, аналогів, наявності, термінів і ціни.</Li>
            </List>
          </Card>
          <Card title="Категорії автозапчастин" icon={Car} tone="sky">
            <List>
              <Li icon={Wrench}>Деталі для ТО: фільтри, оливи, ремені, ролики, свічки та витратні матеріали.</Li>
              <Li icon={Package}>Підвіска, гальма, двигун, охолодження, кузовні елементи й автоелектроніка.</Li>
              <Li icon={Star}>Брендові запчастини та якісні аналоги для європейських, японських і корейських авто.</Li>
            </List>
          </Card>
          <Card title="Магазин у Львові" icon={Building2} tone="indigo">
            <List>
              <Li icon={MapPin} tone="indigo">Консультація й огляд товару на місці.</Li>
              <Li icon={Clock} tone="indigo">Самовивіз замовлень щодня, без вихідних.</Li>
              <Li icon={Truck} tone="indigo">Доставка автозапчастин по всій Україні.</Li>
            </List>
          </Card>
          <Card title="Підтримка після замовлення" icon={MessageCircle} tone="cyan">
            <List>
              <Li icon={CheckCircle} tone="cyan">Менеджер зорієнтує щодо статусу, доставки, оплати та можливих замін.</Li>
              <Li icon={RefreshCcw} tone="cyan">Допоможемо з гарантією, поверненням або обміном.</Li>
              <Li icon={Award} tone="cyan">Наша мета — допомогти правильно закрити ремонтну задачу, а не просто продати деталь.</Li>
            </List>
          </Card>
        </div>
      </Block>
    </>
  );
}
