import { CheckCircle, FileText, Package, Phone } from 'lucide-react';

import {
  Block,
  Callout,
  Card,
  ContactButtons,
  DataTable,
  InlineLink,
  Li,
  List,
  Prose,
  Steps,
  Strong,
  type TocItem,
} from '../ui';

export const toc: TocItem[] = [
  { id: 'terms', label: 'Строки повернення' },
  { id: 'requirements', label: 'Вимоги до товару' },
  { id: 'procedure', label: 'Як оформити повернення' },
  { id: 'contacts', label: 'Контакти' },
];

export default function ReturnsSection() {
  return (
    <>
      <Block id="terms" kicker="Умови" title="Умови повернення та обміну автозапчастин">
        <Prose>
          <p>
            Повернення та обмін здійснюються відповідно до{' '}
            <Strong>Закону України «Про захист прав споживачів»</Strong>. Якщо товар не підійшов або
            виявився дефектним, зверніться до менеджера — ми перевіримо умови та підкажемо найзручніший
            спосіб повернення.
          </p>
        </Prose>
        <div className="mt-5">
          <DataTable
            caption="Строки повернення автозапчастин"
            head={['Ситуація', 'Строк', 'Що потрібно']}
            rows={[
              ['Деталь не підійшла (товар належної якості)', <Strong key="s">14 днів з дати отримання</Strong>, 'Товар не встановлювався, збережені вигляд, комплектація, упаковка та документи'],
              ['Виробничий дефект (товар неналежної якості)', 'Протягом гарантійного строку', <>Звернення за <InlineLink key="w" href="/inform/warranty">гарантійними умовами</InlineLink> та документ про покупку</>],
            ]}
          />
        </div>
      </Block>

      <Block id="requirements" kicker="Стан товару" title="Вимоги до товару для повернення">
        <div className="info-content-grid grid gap-6 md:grid-cols-2">
          <Card title="Товар має бути" icon={Package} tone="cyan">
            <List>
              <Li tone="cyan">У <Strong>незміненому вигляді</Strong>: не встановлювався і не монтувався.</Li>
              <Li tone="cyan">Із заводською упаковкою та повною комплектацією.</Li>
            </List>
          </Card>
          <Card title="Документи" icon={FileText} tone="sky">
            <List>
              <Li>Збережіть документ, що підтверджує покупку: накладну, квитанцію або чек.</Li>
            </List>
          </Card>
        </div>
        <Callout tone="warn" title="Винятки" className="mt-4">
          Деякі категорії товарів, зокрема електронні компоненти, можуть мати обмеження повернення згідно
          із законодавством. Точні умови для конкретної позиції уточнюйте в менеджера перед покупкою.
        </Callout>
      </Block>

      <Block id="procedure" kicker="Крок за кроком" title="Як оформити повернення або обмін">
        <Steps
          tone="rose"
          steps={[
            { title: 'Не встановлюйте деталь', text: 'Якщо запчастина не підійшла, збережіть її в стані, у якому вона надійшла.' },
            { title: "Зв'яжіться з менеджером", text: 'Телефоном або у Viber — узгодимо умови та деталі повернення.' },
            { title: 'Передайте товар', text: 'Самовивіз у Львові або відправлення перевізником — узгоджуємо індивідуально.' },
            { title: 'Отримайте кошти або обмін', text: 'Після підтвердження стану й комплектності поверненої позиції.' },
          ]}
        />
      </Block>

      <Block id="contacts" kicker="Підтримка" title="Контакти для звернень щодо повернення">
        <Card title="Менеджер PartsON" icon={Phone} tone="indigo">
          <p className="mb-4 flex items-start gap-2">
            <CheckCircle size={16} className="mt-1.5 shrink-0 text-teal-500" aria-hidden="true" />
            Опишіть ситуацію й номер замовлення — підкажемо найшвидший варіант повернення чи обміну.
          </p>
          <ContactButtons />
        </Card>
      </Block>
    </>
  );
}
