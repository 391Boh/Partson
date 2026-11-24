import type { Metadata } from "next";
import Image from "next/image";
import { Bell, Car, Flame, PackageSearch, ShoppingCart, Truck } from "lucide-react";

import TelegramBotCta from "app/components/TelegramBotCta";
import { safeJsonLd } from "app/lib/safe-json-ld";
import { buildPageMetadata } from "app/lib/seo-metadata";
import { getSiteUrl } from "app/lib/site-url";
import { TELEGRAM_BOT_NAME, TELEGRAM_BOT_URL } from "app/lib/telegram-deeplink";

export const revalidate = 86400;

const PATH = "/telegram";
const TITLE = "Автозапчастини в Telegram: бот для підбору й замовлення";
const DESCRIPTION =
  "Telegram-бот PartsON: підбір автозапчастин за авто, пошук за артикулом, новинки й акції, кошик і замовлення з доставкою по Україні та самовивозом у Львові.";

const FEATURES = [
  { Icon: Car, title: "Підбір за авто", text: "Оберіть марку й модель — бот покаже лише сумісні деталі." },
  { Icon: PackageSearch, title: "Пошук за артикулом", text: "Напишіть назву чи номер деталі — знайдемо її та аналоги." },
  { Icon: Flame, title: "Новинки й акції", text: "Свіжі надходження та знижки в окремих розділах." },
  { Icon: ShoppingCart, title: "Кошик і замовлення", text: "Додайте товари й оформіть замовлення прямо в чаті." },
  { Icon: Bell, title: "Сповіщення", text: "Статус замовлення й повідомлення, коли товар з'явиться." },
  { Icon: Truck, title: "Доставка", text: "Нова Пошта по Україні або самовивіз у Львові." },
];

const STEPS = [
  "Відкрийте бота й натисніть «Почати».",
  "Підберіть деталь за авто або напишіть артикул.",
  "Додайте в кошик і оформіть замовлення — менеджер підтвердить його.",
];

const FAQ = [
  {
    question: "Як знайти бота PartsON у Telegram?",
    answer: `Натисніть кнопку «Відкрити бота» на цій сторінці або знайдіть у Telegram @${TELEGRAM_BOT_NAME}.`,
  },
  {
    question: "Чи потрібна реєстрація, щоб шукати запчастини в боті?",
    answer:
      "Ні. Шукати, переглядати фото, ціни й наявність можна одразу. Для замовлення бот попросить номер телефону, щоб менеджер підтвердив деталі.",
  },
  {
    question: "Чи ціни в боті такі ж, як на сайті?",
    answer: "Так. Бот бере ціни, наявність і акції з того самого каталогу, що й сайт partson.shop.",
  },
  {
    question: "Як підібрати деталь саме під моє авто?",
    answer:
      "Натисніть «Підібрати деталь», оберіть марку й модель — бот покаже лише сумісні товари. Збережене в профілі авто підставляється автоматично.",
  },
  {
    question: "Чи можна отримати повідомлення, коли товар з'явиться в наявності?",
    answer: "Так. На картці товару під замовлення натисніть «Повідомити, коли з'явиться» — бот напише, щойно товар надійде.",
  },
];

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    title: TITLE,
    description: DESCRIPTION,
    canonicalPath: PATH,
    image: { url: "/telegram/bot-welcome.png", width: 1200, height: 630, alt: "PartsON — каталог автозапчастин у Telegram" },
    keywords: [
      "автозапчастини телеграм",
      "телеграм бот автозапчастини",
      "підбір запчастин телеграм",
      "замовити запчастини в телеграмі",
      "автозапчастини львів телеграм",
      "partson telegram",
    ],
    openGraphTitle: "Автозапчастини в Telegram | PartsON",
  });
}

