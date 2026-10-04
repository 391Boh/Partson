import {
  Building2,
  CheckCircle,
  Clock,
  Navigation,
  Package,
  ShieldCheck,
  Store,
  Truck,
  type LucideIcon,
} from 'lucide-react';

import {
  AddressMapLink,
  Block,
  Callout,
  Card,
  DataTable,
  Li,
  List,
  PartsOnLink,
  Prose,
  Steps,
  Strong,
  type TocItem,
} from '../ui';

export const toc: TocItem[] = [
  { id: 'overview', label: 'Коротко про доставку' },
  { id: 'methods', label: 'Способи та строки' },
  { id: 'process', label: 'Як проходить доставка' },
  { id: 'lviv', label: 'Самовивіз і доставка у Львові' },
  { id: 'cities', label: 'Доставка по містах України' },
];

const CITIES: ReadonlyArray<{ name: string; city: string; preposition: string; text: string; icon: LucideIcon }> = [
  { name: 'Львів', city: 'Львові', preposition: 'у', icon: Store, text: 'Самовивіз із магазину на Перфецького, 8 у день замовлення, або доставка по місту за домовленістю з менеджером.' },
  { name: 'Київ', city: 'Києві', preposition: 'у', icon: Truck, text: "Новою Поштою — у відділення, поштомат або кур'єром додому. Відправка зазвичай протягом 1–2 днів." },
  { name: 'Харків', city: 'Харкові', preposition: 'у', icon: Truck, text: 'Обираєте зручне відділення чи поштомат Нової Пошти при оформленні замовлення.' },
  { name: 'Одеса', city: 'Одесі', preposition: 'в', icon: Truck, text: 'Відправляємо в день підтвердження — отримати можна у відділенні Нової Пошти або поштоматі.' },
  { name: 'Дніпро', city: 'Дніпрі', preposition: 'у', icon: Truck, text: 'Автозапчастини Новою Поштою — зазвичай за 1–2 робочих дні з моменту відправки.' },
  { name: 'Запоріжжя', city: 'Запоріжжі', preposition: 'у', icon: Truck, text: "Доступна доставка у відділення, поштомат або адресно кур'єром — оберіть варіант при оформленні." },
  { name: 'Миколаїв', city: 'Миколаєві', preposition: 'у', icon: Package, text: 'Відправляємо Новою Поштою, Укрпоштою або Meest — за вашим запитом при оформленні.' },
  { name: 'Вінниця', city: 'Вінниці', preposition: 'у', icon: Package, text: 'Замовлення прибуває зазвичай за 1–2 дні після відправки Новою Поштою.' },
];

