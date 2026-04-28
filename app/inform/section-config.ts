import type { Metadata } from "next";
import { buildPageMetadata } from "app/lib/seo-metadata";

export type InformationSectionKey =
  | "delivery"
  | "payment"
  | "about"
  | "location"
  | "privacy";

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
    seoTitle: "Доставка автозапчастин по Львову та Україні",
    seoDescription:
      "Умови доставки автозапчастин PartsON по Львову та Україні: перевізники, строки відправлення, самовивіз і рекомендації при отриманні замовлення.",
    keywords: [
      "доставка автозапчастин",
      "доставка PartsON",
      "автозапчастини доставка по Україні",
      "доставка автозапчастин львів",
      "магазин автозапчастин перфецького",
      "самовивіз автозапчастин",
    ],
  },
  {
    key: "payment",
    title: "Оплата",
    subtitle: "Карта та готівка",
    seoTitle: "Оплата автозапчастин у PartsON",
    seoDescription:
      "Способи оплати автозапчастин у PartsON: онлайн-оплата карткою, післяплата, безготівковий рахунок для СТО, ФОП та компаній.",
    keywords: [
      "оплата автозапчастин",
      "післяплата автозапчастини",
      "онлайн оплата PartsON",
      "безготівковий рахунок автозапчастини",
    ],
  },
  {
    key: "about",
    title: "Про нас",
    subtitle: "Детально",
    seoTitle: "Магазин автозапчастин PartsON у Львові",
    seoDescription:
      "Інформація про магазин автозапчастин PartsON: професійний підбір деталей, консультації по сумісності, підбір по VIN і супровід замовлення.",
    keywords: [
      "про PartsON",
      "магазин автозапчастин PartsON",
      "магазин запчастин",
      "магазин зачастин",
      "магазин автозапчастин львів",
      "підбір автозапчастин по VIN",
      "консультація автозапчастини",
    ],
  },
  {
    key: "location",
    title: "Локація",
    subtitle: "Адреса, карта і самовивіз",
    seoTitle: "Адреса магазину автозапчастин PartsON у Львові",
    seoDescription:
      "Магазин автозапчастин PartsON у Львові розташований на вул. Перфецького, 8. На сторінці локації зібрані адреса магазину, карта проїзду, маршрут, графік роботи, контакти для швидкого зв'язку та умови самовивозу замовлень.",
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
      "самовивіз автозапчастин львів",
      "пункт самовивозу автозапчастин львів",
      "контакти магазину автозапчастин львів",
      "вулиця магазину автозапчастин",
    ],
  },
  {
    key: "privacy",
    title: "Конфіденційність",
    subtitle: "Дані та безпека",
    seoTitle: "Політика конфіденційності PartsON",
    seoDescription:
      "Політика конфіденційності PartsON: які персональні дані ми збираємо, для чого обробляємо, кому передаємо, як захищаємо та як користувач може реалізувати свої права.",
    keywords: [
      "політика конфіденційності PartsON",
      "захист персональних даних",
      "персональні дані PartsON",
      "обробка персональних даних",
      "конфіденційність інтернет-магазин",
      "права користувача персональні дані",
    ],
  },
];

export const getInformationSection = (key?: string | null) =>
  informationSections.find((section) => section.key === key) || null;

export const getInformationPath = (key: InformationSectionKey) => `/inform/${key}`;

export const getInformationMetadata = (key: InformationSectionKey): Metadata => {
  const section = getInformationSection(key) || getInformationSection(DEFAULT_INFORMATION_SECTION);
  const resolvedKey = section?.key || DEFAULT_INFORMATION_SECTION;
  const title = `${section?.seoTitle || "Інформація"} | PartsON`;
  const description =
    section?.seoDescription ||
    "Інформаційні сторінки PartsON: доставка, оплата, контакти та інформація про магазин автозапчастин.";
  const canonicalPath = getInformationPath(resolvedKey);

  return buildPageMetadata({
    title,
    description,
    canonicalPath,
    keywords: section?.keywords || [],
    openGraphTitle: title,
    image: {
      url: "/Car-parts-fullwidth.png",
      alt: title,
    },
  });
};
