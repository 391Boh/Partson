// Seeds a starter set of manager reply templates into Firestore's
// `messageTemplates` collection (the same collection AdminChatPanel.tsx's
// "Шаблони повідомлень" tab reads/writes). Idempotent — skips any title
// that already exists, so it's safe to re-run after adding more by hand.
//
// Run with:
//   npx tsx --require ./scripts/preload.cjs --env-file=.env.local scripts/seed-chat-templates.ts

import { getFirebaseAdminDb } from "../app/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

const TEMPLATES: { title: string; text: string }[] = [
  {
    title: "Привітання",
    text: "Доброго дня! 👋 Дякую, що звернулись до PartsON. Підкажіть, будь ласка, марку, модель і рік випуску авто (або VIN-код) — так я швидше підберу потрібну деталь.",
  },
  {
    title: "Потрібен VIN / авто",
    text: "Щоб точно підібрати деталь, потрібен VIN-код авто (17 символів, є у техпаспорті) або марка, модель, рік випуску та об'єм двигуна — так ми точно не помилимось з підбором.",
  },
  {
    title: "Перевіряю наявність",
    text: "Хвилинку, перевіряю наявність і актуальну ціну на складі 🙏",
  },
  {
    title: "Є в наявності",
    text: "Ця деталь є в наявності! Можу оформити замовлення просто зараз — підкажіть, будь ласка, ваші ПІБ, телефон і місто доставки.",
  },
  {
    title: "Немає в наявності",
    text: "На жаль, зараз цієї позиції немає на складі. Можу замовити у постачальника — прийде орієнтовно за 3–5 робочих днів. Оформити замовлення під поставку?",
  },
  {
    title: "Пропоную аналог",
    text: "Оригінальної зараз немає, але є якісний аналог від перевіреного виробника — за характеристиками повністю відповідає, і ціна приємніша. Показати варіант?",
  },
  {
    title: "Оплата",
    text: "Оплата можлива двома способами: онлайн карткою на сайті (Visa/Mastercard) або накладеним платежем при отриманні у Новій пошті. Як вам зручніше?",
  },
  {
    title: "Доставка (Нова пошта)",
    text: "Доставляємо по всій Україні Новою поштою — у відділення чи поштомат, як вам зручніше. Зазвичай відправляємо в день замовлення або наступного робочого дня, в дорозі — 1–3 дні залежно від міста.",
  },
  {
    title: "Замовлення оформлено",
    text: "Замовлення оформлено! ✅ Найближчим часом зберемо і відправимо, номер декларації Нової пошти надішлемо сюди, в чат. Дякуємо за довіру! 🙌",
  },
  {
    title: "Потрібне фото деталі",
    text: "Щоб не помилитись із підбором, надішліть, будь ласка, фото деталі (бажано з номером чи маркуванням) або фото VIN-коду з техпаспорта — так підберу все зі 100% точністю.",
  },
  {
    title: "Гарантія і повернення",
    text: "На всі деталі надаємо гарантію від виробника. Якщо товар не підійшов або є заводський брак — приймаємо повернення чи обмін протягом 14 днів, товар має бути у товарному вигляді.",
  },
  {
    title: "Вибачення за затримку",
    text: "Перепрошуємо за очікування — зараз багато звернень, відповідаємо в порядку черги. Дякуємо за терпіння 🙏",
  },
  {
    title: "Графік роботи й адреса",
    text: "Ми працюємо: Пн–Сб з 08:00 до 18:00, Нд з 08:00 до 16:00. Адреса: м. Львів, вул. Перфецького, 8. Телефон: +38 (063) 421-18-51.",
  },
  {
    title: "Дякую / завершення",
    text: "Дякуємо за звернення! Якщо виникнуть ще питання — пишіть, завжди раді допомогти 😊",
  },
];

async function main() {
  console.log("🚀 Заповнення шаблонів відповідей менеджера...");

  const db = getFirebaseAdminDb();

  const existingSnap = await db.collection("messageTemplates").get();
  const existingTitles = new Set(
    existingSnap.docs.map((doc) => (doc.data().title as string | undefined)?.trim())
  );

  let added = 0;
  for (const template of TEMPLATES) {
    if (existingTitles.has(template.title)) {
      console.log(`↷ Пропущено (вже є): ${template.title}`);
      continue;
    }
    await db.collection("messageTemplates").add({
      title: template.title,
      text: template.text,
      createdAt: FieldValue.serverTimestamp(),
    });
    console.log(`✓ Додано: ${template.title}`);
    added += 1;
  }

  console.log(`\nГотово. Додано ${added} з ${TEMPLATES.length} шаблонів.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