export default function DeliverySection() {
  return (
    <>
      <Block id="overview" kicker="Доставка PartsON" title="Доставка автозапчастин Новою Поштою по Україні">
        <Prose>
          <p>
            <PartsOnLink /> відправляє замовлення <Strong>Новою Поштою в будь-яке місто України</Strong> — у
            відділення, поштомат або кур&apos;єром додому. Зазвичай посилка прибуває за{' '}
            <Strong>1–2 робочих дні</Strong> після підтвердження замовлення.
          </p>
          <p>
            У Львові додатково доступні самовивіз із магазину на <AddressMapLink /> у день
            замовлення та доставка по місту за домовленістю з менеджером.
          </p>
        </Prose>
      </Block>

      <Block
        id="methods"
        kicker="Порівняння"
        title="Способи доставки, строки та вартість"
        lead="Оберіть варіант під свій графік — спосіб отримання можна змінити, поки замовлення ще не відправлене."
      >
        <DataTable
          caption="Способи доставки автозапчастин PartsON"
          head={['Спосіб', 'Куди', 'Строк', 'Вартість']}
          rows={[
            ['Нова Пошта: відділення або поштомат', 'Будь-яке місто України', '1–2 робочих дні після відправлення', 'За тарифами Нової Пошти'],
            ["Кур'єр Нової Пошти", 'Адресно по Україні', '1–2 робочих дні після відправлення', 'За тарифами Нової Пошти'],
            ['Укрпошта або Meest', 'За запитом клієнта', 'Залежить від перевізника', 'За тарифами перевізника'],
            ['Самовивіз', <AddressMapLink key="a" />, 'У день підтвердження, якщо товар є у Львові', 'Без оплати доставки'],
            ['Доставка по Львову', 'Адреса у Львові', 'За домовленістю', 'За домовленістю'],
          ]}
        />
        <p className="mt-3 text-[13px] font-medium leading-6 text-slate-500">
          Вартість доставки перевізником залежить від ваги та розмірів посилки.
        </p>
      </Block>

      <Block id="process" kicker="Крок за кроком" title="Як проходить доставка замовлення">
        <Steps
          steps={[
            { title: 'Оформлення', text: 'Додайте товар у кошик і вкажіть зручний спосіб отримання та контактні дані.' },
            { title: 'Підтвердження', text: 'Менеджер перевіряє наявність і сумісність деталі та узгоджує деталі доставки.' },
            { title: 'Відправлення', text: 'Пакуємо замовлення й одразу надсилаємо номер ТТН для відстеження.' },
            { title: 'Отримання', text: 'Перевірте комплектність і стан посилки під час отримання у відділенні чи від кур’єра.' },
          ]}
        />
      </Block>

      <Block id="lviv" kicker="Львів" title="Самовивіз і оперативна доставка у Львові">
        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Самовивіз з магазину" icon={Store} tone="teal">
            <List>
              <Li icon={Building2} tone="teal">Адреса: <AddressMapLink /> — за попереднім підтвердженням.</Li>
              <Li icon={Clock} tone="teal">Отримання <Strong>у день підтвердження</Strong>, якщо товар є в наявності у Львові.</Li>
              <Li icon={Navigation} tone="teal">Доставка по Львову — <Strong>за домовленістю</Strong> з менеджером.</Li>
            </List>
          </Card>
          <Card title="Пакування та перевірка" icon={ShieldCheck} tone="cyan">
            <List>
              <Li icon={ShieldCheck} tone="cyan">Посилене пакування для <Strong>крихких і габаритних</Strong> позицій.</Li>
              <Li icon={CheckCircle} tone="cyan">Перед відправленням перевіряємо комплектність і відповідність замовленню.</Li>
              <Li icon={Package} tone="cyan">Радимо оглядати посилку <Strong>під час отримання</Strong>.</Li>
            </List>
          </Card>
        </div>
        <Callout tone="tip" title="Порада перед приїздом" className="mt-4">
          Перед самовивозом зателефонуйте менеджеру — ми підтвердимо, що замовлення вже готове й чекає на вас.
        </Callout>
      </Block>

      <Block
        id="cities"
        kicker="Географія"
        title="Доставка автозапчастин по містах України"
        lead="Відправляємо в кожне місто, де працює Нова Пошта. Ось як це виглядає для найбільших міст."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CITIES.map(({ name, city, preposition, text, icon: CityIcon }) => (
            <div
              key={name}
              className="group rounded-[18px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_8px_20px_rgba(15,23,42,0.04)] transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_14px_30px_rgba(14,165,233,0.12)]"
            >
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-sky-100 bg-sky-50 text-sky-600 transition group-hover:border-sky-200 group-hover:bg-sky-100">
                  <CityIcon size={15} strokeWidth={2.1} aria-hidden="true" />
                </span>
                <h3 className="text-[15px] text-slate-900">
                  <span className="sr-only">Доставка автозапчастин {preposition} </span>
                  {name}
                  <span className="sr-only"> ({city})</span>
                </h3>
              </div>
              <p className="mt-2.5 text-[13px] font-medium leading-relaxed text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </Block>
    </>
  );
}
