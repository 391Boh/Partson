// One source for the visible homepage answers and their structured data.
export const HOME_FAQ = [
  { question: "Як підібрати запчастини до мого авто?", answer: "Оберіть марку, модель і модифікацію автомобіля або знайдіть деталь за артикулом. Для перевірки сумісності надішліть менеджеру VIN-код." },
  { question: "Де забрати замовлення у Львові?", answer: "Завітайте до магазину PartsON на вул. Перфецького, 8. Розташування магазину та маршрут можна переглянути на карті Google." },
  { question: "Чи є доставка по Україні?", answer: "Так, замовлення можна отримати доставкою по Україні. Спосіб отримання уточніть у менеджера або в розділі доставки й самовивозу." },
] as const;

export const HOME_FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  inLanguage: "uk-UA",
  mainEntity: HOME_FAQ.map(({ question, answer }) => ({
    "@type": "Question",
    name: question,
    acceptedAnswer: { "@type": "Answer", text: answer },
  })),
};
