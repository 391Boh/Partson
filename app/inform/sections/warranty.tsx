import { Award, CheckCircle, Clock, Info, Phone, Star } from 'lucide-react';

import {
  Block,
  Callout,
  Card,
  ContactButtons,
  InlineLink,
  Li,
  List,
  PartsOnLink,
  Prose,
  Steps,
  Strong,
  type TocItem,
} from '../ui';

export const toc: TocItem[] = [
  { id: 'terms', label: 'Гарантійні умови' },
  { id: 'claim', label: 'Як звернутися за гарантією' },
  { id: 'quality', label: 'Якість товарів' },
  { id: 'contacts', label: 'Контакти' },
];

export default function WarrantySection() {
  return (
    <>
      <Block id="terms" kicker="Гарантія" title="Гарантія на автозапчастини">
        <Prose>
          <p>
            Усі товари, що продаються в <PartsOnLink />, є <Strong>новими та оригінальними</Strong> або
            сертифікованими аналогами від перевірених постачальників.
          </p>
          <p>
            Гарантійний строк залежить від товарної групи й виробника — стандартно{' '}
            <Strong>від 12 місяців</Strong>. Точний строк для конкретної позиції уточнюйте в менеджера під час
            оформлення замовлення.
          </p>
        </Prose>
        <div className="info-content-grid mt-8 grid gap-6 md:grid-cols-2">
          <Card title="Гарантійний строк" icon={Clock} tone="teal">
            <List>
              <Li tone="teal">Стандартно — <Strong>від 12 місяців</Strong> залежно від виробника й категорії товару.</Li>
              <Li icon={Info} tone="teal">Точний строк визначає виробник — його фіксуємо під час оформлення.</Li>
            </List>
          </Card>
          <Callout tone="warn" title="Коли гарантія не діє">
            Гарантія не поширюється на дефекти, спричинені <Strong>неправильним монтажем</Strong> або{' '}
            <Strong>механічними пошкодженнями</Strong>. Тому встановлення відповідальних вузлів краще довіряти
            СТО.
          </Callout>
        </div>
      </Block>

      <Block id="claim" kicker="Крок за кроком" title="Як оформити гарантійне звернення">
        <Steps
          tone="teal"
          steps={[
            { title: "Зв'яжіться з менеджером", text: 'Телефоном або у Viber — опишіть проблему та вкажіть дату покупки.' },
            { title: 'Підготуйте товар', text: 'Деталь у вигляді, в якому вона надійшла, разом із документом про покупку.' },
            { title: 'Розгляд звернення', text: 'Перевіряємо звернення відповідно до умов виробника та погоджуємо подальші дії.' },
          ]}
        />
        <p className="mt-4 text-[14px] font-medium leading-6 text-slate-600">
          Якщо деталь просто не підійшла, скористайтеся умовами <InlineLink href="/inform/returns">повернення та обміну</InlineLink>.
        </p>
      </Block>

      <Block id="quality" kicker="Контроль якості" title="Як ми дбаємо про якість товарів">
        <div className="info-content-grid grid gap-6 md:grid-cols-2">
          <Card title="Перевірені бренди" icon={Star} tone="amber">
            <List>
              <Li tone="amber">Постачаємо лише <Strong>перевірені бренди</Strong> — виробників із підтвердженою якістю.</Li>
            </List>
          </Card>
          <Card title="Перевірка перед відправленням" icon={Award} tone="sky">
            <List>
              <Li icon={CheckCircle}>Кожне замовлення перевіряємо на комплектність і відповідність.</Li>
            </List>
          </Card>
        </div>
      </Block>

      <Block id="contacts" kicker="Підтримка" title="Контакти для гарантійних питань">
        <Card title="Менеджер PartsON" icon={Phone} tone="indigo">
          <ContactButtons />
        </Card>
      </Block>
    </>
  );
}
