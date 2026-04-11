import type { Metadata } from "next";
import { buildPageMetadata } from "app/lib/seo-metadata";

export type InformationSectionKey = "delivery" | "payment" | "about" | "location";

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
      "магазин автозапчастин львів",
      "підбір автозапчастин по VIN",
      "консультація автозапчастини",
    ],
  },
  {
    key: "location",
    title: "Локація",
    subtitle: "Контакти",
    seoTitle: "Адреса магазину автозапчастин PartsON у Львові",
    seoDescription:
      "Контакти магазину PartsON, адреса у Львові, графік роботи та швидкий зв'язок для консультацій щодо замовлень і підбору автозапчастин.",
    keywords: [
      "контакти PartsON",
      "адреса PartsON Львів",
      "магазин автозапчастин Львів",
      "адреса магазину автозапчастин",
      "локація автозапчастини",
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
