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

            <dl className="info-read max-w-[42rem] divide-y divide-[#d9e3ec] border-y border-[#d9e3ec]">
              {[
                { icon: Wallet, term: 'Вартість', value: 'За домовленістю', note: 'після уточнення авто й симптомів' },
                { icon: MapPin, term: 'Виїзд', value: 'Від 500 грн', note: 'по Львову або за межі міста' },
              ].map(({ icon: TermIcon, term, value, note }) => (
                <div key={term} className="flex items-start gap-3 py-3.5">
                  <TermIcon size={18} strokeWidth={1.9} className="mt-[3px] shrink-0 text-sky-600" aria-hidden="true" />
                  <dt className="w-24 shrink-0 text-[15.5px]">{term}</dt>
                  <dd className="min-w-0 text-[15.5px]">
                    <strong>{value}</strong> — {note}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <a
                href={`tel:${DIAGNOSTICS_PHONE_RAW}`}
                aria-label={`Подзвонити Роману для запису на комп'ютерну діагностику: ${DIAGNOSTICS_PHONE_DISPLAY}`}
                className="inline-flex min-h-12 items-center gap-2 whitespace-nowrap rounded-xl bg-[linear-gradient(135deg,#0369a1_0%,#0284c7_55%,#0d9488_100%)] px-5 text-[15px] font-bold text-white shadow-[0_12px_24px_rgba(14,165,233,0.22)] transition hover:brightness-110"
              >
                <Phone size={16} strokeWidth={2} aria-hidden="true" />
                Роман: {DIAGNOSTICS_PHONE_DISPLAY}
              </a>
              <a
                href={MAPS_URL}
                target="_blank"
                rel="noreferrer"
                className="info-read inline-flex items-center gap-2 text-[15px] !text-[#13202f] underline decoration-sky-300/70 underline-offset-4 transition hover:decoration-sky-500"
              >
                <MapPin size={16} strokeWidth={2} className="shrink-0 text-sky-600" aria-hidden="true" />
                {ADDRESS}
              </a>
            </div>
          </div>

          <aside
            aria-label="Запис на комп'ютерну діагностику авто"
            className="rounded-[22px] border border-sky-100 bg-white/90 p-5 shadow-[0_18px_40px_rgba(14,116,144,0.1)] sm:p-6"
          >
            <h3 className="flex items-start gap-2.5 text-[20px] leading-tight text-[#13202f]">
              <Wrench size={20} strokeWidth={1.9} className="mt-0.5 shrink-0 text-sky-600" aria-hidden="true" />
              Запис на діагностику
            </h3>
            <p className="info-read mb-4 mt-2 text-[15px] leading-[1.65]">
              Залиште телефон і коротко опишіть, що турбує. Передзвонимо, узгодимо час візиту й
              підкажемо, що підготувати.
            </p>
            <DiagnosticsConsultationForm />
          </aside>
        </div>
      </Block>

      <Block id="systems" kicker="Системи авто" title="Що перевіряємо під час комп'ютерної діагностики">
        <div className="info-content-grid grid gap-6 md:grid-cols-2">
          <Card title="Двигун і паливна система" icon={Gauge} tone="sky">
            Блок керування ECU: пропуски запалювання, суміш, датчики кисню, MAF/MAP, тиск палива, EGR, турбіна.
          </Card>
          <Card title="Безпека та ходова" icon={ShieldCheck} tone="teal">
            ABS, ESP, SRS Airbag, електропідсилювач керма, гальмівні системи й датчики швидкості коліс.
          </Card>
          <Card title="Трансмісія" icon={Cpu} tone="indigo">
            АКПП, DSG, CVT, роботизовані коробки: температура, соленоїди, адаптації та аварійні режими.
          </Card>
          <Card title="Комфортна електроніка" icon={Car} tone="cyan">
            Клімат, парктроніки, світло, центральний замок, мережі CAN/LIN.
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
          <List className="info-content-grid grid gap-x-8 gap-y-5 space-y-0 md:grid-cols-2">
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
        <ul className="grid overflow-hidden rounded-[18px] border border-[#d9e3ec] bg-white/80 sm:grid-cols-2 xl:grid-cols-3">
          {BRANDS.map(({ brand, models }) => (
            <li key={brand} className="-mb-px -mr-px border-b border-r border-[#e6edf3] px-4 py-3 sm:px-5">
              <h3 className="text-[15.5px] text-[#13202f]">
                <span className="sr-only">Комп&apos;ютерна діагностика </span>
                {brand}
              </h3>
              <p className="info-read info-read-muted mt-0.5 text-[14px] leading-[1.55]">{models.join(', ')}</p>
            </li>
          ))}
        </ul>
        <p className="info-read info-read-muted mt-4 max-w-[42rem] text-[14.5px] leading-[1.65]">
          Також перевіряємо інші моделі та модифікації. Для точного запису вкажіть марку, модель, рік
          випуску, двигун або VIN у формі консультації.
        </p>
      </Block>
    </>
  );
}
