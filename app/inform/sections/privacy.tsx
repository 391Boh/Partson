import {
  Building2,
  CheckCircle,
  Clock,
  CreditCard,
  Info,
  MessageCircle,
  Phone,
  RefreshCcw,
  ShieldCheck,
  Truck,
} from 'lucide-react';

import AnalyticsConsentSettingsButton from 'app/components/AnalyticsConsentSettingsButton';
import {
  Block,
  Callout,
  Card,
  DataTable,
  Li,
  List,
  PHONE_DISPLAY,
  PartsOnLink,
  Prose,
  Strong,
  type TocItem,
} from '../ui';

export const toc: TocItem[] = [
  { id: 'intro', label: 'Загальні положення' },
  { id: 'data', label: 'Які дані ми збираємо' },
  { id: 'sharing', label: 'Кому передаються дані' },
  { id: 'protection', label: 'Захист і ваші права' },
  { id: 'cookies', label: 'Cookies та аналітика' },
];

export default function PrivacySection() {
  return (
    <>
      <Block id="intro" kicker="Політика конфіденційності" title={<>Політика конфіденційності <PartsOnLink className="no-underline" /></>}>
        <Prose>
          <p>
            Ця політика пояснює, як <PartsOnLink /> обробляє персональні дані клієнтів і відвідувачів
            сайту під час пошуку автозапчастин, оформлення замовлення, оплати, доставки, консультацій
            та звернень у чат або телефоном.
          </p>
          <p>
            Ми обробляємо дані відповідно до <Strong>Закону України «Про захист персональних даних»</Strong>{' '}
            та, коли це застосовно, з урахуванням принципів GDPR: законність, прозорість, мінімізація
            даних, обмеження мети, точність, захист і відповідальне зберігання.
          </p>
        </Prose>
        <Callout tone="info" title="Коротко" className="mt-5">
          Ми збираємо лише те, що потрібно для виконання замовлення, не зберігаємо реквізити картки та{' '}
          <Strong>не продаємо персональні дані</Strong> третім особам.
        </Callout>
      </Block>

      <Block id="data" kicker="Обсяг даних" title="Які дані ми можемо збирати і навіщо">
        <DataTable
          caption="Категорії персональних даних та мета їх обробки"
          head={['Категорія', 'Приклади', 'Для чого']}
          rows={[
            ['Контактні дані', "Ім'я, номер телефону, email", 'Оформлення замовлення, консультації, повідомлення про статус'],
            ['Дані авто', 'Марка, модель, рік, модифікація, VIN, артикул або код деталі', 'Перевірка сумісності, підбір аналогів, уточнення ціни й наявності'],
            ['Дані доставки', 'Місто, відділення перевізника, адреса у Львові, спосіб отримання', 'Відправлення або видача замовлення'],
            ['Дані оплати', 'Статус платежу, номер транзакції', 'Підтвердження оплати, повернення коштів, облік. Реквізити картки не зберігаються'],
          ]}
        />
        <p className="mt-3 max-w-3xl text-[13.5px] font-medium leading-6 text-slate-500">
          Дані також використовуються для виконання вимог бухгалтерського, податкового, споживчого та
          іншого застосовного законодавства.
        </p>
      </Block>

      <Block id="sharing" kicker="Передача даних" title="Кому можуть передаватися дані">
        <Card title="Лише в межах необхідного" icon={Truck} tone="amber">
          <List className="info-content-grid grid gap-x-8 gap-y-5 space-y-0 md:grid-cols-2">
            <Li icon={Truck} tone="amber">Службам доставки: Нова Пошта, Укрпошта, Meest або іншим перевізникам, яких обирає клієнт.</Li>
            <Li icon={CreditCard} tone="amber">Платіжним сервісам і банкам для проведення онлайн-оплати або повернення коштів.</Li>
            <Li icon={MessageCircle} tone="amber">Google Customer Reviews — email, номер замовлення, країна та очікувана дата доставки для показу добровільної пропозиції залишити відгук.</Li>
            <Li icon={Building2} tone="amber">Постачальникам, сервісним партнерам, бухгалтерам і технічним провайдерам сайту.</Li>
            <Li icon={ShieldCheck} tone="amber">Державним органам — лише у випадках, прямо передбачених законом.</Li>
          </List>
        </Card>
      </Block>

      <Block id="protection" kicker="Безпека" title="Захист, строки зберігання та ваші права">
        <div className="info-content-grid grid gap-6 md:grid-cols-2">
          <Card title="Захист і строки зберігання" icon={ShieldCheck} tone="indigo">
            <List>
              <Li icon={ShieldCheck} tone="indigo">Організаційні та технічні заходи захисту від втрати, несанкціонованого доступу або розголошення.</Li>
              <Li icon={Clock} tone="indigo">Дані зберігаються стільки, скільки потрібно для замовлення, гарантійного супроводу, обліку та законних інтересів PartsON.</Li>
              <Li icon={RefreshCcw} tone="indigo">Після цього дані видаляються, знеособлюються або архівуються відповідно до закону.</Li>
            </List>
          </Card>
          <Card title="Ваші права" icon={RefreshCcw} tone="rose">
            <List>
              <Li tone="rose">Отримати інформацію про обробку ваших персональних даних.</Li>
              <Li tone="rose">Попросити виправити, оновити, обмежити обробку або видалити дані, якщо це не суперечить закону.</Li>
              <Li tone="rose">Відкликати згоду на комунікації або заперечити проти окремих видів обробки.</Li>
              <Li icon={Phone} tone="rose">Звернутися телефоном {PHONE_DISPLAY} або на email romaniukbboogg@gmail.com.</Li>
            </List>
          </Card>
        </div>
      </Block>

      <Block id="cookies" kicker="Cookies" title="Cookies, аналітика та зміни політики">
        <Card title="Ви керуєте згодою" icon={Info} tone="slate">
          <List>
            <Li icon={Info} tone="slate">Сайт використовує необхідні технології для роботи сервісу та, лише за вашим окремим вибором, Google Analytics для оцінки відвідуваності, пошуку й етапів оформлення замовлення.</Li>
            <Li icon={ShieldCheck} tone="slate">Рекламні технології Google, зберігання рекламних ідентифікаторів і персоналізація дозволяються лише після окремої згоди. До вибору необов&apos;язкові Google-теги не завантажуються.</Li>
            <Li icon={CheckCircle} tone="slate">Згоду на аналітику й рекламні дані можна надати, відхилити або відкликати незалежно в будь-який момент.</Li>
            <Li icon={Clock} tone="slate">Політика може оновлюватися при зміні сервісів або законодавства. Актуальна версія завжди доступна на цій сторінці.</Li>
          </List>
          <AnalyticsConsentSettingsButton
            label="Змінити налаштування cookies"
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 px-4 text-[13px] font-bold text-sky-800 transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-100"
          />
        </Card>
      </Block>
    </>
  );
}
