import Image from 'next/image';
import { Award, Building2, CheckCircle, FileText, ShieldCheck } from 'lucide-react';

import {
  Block,
  Callout,
  Card,
  DataTable,
  InlineLink,
  Li,
  List,
  Steps,
  Strong,
  type TocItem,
} from '../ui';

export const toc: TocItem[] = [
  { id: 'methods', label: 'Способи оплати' },
  { id: 'online', label: 'Онлайн-оплата через LiqPay' },
  { id: 'business', label: 'Для СТО, ФОП і компаній' },
];

export default function PaymentSection() {
  return (
    <>
      <Block
        id="methods"
        kicker="Порівняння"
        title="Способи оплати автозапчастин"
        lead="Оплачуйте замовлення онлайн, під час отримання або за безготівковим рахунком — спосіб можна узгодити з менеджером перед відправленням."
      >
        <DataTable
          caption="Способи оплати в PartsON"
          head={['Спосіб', 'Для кого', 'Як це працює']}
          rows={[
            ['Картка онлайн (Visa / Mastercard)', 'Усі клієнти', 'Захищена платіжна форма LiqPay, без додаткової комісії'],
            ['Післяплата', 'Доставка Новою Поштою', "Оплата у відділенні або кур'єру після огляду товару"],
            ['Оплата в магазині', 'Самовивіз у Львові', 'Розрахунок під час отримання замовлення на Перфецького, 8'],
            ['Безготівковий рахунок', 'СТО, ФОП, компанії', 'Рахунок і повний пакет супровідних документів'],
          ]}
        />
      </Block>

      <Block id="online" kicker="Платіжний партнер" title="Захищена онлайн-оплата через LiqPay">
        <Steps
          steps={[
            { title: 'Оформіть замовлення', text: 'Оберіть оплату карткою онлайн на етапі оформлення.' },
            { title: 'Оплатіть у LiqPay', text: 'Дані картки вводяться безпосередньо у захищеній формі LiqPay.' },
            { title: 'Отримайте підтвердження', text: 'Замовлення стає оплаченим після успішного статусу від LiqPay.' },
          ]}
        />
        <div className="info-content-grid mt-8 grid gap-6 md:grid-cols-[minmax(0,1fr)_220px] md:items-stretch">
          <Callout tone="info" title="Ваші платіжні дані в безпеці" className="max-w-none">
            PartsON не отримує і не зберігає номер картки, строк її дії або CVV-код. Комісія платіжного
            сервісу не додається до вартості замовлення.
          </Callout>
          <a
            href="https://www.liqpay.ua/"
            target="_blank"
            rel="noreferrer"
            aria-label="Офіційний сайт LiqPay"
            className="flex flex-col items-center justify-center gap-2.5 rounded-[16px] border border-[#d9e3ec] bg-white/90 p-4 text-center transition-colors hover:border-teal-200"
          >
            <Image src="/liqpay-logo.svg" alt="LiqPay" width={500} height={104} className="h-6 w-auto" />
            <span className="info-read info-read-muted text-[13.5px] leading-5">Visa та Mastercard</span>
          </a>
        </div>
      </Block>

      <Block id="business" kicker="B2B" title="Безготівковий розрахунок для СТО, ФОП і компаній">
        <div className="info-content-grid grid gap-6 md:grid-cols-2">
          <Card title="Документи для бізнесу" icon={Building2} tone="sky">
            <List>
              <Li icon={FileText}>Повний пакет документів для <Strong>СТО, ФОП та компаній</Strong>.</Li>
              <Li icon={Award}>Рахунок, накладна, акт виконаних робіт.</Li>
              <Li icon={CheckCircle}>Реквізити та перелік документів узгоджуються з менеджером.</Li>
            </List>
          </Card>
          <Card title="Оплата при отриманні" icon={ShieldCheck} tone="amber">
            <List>
              <Li tone="amber">Оплата <Strong>у відділенні Нової Пошти</Strong> або кур&apos;єру після огляду.</Li>
              <Li tone="amber">Умови повернення — на сторінці <InlineLink href="/inform/returns">«Повернення»</InlineLink>, тарифи перевізників — у розділі <InlineLink href="/inform/delivery">«Доставка»</InlineLink>.</Li>
            </List>
          </Card>
        </div>
      </Block>
    </>
  );
}
