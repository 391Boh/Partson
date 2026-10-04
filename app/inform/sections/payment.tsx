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
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.55fr)]">
          <Steps
            tone="teal"
            steps={[
              { title: 'Оформіть замовлення', text: 'Оберіть оплату карткою онлайн на етапі оформлення.' },
              { title: 'Оплатіть у LiqPay', text: 'Дані картки вводяться безпосередньо у захищеній формі LiqPay.' },
              { title: 'Отримайте підтвердження', text: 'Замовлення стає оплаченим після успішного статусу від LiqPay.' },
            ]}
          />
          <a
            href="https://www.liqpay.ua/"
            target="_blank"
            rel="noreferrer"
            aria-label="Офіційний сайт LiqPay"
            className="group flex flex-col items-center justify-center gap-3 rounded-[20px] border border-teal-100 bg-[radial-gradient(circle_at_100%_0%,rgba(52,211,153,0.16),transparent_45%),linear-gradient(145deg,#ffffff,#f0fdfa)] p-6 text-center shadow-[0_14px_34px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-[0_18px_40px_rgba(16,185,129,0.12)]"
          >
            <Image src="/liqpay-logo.svg" alt="LiqPay" width={500} height={104} className="h-7 w-auto" />
            <span className="text-[12.5px] font-semibold leading-5 text-slate-600">
              Visa · Mastercard — оплата у захищеній формі LiqPay
            </span>
          </a>
        </div>
        <Callout tone="info" title="Ваші платіжні дані в безпеці" className="mt-4">
          PartsON не отримує і не зберігає номер картки, строк її дії або CVV-код. Комісія платіжного
          сервісу не додається до вартості замовлення.
        </Callout>
      </Block>

      <Block id="business" kicker="B2B" title="Безготівковий розрахунок для СТО, ФОП і компаній">
        <div className="grid gap-4 md:grid-cols-2">
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
