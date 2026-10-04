import Image from 'next/image';
import {
  Activity,
  AlertTriangle,
  Car,
  Cpu,
  Gauge,
  MapPin,
  Phone,
  ShieldCheck,
  Wallet,
  Wrench,
} from 'lucide-react';

import DiagnosticsConsultationForm from '../DiagnosticsConsultationForm';
import {
  ADDRESS,
  Block,
  Card,
  DataTable,
  DIAGNOSTICS_PHONE_DISPLAY,
  DIAGNOSTICS_PHONE_RAW,
  Li,
  List,
  MAPS_URL,
  PartsOnLink,
  Prose,
  Steps,
  Strong,
  type TocItem,
} from '../ui';

export const toc: TocItem[] = [
  { id: 'booking', label: 'Запис на діагностику' },
  { id: 'systems', label: 'Що перевіряємо' },
  { id: 'codes', label: 'Коди помилок' },
  { id: 'process', label: 'Як проходить діагностика' },
  { id: 'when', label: 'Коли варто приїхати' },
  { id: 'brands', label: 'Марки та моделі' },
];

const BRANDS = [
  { brand: 'Audi', models: ['A3', 'A4', 'A5', 'A6', 'Q3', 'Q5', 'Q7'] },
  { brand: 'BMW', models: ['1 Series', '3 Series', '5 Series', 'X1', 'X3', 'X5'] },
  { brand: 'Mercedes-Benz', models: ['A-Class', 'C-Class', 'E-Class', 'GLA', 'GLC', 'Vito', 'Sprinter'] },
  { brand: 'Volkswagen', models: ['Golf', 'Passat', 'Polo', 'Tiguan', 'Touareg', 'Transporter', 'Caddy'] },
  { brand: 'Skoda', models: ['Fabia', 'Octavia', 'Superb', 'Rapid', 'Kodiaq', 'Karoq'] },
  { brand: 'Seat', models: ['Ibiza', 'Leon', 'Altea', 'Ateca', 'Tarraco'] },
  { brand: 'Opel', models: ['Astra', 'Vectra', 'Insignia', 'Zafira', 'Corsa', 'Vivaro'] },
  { brand: 'Ford', models: ['Fiesta', 'Focus', 'Mondeo', 'Kuga', 'Transit', 'S-Max'] },
  { brand: 'Renault', models: ['Clio', 'Megane', 'Scenic', 'Laguna', 'Logan', 'Duster', 'Trafic'] },
  { brand: 'Peugeot', models: ['206', '207', '308', '3008', '5008', 'Partner', 'Boxer'] },
  { brand: 'Citroen', models: ['C3', 'C4', 'C5', 'Berlingo', 'Jumpy', 'Jumper'] },
  { brand: 'Toyota', models: ['Yaris', 'Corolla', 'Camry', 'Avensis', 'RAV4', 'Land Cruiser'] },
  { brand: 'Lexus', models: ['IS', 'ES', 'GS', 'NX', 'RX', 'LX'] },
  { brand: 'Nissan', models: ['Micra', 'Juke', 'Qashqai', 'X-Trail', 'Note', 'Navara'] },
  { brand: 'Mazda', models: ['2', '3', '5', '6', 'CX-3', 'CX-5', 'CX-7'] },
  { brand: 'Honda', models: ['Civic', 'Accord', 'CR-V', 'HR-V', 'Jazz'] },
  { brand: 'Hyundai', models: ['i20', 'i30', 'Elantra', 'Sonata', 'Tucson', 'Santa Fe'] },
  { brand: 'Kia', models: ['Rio', 'Ceed', 'Cerato', 'Sportage', 'Sorento', 'Optima'] },
  { brand: 'Mitsubishi', models: ['Lancer', 'Outlander', 'Pajero', 'ASX', 'L200'] },
  { brand: 'Volvo', models: ['S40', 'S60', 'S80', 'V50', 'V70', 'XC60', 'XC90'] },
  { brand: 'Fiat', models: ['500', 'Panda', 'Punto', 'Doblo', 'Ducato'] },
  { brand: 'Jeep', models: ['Renegade', 'Compass', 'Cherokee', 'Grand Cherokee', 'Wrangler'] },
  { brand: 'Chevrolet', models: ['Aveo', 'Lacetti', 'Cruze', 'Captiva', 'Orlando'] },
];

