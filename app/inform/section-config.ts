import type { Metadata } from "next";
import {
  STORE_ADDRESS_SEO_LABEL,
  appendSeoContact,
  buildPageMetadata,
  trimSeoDescription,
} from "app/lib/seo-metadata";

export type InformationSectionKey =
  | "delivery"
  | "payment"
  | "about"
  | "location"
  | "privacy"
  | "warranty"
  | "returns"
  | "diagnostics";

type InformationSection = {
  key: InformationSectionKey;
  title: string;
  subtitle: string;
  seoTitle: string;
  seoDescription: string;
  keywords: string[];
};

export const DEFAULT_INFORMATION_SECTION: InformationSectionKey = "delivery";

export const informationSections: InformationSection[] = [
  {
    key: "delivery",
    title: "Доставка",
    subtitle: "У Львові та по Україні",
    seoTitle: "Доставка автозапчастин у Львові та по Україні",
    seoDescription: appendSeoContact(
      "Доставка автозапчастин PartsON у Львові: самовивіз з магазину, відправлення Новою Поштою, Укрпоштою або Meest у кожне місто України."
    ),
    keywords: [
      "доставка автозапчастин",
      "доставка PartsON",
      "автозапчастини доставка по Україні",
      "доставка автозапчастин по Україні",
      "доставка запчастин у кожне місто України",
      "доставка автозапчастин львів",
      "доставка запчастин львів",
      "автозапчастини львів доставка",
      "доставка автозапчастин нова пошта",
      "самовивіз автозапчастин",
      "самовивіз автозапчастин львів",
    ],
  },
  {
    key: "payment",
    title: "Оплата",
    subtitle: "Карта та готівка",
    seoTitle: "Оплата автозапчастин у PartsON",
    seoDescription: appendSeoContact(
      "Оплата автозапчастин у PartsON: картка онлайн, післяплата при отриманні, готівка у Львові та безготівковий рахунок для СТО, ФОП і компаній."
    ),
    keywords: [
      "оплата автозапчастин",
      "післяплата автозапчастини",
      "онлайн оплата PartsON",
      "безготівковий рахунок автозапчастини",
      "оплата автозапчастин львів",
      "купити автозапчастини з післяплатою",
      "оплата запчастин картою",
    ],
  },
  {
    key: "about",
    title: "Про нас",
    subtitle: "Детально",
    seoTitle: "PartsON — магазин автозапчастин у Львові",
    seoDescription: appendSeoContact(
      "PartsON - магазин автозапчастин у Львові з понад 20 роками досвіду, підбором за VIN, артикулом, кодом і маркою авто, оригінальними деталями та перевіреними аналогами."
    ),
    keywords: [
      "про PartsON",
      "магазин автозапчастин PartsON",
      "магазин запчастин",
      "магазин зачастин",
      "автозапчастини львів PartsON",
      "автозапчастини перфецького 8",
      "підбір автозапчастин по VIN",
      "підбір запчастин за артикулом",
      "оригінальні автозапчастини львів",
      "аналоги автозапчастин львів",
      "консультація автозапчастини",
    ],
  },
  {
    key: "location",
    title: "Локація",
    subtitle: "Адреса, карта і самовивіз",
    seoTitle: "Адреса магазину автозапчастин у Львові",
    seoDescription: appendSeoContact(
      "Локація PartsON у Львові: адреса магазину, карта проїзду, маршрут, графік роботи, контакти для зв'язку та умови самовивозу замовлень."
    ),
    keywords: [
      "контакти PartsON",
      "адреса PartsON Львів",
      "вулиця Перфецького 8",
      "вул Перфецького 8 Львів",
      "адреса магазину PartsON",
      "адреса магазину автозапчастин Львів",
      "магазин автозапчастин львів адреса",
      "магазин автозапчастин перфецького",
      "магазин автозапчастин Львів",
      "адреса магазину автозапчастин",
      "локація автозапчастини",
      "локація магазину автозапчастин",
      "карта проїзду PartsON",
      "як доїхати PartsON",
      "маршрут до магазину автозапчастин",
      "пункт самовивозу автозапчастин львів",
      "контакти магазину автозапчастин львів",
      "вулиця магазину автозапчастин",
      "самовивіз partsON львів",
      "магазин запчастин сихів львів",
    ],
  },
  {
    key: "privacy",
    title: "Конфіденційність",
    subtitle: "Дані та безпека",
    seoTitle: "Політика конфіденційності",
    seoDescription: appendSeoContact(
      "Політика конфіденційності PartsON: які дані ми збираємо, як обробляємо замовлення, кому передаємо інформацію, як захищаємо клієнтів і їхні права."
    ),
    keywords: [
      "політика конфіденційності PartsON",
      "захист персональних даних",
      "персональні дані PartsON",
      "обробка персональних даних",
      "конфіденційність інтернет-магазин",
      "права користувача персональні дані",
      "конфіденційність замовлення автозапчастин",
      "захист даних клієнтів PartsON",
    ],
  },
  {
    key: "warranty",
    title: "Гарантія",
    subtitle: "Умови та строки",
    seoTitle: "Гарантія на автозапчастини",
    seoDescription: appendSeoContact(
      "Гарантія на автозапчастини у PartsON: строки залежно від виробника, порядок звернення, перевірка документів і захист покупця після замовлення."
    ),
    keywords: [
      "гарантія автозапчастини",
      "гарантія PartsON",
      "гарантійне обслуговування автозапчастин",
      "умови гарантії",
      "якість автозапчастин",
      "гарантія запчастини львів",
      "гарантія на запчастини по Україні",
      "гарантійне звернення автозапчастини",
    ],
  },
  {
    key: "returns",
    title: "Повернення",
    subtitle: "Повернення і обмін",
    seoTitle: "Умови повернення автозапчастин",
    seoDescription: appendSeoContact(
      "Повернення й обмін автозапчастин у PartsON: строки, вимоги до стану товару, документи та проста процедура оформлення заявки."
    ),
    keywords: [
      "повернення автозапчастин",
      "обмін автозапчастин",
      "умови повернення PartsON",
      "права покупця автозапчастини",
      "повернення товару автозапчастини",
      "повернення запчастин львів",
      "обмін запчастин львів",
      "повернення автозапчастин по Україні",
    ],
  },
  {
    key: "diagnostics",
    title: "Діагностика",
    subtitle: "OBD, помилки, електроніка",
    seoTitle: "Комп'ютерна діагностика авто у Львові | OBD та Check Engine",
    seoDescription: trimSeoDescription(
      `☎️ +38 (093) 480-42-61. ${STORE_ADDRESS_SEO_LABEL}. OBD-II діагностика авто у Львові: Check Engine, ECU, ABS, ESP, SRS, АКПП, помилки й підбір запчастин.`
    ),
    keywords: [
      "комп'ютерна діагностика авто львів",
      "компютерна діагностика авто львів",
      "комп'ютерна діагностика автомобіля",
      "компютерна діагностика автомобіля",
      "діагностика авто львів",
      "OBD діагностика Львів",
      "OBD2 діагностика авто",
      "check engine львів",
      "діагностика помилок авто",
      "розшифрування помилок авто",
      "зчитування помилок авто львів",
      "діагностика ECU",
      "діагностика ABS",
      "діагностика ESP",
      "діагностика SRS airbag",
      "діагностика АКПП",
      "діагностика датчиків авто",
      "діагностика двигуна",
      "діагностика електроніки авто",
      "діагностика авто перед купівлею львів",
      "скинути помилки авто львів",
      "адаптація після ремонту авто",
      "автодіагностика львів",
      "комп'ютерна діагностика перфецького",
      "діагностика авто з виїздом львів",
      "виїзна діагностика авто львів",
      "комп'ютерна діагностика ціна львів",
      "комп'ютерна діагностика львів перфецького 8",
      "діагностика авто львів перфецького",
    ],
  },
];

export const getInformationSection = (key?: string | null) =>
  informationSections.find((section) => section.key === key) || null;

export const getInformationPath = (key: InformationSectionKey) => `/inform/${key}`;

export const getInformationMetadata = (key: InformationSectionKey): Metadata => {
  const section = getInformationSection(key) || getInformationSection(DEFAULT_INFORMATION_SECTION);
  const resolvedKey = section?.key || DEFAULT_INFORMATION_SECTION;
  const title = section?.seoTitle || "Інформація";
  const description =
    section?.seoDescription ||
    "Інформаційні сторінки PartsON: доставка, оплата, контакти та інформація про магазин автозапчастин.";
  const canonicalPath = getInformationPath(resolvedKey);

  return buildPageMetadata({
    title,
    description,
    canonicalPath,
    keywords: section?.keywords || [],
    openGraphTitle: `${title} | PartsON`,
    image: {
      url:
        resolvedKey === "diagnostics"
          ? "/Katlogo/datchyky_ta_elektronika.png"
          : "/Car-parts-fullwidth.png",
      width: resolvedKey === "diagnostics" ? 512 : 1200,
      height: resolvedKey === "diagnostics" ? 512 : 630,
      alt: `${title} | PartsON`,
    },
  });
};
