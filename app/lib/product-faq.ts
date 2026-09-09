// Single source of truth for the product page's FAQ content — both the
// visible accordion (ProductFaqSection.tsx) and the FAQPage JSON-LD render
// from this same list, so the structured data always matches what's
// actually on the page (a mismatch there is a known Google Search Console
// flag, not just a cosmetic risk).
export type ProductFaqItem = {
  question: string;
  answer: string;
};

export const buildProductFaqItems = (options: {
  name: string;
  producer: string;
  group: string;
  subGroup: string;
  hasPrice: boolean;
  quantity: number;
}): ProductFaqItem[] => {
  const { name, producer, group, subGroup, hasPrice, quantity } = options;
  const productLabel = name || "цього товару";
  const producerLabel = producer || "виробника";
  const groupLabel = subGroup || group || "запчастин";
  const availLabel =
    quantity > 0 ? `є в наявності ${quantity} шт` : "доступний під замовлення";

  return [
    {
      question: `Як замовити ${productLabel} у Львові?`,
      answer: hasPrice
        ? `Додайте ${productLabel} у кошик прямо на сторінці. Оплата: готівка, картка (термінал), онлайн або безготівково для юридичних осіб. Доставка Нова Пошта, Укрпошта, Meest по Україні або самовивіз у Львові.`
        : `Для уточнення ціни на ${productLabel} надішліть запит менеджеру через чат. Ми підберемо оптимальний варіант від перевіреного постачальника.`,
    },
    {
      question: `Як перевірити сумісність ${productLabel} з моїм авто?`,
      answer: `Для перевірки сумісності ${productLabel} від ${producerLabel} надайте VIN-код або марку, модель і рік авто. Менеджер PartsON безкоштовно підбере запчастину категорії ${groupLabel}. Підбір також за оригінальним артикулом або кодом.`,
    },
    {
      question: `Яка наявність і терміни доставки ${productLabel}?`,
      answer: `Зараз ${productLabel} ${availLabel}. Доставка по Львову — кур'єром у день замовлення. По Україні — Нова Пошта, Укрпошта або Meest, 1–3 дні. Самовивіз у нашому магазині у Львові.`,
    },
    {
      question: `Чи є гарантія на ${productLabel}?`,
      answer: `Так, PartsON надає гарантію якості на всі запчастини від перевірених постачальників. Продаємо оригінальні та аналогові деталі — ${producerLabel} та інших брендів. У разі питань менеджер допоможе з поверненням або заміною.`,
    },
  ];
};

export const buildProductFaqJsonLd = (options: {
  name: string;
  producer: string;
  group: string;
  subGroup: string;
  hasPrice: boolean;
  quantity: number;
}) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: buildProductFaqItems(options).map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
});