export default function TelegramBotPage() {
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}${PATH}`;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: TITLE,
      description: DESCRIPTION,
      url: pageUrl,
      inLanguage: "uk-UA",
      isPartOf: { "@type": "WebSite", name: "PartsON", url: siteUrl },
      primaryImageOfPage: `${siteUrl}/telegram/bot-welcome.png`,
      relatedLink: TELEGRAM_BOT_URL,
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Головна", item: `${siteUrl}/` },
        { "@type": "ListItem", position: 2, name: "Telegram-бот", item: pageUrl },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map((entry) => ({
        "@type": "Question",
        name: entry.question,
        acceptedAnswer: { "@type": "Answer", text: entry.answer },
      })),
    },
  ];

  return (
    <main className="bg-slate-50 pb-12">
      <script
        id="telegram-bot-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />

      <section className="bg-[#0f172a] text-white">
        <div className="page-shell-inline grid items-center gap-8 py-10 sm:py-14 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-300">Telegram-бот PartsON</p>
            <h1 className="mt-3 text-3xl font-black leading-tight tracking-[-0.02em] sm:text-4xl">
              Автозапчастини в Telegram
            </h1>
            <p className="mt-4 max-w-[52ch] text-base leading-7 text-slate-300">
              Підбирайте деталі за авто, шукайте за артикулом, стежте за новинками й акціями та оформлюйте
              замовлення, не виходячи з месенджера. Ціни й наявність — ті самі, що на сайті.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <TelegramBotCta placement="telegram_landing_hero" />
            </div>
            <p className="mt-3 text-sm text-slate-400">@{TELEGRAM_BOT_NAME}</p>
          </div>
          <Image
            src="/telegram/bot-welcome.png"
            alt="PartsON — каталог автозапчастин у Telegram"
            width={1200}
            height={630}
            priority
            sizes="(min-width: 1024px) 560px, 100vw"
            className="h-auto w-full rounded-3xl shadow-[0_24px_60px_-24px_rgb(0_0_0/70%)]"
          />
        </div>
      </section>

      <section className="page-shell-inline mt-10" aria-labelledby="telegram-features">
        <h2 id="telegram-features" className="text-2xl font-black tracking-[-0.02em] text-slate-900">
          Що вміє бот
        </h2>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ Icon, title, text }) => (
            <li key={title} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700">
                <Icon size={20} aria-hidden="true" />
              </span>
              <span>
                <span className="block font-extrabold text-slate-900">{title}</span>
                <span className="mt-0.5 block text-sm leading-6 text-slate-600">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="page-shell-inline mt-10" aria-labelledby="telegram-steps">
        <h2 id="telegram-steps" className="text-2xl font-black tracking-[-0.02em] text-slate-900">
          Як замовити через бота
        </h2>
        <ol className="mt-5 grid gap-3 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step} className="rounded-2xl border border-slate-200 bg-white p-4">
              <span className="text-sm font-black text-sky-600">Крок {index + 1}</span>
              <p className="mt-1 text-sm leading-6 text-slate-700">{step}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="page-shell-inline mt-10" aria-labelledby="telegram-faq">
        <h2 id="telegram-faq" className="text-2xl font-black tracking-[-0.02em] text-slate-900">
          Питання й відповіді
        </h2>
        <div className="mt-5 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {FAQ.map((entry) => (
            <details key={entry.question} className="group p-4">
              <summary className="cursor-pointer list-none font-bold text-slate-900 marker:hidden">
                {entry.question}
              </summary>
              <p className="mt-2 text-sm leading-6 text-slate-600">{entry.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="page-shell-inline mt-10">
        <div className="flex flex-col items-start gap-4 rounded-3xl bg-[#0f172a] p-6 text-white sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <p className="text-xl font-black">Деталь потрібна вже сьогодні?</p>
            <p className="mt-1 text-sm text-slate-300">Напишіть артикул боту — покажемо ціну й наявність за секунди.</p>
          </div>
          <TelegramBotCta placement="telegram_landing_footer" variant="light" />
        </div>
      </section>
    </main>
  );
}
