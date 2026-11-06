import { ArrowRight, ScanLine } from "lucide-react";
import SmartLink from "app/components/SmartLink";
import OpenChatButton from "app/components/OpenChatButton";
import type { DirectorySection } from "app/lib/directory-appearance";

const content = {
  auto: {
    title: "Ваша деталь починається з правильного авто",
    description: "Марка й модель звужують пошук. Рік випуску, двигун та VIN допоможуть уточнити сумісність.",
    steps: [["Оберіть марку", "Скористайтеся пошуком або знайдіть знайомий логотип."], ["Уточніть модель", "Зіставте покоління та роки випуску свого автомобіля."], ["Перевірте деталь", "Звірте артикул і характеристики перед замовленням."]],
  },
  groups: {
    title: "Знайдіть деталь через потрібну систему авто",
    description: "Від загальної категорії переходьте до групи та підгрупи. Обраний розділ відкриє відповідні товари в каталозі.",
    steps: [["Оберіть систему", "Двигун, підвіска, гальма та інші напрямки каталогу."], ["Звузьте категорію", "Відкрийте потрібну групу або точнішу підгрупу."], ["Зіставте параметри", "Перевірте розміри, артикул і застосування деталі."]],
  },
  manufacturers: {
    title: "Зіставляйте бренд, артикул і характеристики",
    description: "Каталог виробника допоможе оглянути його асортимент за категоріями. Сумісність уточнюйте за даними конкретного товару.",
    steps: [["Знайдіть виробника", "Пошук працює за назвою бренду."], ["Відкрийте категорію", "Оберіть напрямок і перейдіть до товарів виробника."], ["Перевірте артикул", "Зіставте номер деталі та її технічні параметри."]],
  },
};

export default function DirectoryAssist({ section }: { section: DirectorySection }) {
  const copy = content[section];
  return (
    <aside className="directory-assist-shell" aria-label="Допомога з підбором запчастин">
      <div className="page-shell-inline">
        <div className="directory-assist">
          <div className="directory-assist-copy">
            <h2>{copy.title}</h2><p>{copy.description}</p>
            <div className="directory-assist-actions">
              <SmartLink href="/katalog" prefetchOnIntent>Відкрити каталог <ArrowRight size={17} aria-hidden="true" /></SmartLink>
              <OpenChatButton label="Допомога з підбором" title="Відкрити чат для підбору запчастин" className="directory-assist-chat" />
            </div>
          </div>
          <div className="directory-assist-details">
            <ol>{copy.steps.map(([title, text]) => <li key={title}><strong>{title}</strong><p>{text}</p></li>)}</ol>
            <p className="directory-assist-vin"><ScanLine size={19} aria-hidden="true" /><span>Для точнішого підбору підготуйте VIN, рік випуску та артикул.</span></p>
          </div>
        </div>
      </div>
    </aside>
  );
}