export default function DiagnosticsSection() {
  return (
    <>
      <Block id="booking" kicker="OBD-II / ECU / Check Engine" title="Комп'ютерна діагностика авто у Львові">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)] lg:items-start">
          <div className="space-y-5">
            <div className="flex items-start gap-4">
              <Prose>
                <p>
                  <PartsOnLink /> проводить <Strong>комп&apos;ютерну діагностику авто у Львові</Strong> для
                  швидкого пошуку причин помилок і несправностей. Підключаємося через OBD-II/EOBD, перевіряємо
                  електронні блоки, розшифровуємо коди Check Engine, ABS, ESP, SRS, АКПП та пояснюємо, що
                  варто ремонтувати першим.
                </p>
                <p>
                  Діагностика корисна перед купівлею авто, після ремонту, при збільшеній витраті пального,
                  втраті тяги, ривках, аварійному режимі коробки або появі індикаторів на панелі приладів.
                </p>
              </Prose>
              <figure className="hidden shrink-0 place-items-center rounded-[20px] border border-sky-100 bg-[linear-gradient(145deg,#fff,#e0f2fe)] p-3 shadow-[0_12px_26px_rgba(14,165,233,0.12)] sm:grid">
                <Image
                  src="/Katlogo/datchyky_ta_elektronika.png"
                  alt="Комп'ютерна діагностика електроніки авто у Львові"
                  width={512}
                  height={512}
                  sizes="80px"
                  className="h-20 w-20 object-contain"
                />
              </figure>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-start gap-3 rounded-[18px] border border-amber-200 bg-[linear-gradient(135deg,#fffbeb,#fef3c7)] p-4 shadow-[0_10px_24px_rgba(245,158,11,0.12)]">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-white text-amber-600">
                  <Wallet size={16} strokeWidth={2} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.08em] text-amber-700">Вартість</p>
                  <p className="text-[15px] font-extrabold text-slate-900">За домовленістю</p>
                  <p className="text-[12.5px] font-medium text-slate-600">Після уточнення авто й симптомів.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-[18px] border border-teal-200 bg-[linear-gradient(135deg,#f0fdfa,#ccfbf1)] p-4 shadow-[0_10px_24px_rgba(20,184,166,0.1)]">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-teal-200 bg-white text-teal-600">
                  <MapPin size={16} strokeWidth={2} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.08em] text-teal-700">Виїзд</p>
                  <p className="text-[15px] font-extrabold text-slate-900">Від 500 грн</p>
                  <p className="text-[12.5px] font-medium text-slate-600">По Львову або за межі міста.</p>
                </div>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <a
                href={`tel:${DIAGNOSTICS_PHONE_RAW}`}
                aria-label={`Подзвонити Роману для запису на комп'ютерну діагностику: ${DIAGNOSTICS_PHONE_DISPLAY}`}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#0ea5e9,#0284c7_52%,#0d9488)] px-4 text-[14px] font-bold text-white shadow-[0_14px_28px_rgba(14,165,233,0.28)] transition hover:-translate-y-0.5 hover:brightness-105"
              >
                <Phone size={15} strokeWidth={2} aria-hidden="true" />
                Роман: {DIAGNOSTICS_PHONE_DISPLAY}
              </a>
              <a
                href={MAPS_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-sky-200 bg-white px-4 text-[13px] font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50"
              >
                <MapPin size={14} strokeWidth={2} aria-hidden="true" />
                {ADDRESS}
              </a>
            </div>
          </div>

          <aside
            aria-label="Запис на комп'ютерну діагностику авто"
            className="relative overflow-hidden rounded-[24px] border border-sky-100 bg-[linear-gradient(150deg,#ffffff_0%,#f8fafc_48%,#e0f2fe_100%)] p-4 shadow-[0_20px_44px_rgba(14,116,144,0.12)] ring-1 ring-white/80 sm:p-5"
          >
            <p className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[10.5px] font-black uppercase tracking-[0.12em] text-sky-800">
              <Wrench size={13} strokeWidth={2} aria-hidden="true" />
              Запис на діагностику
            </p>
            <h3 className="mt-2.5 text-[20px] leading-tight text-slate-900">
              Залиште заявку — уточнимо симптоми й час візиту
            </h3>
            <p className="mb-3 mt-1.5 text-[13px] font-medium leading-relaxed text-slate-600">
              Передзвонимо, підкажемо, що підготувати, зорієнтуємо щодо вартості та за потреби одразу
              підберемо запчастини після перевірки.
            </p>
            <DiagnosticsConsultationForm />
          </aside>
        </div>
      </Block>

      <Block id="systems" kicker="Системи авто" title="Що перевіряємо під час комп'ютерної діагностики">
        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Двигун і паливна система" icon={Gauge} tone="sky">
            <List>
              <Li icon={Activity}>Блок керування ECU: пропуски запалювання, суміш, датчики кисню, MAF/MAP, тиск палива, EGR, турбіна.</Li>
            </List>
          </Card>
          <Card title="Безпека та ходова" icon={ShieldCheck} tone="teal">
            <List>
              <Li tone="teal">ABS, ESP, SRS Airbag, електропідсилювач керма, гальмівні системи й датчики швидкості коліс.</Li>
            </List>
          </Card>
          <Card title="Трансмісія" icon={Cpu} tone="indigo">
            <List>
              <Li tone="indigo">АКПП, DSG, CVT, роботизовані коробки: температура, соленоїди, адаптації та аварійні режими.</Li>
            </List>
          </Card>
          <Card title="Комфортна електроніка" icon={Car} tone="cyan">
            <List>
              <Li tone="cyan">Клімат, парктроніки, світло, центральний замок, мережі CAN/LIN.</Li>
            </List>
          </Card>
        </div>
      </Block>

      <Block
        id="codes"
        kicker="Розшифрування"
        title="Типи кодів помилок OBD-II"
        lead="Перша літера коду підказує, у якій системі шукати несправність."
      >
        <DataTable
          caption="Типи кодів помилок OBD-II"
          head={['Код', 'Система', 'Що зачіпає']}
          rows={[
            ['P0 / P1', 'Силовий агрегат', 'Двигун, паливна система, запалювання, екологія, турбіна'],
            ['C', 'Шасі', 'Ходова, ABS, ESP, кермо, гальмівна електроніка'],
            ['B', 'Кузов', 'Кузовна електроніка, SRS Airbag, комфорт, клімат, салонні модулі'],
            ['U', 'Мережа', "Зв'язок між блоками, CAN/LIN, втрата комунікації, переривчасті несправності"],
          ]}
        />
      </Block>

      <Block id="process" kicker="Крок за кроком" title="Як проходить діагностика">
        <Steps
          steps={[
            { title: 'Підключення', text: "Підключаємо сканер до OBD-роз'єму й визначаємо доступні електронні блоки." },
            { title: 'Зчитування', text: 'Активні, збережені, очікувані та періодичні помилки плюс параметри в реальному часі.' },
            { title: 'Пояснення', text: 'Розповідаємо, що означають коди, які причини найімовірніші та що перевірити першим.' },
            { title: 'Підбір деталей', text: 'За потреби підбираємо датчики, котушки, свічки, фільтри, гальмівні й електричні компоненти.' },
          ]}
        />
      </Block>

      <Block id="when" kicker="Симптоми" title="Коли варто приїхати на діагностику">
        <Card title="Не відкладайте, якщо помітили" icon={AlertTriangle} tone="rose">
          <List className="grid gap-x-8 gap-y-2.5 space-y-0 md:grid-cols-2">
            <Li icon={AlertTriangle} tone="rose">Горить Check Engine, ABS, ESP, Airbag, EPC, DPF, акумулятор або індикатор коробки.</Li>
            <Li icon={Activity} tone="rose">Авто погано заводиться, троїть, втрачає тягу, зросла витрата пального або з&apos;явилися ривки.</Li>
            <Li icon={Gauge} tone="rose">Коробка переходить в аварійний режим, є затримки перемикання чи поштовхи.</Li>
            <Li icon={Car} tone="rose">Потрібна перевірка перед купівлею авто або після ремонту.</Li>
          </List>
        </Card>
      </Block>

      <Block
        id="brands"
        kicker="Сумісність"
        title="Марки та моделі, які можемо продіагностувати"
        lead="Працюємо з популярними європейськими, японськими, корейськими та американськими авто з підтримкою OBD-II/EOBD."
      >
        <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {BRANDS.map(({ brand, models }) => (
            <li
              key={brand}
              className="rounded-[16px] border border-slate-200/80 bg-white/90 px-4 py-3 shadow-[0_6px_16px_rgba(15,23,42,0.035)] transition-[border-color,box-shadow] duration-200 hover:border-sky-200 hover:shadow-[0_12px_24px_rgba(14,165,233,0.1)]"
            >
              <h3 className="text-[14.5px] text-slate-900">
                <span className="sr-only">Комп&apos;ютерна діагностика </span>
                {brand}
              </h3>
              <p className="mt-1 text-[12.5px] font-medium leading-relaxed text-slate-500">{models.join(' · ')}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 max-w-3xl text-[13.5px] font-medium leading-6 text-slate-500">
          Також перевіряємо інші моделі та модифікації. Для точного запису вкажіть марку, модель, рік
          випуску, двигун або VIN у формі консультації.
        </p>
      </Block>
    </>
  );
}
