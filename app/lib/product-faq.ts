// Single source of truth for the product page's FAQ content — both the
// visible accordion (ProductFaqSection.tsx) and the FAQPage JSON-LD render
// from this same list, so the structured data always matches what's
// actually on the page (a mismatch there is a known Google Search Console
// flag, not just a cosmetic risk).
export type ProductFaqItem = {
  question: string;
  answer: string;
};

// Ukrainian needs the product name inflected after most prepositions ("для
// троса", "на шину"), which a template cannot do. Every sentence here keeps
// the name as the subject, in the nominative, so it reads correctly for any
// product. Mid-sentence it starts lower-case unless it opens with an
// abbreviation or brand ("ГРМ", "ALPHA").
const inSentence = (name: string) =>
  /^\p{Lu}\p{Ll}/u.test(name) ? name.charAt(0).toLocaleLowerCase("uk-UA") + name.slice(1) : name;

export const buildProductFaqItems = (options: {
  name: string;
  producer: string;
  group: string;
  subGroup: string;
  hasPrice: boolean;
  quantity: number;
}): ProductFaqItem[] => {
  const { name, producer, group, subGroup, hasPrice, quantity } = options;
  const productName = name.trim();
  const productLabel = productName ? inSentence(productName) : "ця деталь";
  const catalogLabel = producer ? `каталогом ${producer}` : "каталогом виробника";
  const groupLabel = (subGroup || group).trim();

  return [
    {
      question: `Чи підійде ${productLabel} до мого авто?`,
      answer: `Надішліть VIN-код або марку, модель, рік і двигун автомобіля — менеджер PartsON звірить номер з ${catalogLabel} і підтвердить сумісність до відправлення.${groupLabel ? ` Якщо позиція не підходить, підберемо іншу з розділу «${groupLabel}» або аналог.` : " Якщо позиція не підходить, підберемо аналог."}`,
    },
    {
      question: `Чи є ${productLabel} в наявності?`,
      answer:
        quantity > 0
          ? `Так, зараз на складі у Львові ${quantity} шт. Після підтвердження замовлення відправляємо Новою Поштою, Укрпоштою або Meest — доставка по Україні зазвичай 1–2 робочі дні. Самовивіз з вул. Перфецького, 8 — у день замовлення.`
          : `Зараз позиція під замовлення. Залиште запит — менеджер назве ціну й строк постачання, після чого відправимо Новою Поштою, Укрпоштою або Meest чи підготуємо до самовивозу у Львові.`,
    },
    {
      question: hasPrice ? "Як оформити замовлення й оплатити?" : "Як дізнатися ціну?",
      answer: hasPrice
        ? "Натисніть «Додати до кошика» й оформіть замовлення — менеджер підтвердить наявність і доставку. Оплата готівкою, карткою, онлайн або безготівково для юридичних осіб."
        : "Ціну на цю позицію уточнює менеджер. Напишіть у чат або зателефонуйте +38 (063) 421-18-51 — відповімо з ціною й строком постачання.",
    },
    {
      question: "Які умови гарантії та повернення?",
      answer: "Деталь із виробничим дефектом повернемо або обміняємо протягом гарантійного строку за документом про покупку. Якщо деталь належної якості не підійшла, приймаємо її протягом 14 днів — за умови, що її не встановлювали й збережено упаковку та комплектацію.",
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
