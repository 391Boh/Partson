import Link from "next/link";
import {
  SELLER_EMAIL,
  SELLER_NAME,
  SELLER_TAX_ID,
  STORE_ADDRESS,
  STORE_PHONE_DISPLAY,
  STORE_PHONE_TEL,
  buildPageMetadata,
} from "app/lib/seo-metadata";

export const metadata = buildPageMetadata({
  title: "Публічна оферта інтернет-магазину PartsON",
  description: `Договір публічної оферти PartsON: оформлення замовлення, ціни та оплата, доставка, повернення, гарантія і реквізити продавця — ${SELLER_NAME}.`,
  canonicalPath: "/oferta",
  keywords: ["публічна оферта PartsON", "договір купівлі-продажу автозапчастин", "умови продажу PartsON"],
});

const linkClass = "font-bold text-sky-700 underline";

export default function OfertaPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white py-10 sm:py-16">
      <article className="page-shell-inline max-w-4xl rounded-[26px] border border-sky-100 bg-white p-5 shadow-[0_20px_55px_rgba(15,78,130,0.09)] sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">Умови продажу</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Публічна оферта інтернет-магазину PartsON</h1>
        <p className="mt-4 text-base leading-7 text-slate-600">
          Цей документ є публічною пропозицією (офертою) {SELLER_NAME} укласти договір купівлі-продажу автозапчастин
          на сайті partson.shop відповідно до статей 633, 641 і 642 Цивільного кодексу України.
        </p>
        <div className="mt-7 space-y-6 text-[15px] leading-7 text-slate-700">
          <section>
            <h2 className="text-xl font-black text-slate-950">1. Терміни</h2>
            <p className="mt-1">
              <strong>Продавець</strong> — {SELLER_NAME}, РНОКПП {SELLER_TAX_ID}, що працює під торговою маркою PartsON.
              <strong> Покупець</strong> — фізична особа, ФОП або юридична особа, яка оформлює замовлення на сайті.
              <strong> Сайт</strong> — інтернет-магазин partson.shop. <strong>Товар</strong> — автозапчастини та інші
              товари, представлені на сайті.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-black text-slate-950">2. Предмет договору та акцепт</h2>
            <p className="mt-1">
              Продавець зобов’язується передати товар у власність покупця, а покупець — оплатити й прийняти його на умовах
              цієї оферти. Оформлення замовлення на сайті, по телефону або в месенджері чи оплата замовлення означає повне
              й безумовне прийняття (акцепт) цих умов.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-black text-slate-950">3. Оформлення замовлення</h2>
            <p className="mt-1">
              Покупець обирає товар, вказує контактні дані та спосіб отримання. Після оформлення менеджер може
              зв’язатися з покупцем, щоб підтвердити наявність, сумісність деталі з автомобілем і строк відправлення.
              Якщо товару не виявилося в наявності, продавець пропонує аналог або скасовує замовлення й повертає
              сплачені кошти.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-black text-slate-950">4. Ціна та оплата</h2>
            <p className="mt-1">
              Ціни на сайті вказані в гривнях. Ціна фіксується на момент оформлення замовлення. Оплатити можна карткою
              Visa або Mastercard онлайн через платіжний сервіс LiqPay (зокрема Apple Pay і Google Pay, якщо вони
              доступні на пристрої), післяплатою при отриманні, готівкою в магазині або безготівковим рахунком для
              ФОП і компаній. Дані платіжної картки обробляє LiqPay — продавець їх не отримує і не зберігає.
              Детальніше — на сторінці <Link href="/inform/payment" className={linkClass}>«Оплата»</Link>.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-black text-slate-950">5. Доставка та отримання</h2>
            <p className="mt-1">
              Товар можна забрати в магазині ({STORE_ADDRESS}) або отримати перевізником по Україні. Вартість доставки
              оплачується за тарифами перевізника, якщо інше не узгоджено. Право власності й ризик випадкового
              пошкодження переходять до покупця в момент отримання товару. Під час отримання радимо перевірити
              комплектність і стан посилки. Детальніше — на сторінці{" "}
              <Link href="/inform/delivery" className={linkClass}>«Доставка»</Link>.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-black text-slate-950">6. Повернення та обмін</h2>
            <p className="mt-1">
              Товар належної якості можна повернути або обміняти протягом 14 днів, якщо його не встановлювали, він
              зберіг товарний вигляд, комплектність, упаковку та документ про покупку. Товар неналежної якості
              повертається або обмінюється в межах гарантійного строку. Кошти повертаються тим самим способом, яким
              було здійснено оплату, у строки, встановлені законодавством про захист прав споживачів. Детальніше — на
              сторінці <Link href="/inform/returns" className={linkClass}>«Повернення»</Link>.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-black text-slate-950">7. Гарантія</h2>
            <p className="mt-1">
              Гарантійний строк визначає виробник товару. Гарантія не поширюється на дефекти, спричинені неправильним
              монтажем, експлуатацією або механічними пошкодженнями. Порядок звернення описано на сторінці{" "}
              <Link href="/inform/warranty" className={linkClass}>«Гарантія»</Link>.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-black text-slate-950">8. Відповідальність сторін</h2>
            <p className="mt-1">
              Сторони відповідають за невиконання своїх зобов’язань відповідно до законодавства України. Продавець не
              відповідає за невідповідність товару автомобілю, якщо покупець надав неточні дані (VIN, модель,
              модифікацію) або обрав деталь без консультації з менеджером. Зображення товару на сайті можуть незначно
              відрізнятися від фактичного вигляду, що не впливає на його характеристики.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-black text-slate-950">9. Персональні дані</h2>
            <p className="mt-1">
              Оформлюючи замовлення, покупець погоджується на обробку персональних даних, потрібних для його виконання.
              Порядок обробки описано в <Link href="/inform/privacy" className={linkClass}>політиці конфіденційності</Link>.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-black text-slate-950">10. Інші умови</h2>
            <p className="mt-1">
              Продавець може змінювати умови оферти, публікуючи нову редакцію на цій сторінці. До замовлення
              застосовується редакція, чинна на момент його оформлення. Спори вирішуються шляхом переговорів, а в разі
              недосягнення згоди — відповідно до законодавства України.
            </p>
          </section>
          <section aria-labelledby="seller-details">
            <h2 id="seller-details" className="text-xl font-black text-slate-950">11. Реквізити продавця</h2>
            <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-[max-content_1fr]">
              <dt className="font-semibold text-slate-950">Продавець</dt>
              <dd>{SELLER_NAME}</dd>
              <dt className="font-semibold text-slate-950">РНОКПП (ІПН)</dt>
              <dd>{SELLER_TAX_ID}</dd>
              <dt className="font-semibold text-slate-950">Адреса магазину</dt>
              <dd>{STORE_ADDRESS}</dd>
              <dt className="font-semibold text-slate-950">Телефон</dt>
              <dd><a href={`tel:${STORE_PHONE_TEL}`} className={linkClass}>{STORE_PHONE_DISPLAY}</a></dd>
              <dt className="font-semibold text-slate-950">Email</dt>
              <dd><a href={`mailto:${SELLER_EMAIL}`} className={linkClass}>{SELLER_EMAIL}</a></dd>
            </dl>
          </section>
        </div>
        <p className="mt-8 border-t border-slate-200 pt-5 text-sm text-slate-500">
          Редакція чинна з <time dateTime="2026-11-12">12 листопада 2026 року</time>.
        </p>
      </article>
    </div>
  );
}
