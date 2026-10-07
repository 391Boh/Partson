import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowUpRight, BadgeCheck, BadgePercent, Handshake, MapPin, Package, ScanLine, Store, Truck, Wrench } from "lucide-react";
import { buildPageMetadata, STORE_ADDRESS, STORE_PHONE_DISPLAY, STORE_PHONE_TEL } from "app/lib/seo-metadata";
import { getSiteUrl } from "app/lib/site-url";
import { PARTNER_DISCOUNT_PERCENT, PARTNER_THRESHOLD_UAH } from "app/lib/partnership-discount";
import PartnershipCtaClient from "./PartnershipCtaClient";
import PartnershipStatusCard from "./PartnershipStatusCard";
import PartnershipDeliveryClient from "./PartnershipDeliveryClient";
import PartnershipVisual from "./PartnershipVisual";
import PartnershipSavings from "./PartnershipSavings";
import PartnershipReveal from "./PartnershipReveal";
import PartnershipScrollNav from "./PartnershipScrollNav";
import { PartsGraphic, MembershipGraphic, DeliveryGraphic } from "./PartnershipGraphics";

const threshold = PARTNER_THRESHOLD_UAH.toLocaleString("uk-UA");
const title = `Автозапчастини для СТО: партнерська знижка ${PARTNER_DISCOUNT_PERCENT}% | PartsON`;
const description = `Партнерська програма PartsON для СТО, автомагазинів і механіків. Знижка ${PARTNER_DISCOUNT_PERCENT}% після замовлень на ${threshold} грн, підбір за VIN, доставка у Львові та Україні.`;

export const metadata: Metadata = buildPageMetadata({
  title,
  description,
  canonicalPath: "/partnership",
  keywords: ["автозапчастини для СТО", "партнерська програма PartsON", "знижки на автозапчастини", "постачальник запчастин Львів", "автозапчастини для автомагазинів"],
  image: { url: "/images/partnership-workshop-v1.webp", width: 1920, height: 720, alt: "Автозапчастини для СТО та автомагазинів — партнерська програма PartsON" },
});

const faqs = [
  { question: "Як стати партнером PartsON?", answer: `Зареєструйтеся або увійдіть у свій акаунт і оформлюйте замовлення. Коли загальна сума замовлень у вашому акаунті досягне ${threshold} грн, партнерський статус активується автоматично. Окрема заявка не потрібна.` },
  { question: "Коли починає діяти партнерська знижка?", answer: `Базова знижка ${PARTNER_DISCOUNT_PERCENT}% діє на наступні замовлення після активації партнерського статусу. Для її застосування потрібно бути авторизованим у партнерському акаунті.` },
  { question: "Чи потрібен промокод або платний внесок?", answer: "Ні. Участь у програмі безкоштовна. Після активації статусу базова партнерська знижка застосовується автоматично, без промокодів." },
  { question: "Як побачити спеціальні ціни для партнерів?", answer: "Увійдіть в акаунт з активним партнерським статусом. Спеціальна ціна, якщо вона є для товару, відображається в каталозі та на сторінці товару. Неавторизовані відвідувачі бачать повідомлення про партнерську пропозицію." },
  { question: "Як отримати запчастини у Львові та інших містах?", answer: `У Львові доступні власна доставка PartsON та самовивіз: ${STORE_ADDRESS}. По Україні відправляємо Новою поштою. Спосіб отримання обирайте під час оформлення замовлення.` },
  { question: "Де перевірити прогрес до партнерського статусу?", answer: "Після входу в акаунт на цій сторінці відображається ваш статус і накопичена сума замовлень. Тут також можна зберегти налаштування доставки для наступних покупок." },
];

const audiences = [
  { icon: Wrench, number: "01", title: "СТО та майстерні", lead: "Менше витрат на кожен ремонт.", text: "Деталі для ремонту й планового ТО — в одному каталозі. Закуповуйте з партнерською знижкою та залишайте більше коштів для розвитку майстерні." },
  { icon: Store, number: "02", title: "Автомагазини", lead: "Вигідніші закупівлі для вашого магазину.", text: "Порівнюйте виробників, перевіряйте залишки та замовляйте потрібні позиції. Партнерські умови — у вашому акаунті." },
  { icon: Handshake, number: "03", title: "Приватні механіки", lead: "Потрібна деталь. Зрозуміла ціна.", text: "Знаходьте запчастини за артикулом або уточнюйте підбір за VIN. Замовлення для різних клієнтів накопичуються в одному акаунті." },
];

export default function PartnershipPage() {
  const siteUrl = getSiteUrl();
  const url = `${siteUrl}/partnership`;
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": `${url}#webpage`, url, name: title, description, inLanguage: "uk-UA", breadcrumb: { "@id": `${url}#breadcrumbs` } },
      { "@type": "BreadcrumbList", "@id": `${url}#breadcrumbs`, itemListElement: [
        { "@type": "ListItem", position: 1, name: "Головна", item: siteUrl },
        { "@type": "ListItem", position: 2, name: "Партнерська програма", item: url },
      ] },
      { "@type": "FAQPage", "@id": `${url}#faq`, mainEntity: faqs.map(({ question, answer }) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) },
    ],
  };

  return (
    <PartnershipReveal>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      <section className="partner-hero" aria-labelledby="partner-title">
        <PartnershipVisual />
        <div className="page-shell-inline partner-hero-content">
          <nav aria-label="Навігаційний шлях" className="partner-breadcrumbs"><Link href="/">Головна</Link><span>/</span><span aria-current="page">Партнерська програма</span></nav>
          <span className="partner-eyebrow"><span /> PARTSON ДЛЯ БІЗНЕСУ</span>
          <h1 id="partner-title">Автозапчастини для СТО.<br /><em>Більше вигоди для вашої справи.</em></h1>
          <p className="partner-hero-description">Ваші закупівлі працюють на вас. Для СТО, автомагазинів і механіків — <strong className="partner-inline-accent">постійна знижка {PARTNER_DISCOUNT_PERCENT}%</strong> на наступні замовлення після покупок на <strong>{threshold} грн.</strong></p>
          <div className="partner-hero-actions"><PartnershipCtaClient /><a className="partner-how-link" href="#how-it-works">Як це працює <ArrowDown size={16} /></a></div>
          <div className="partner-hero-proof"><span><BadgeCheck size={16} /> Без внесків</span><span><BadgeCheck size={16} /> Автоматична активація</span><span><BadgeCheck size={16} /> Доставка по Україні</span></div>
          <div className="partner-hero-signature" aria-hidden="true"><span>ВАША ПАРТНЕРСЬКА ПЕРЕВАГА</span><strong>−{PARTNER_DISCOUNT_PERCENT}<small>%</small></strong><span>НА НАСТУПНІ ЗАМОВЛЕННЯ</span></div>
        </div>
        <div className="partner-stat-bar page-shell-inline">
          <div><strong>{PARTNER_DISCOUNT_PERCENT}%</strong><span>базова знижка партнера</span></div>
          <div><strong>{threshold}<small> грн</small></strong><span>замовлень до активації</span></div>
          <div><strong>0<small> грн</small></strong><span>вартість участі</span></div>
          <a href="#benefits">Усі переваги <ArrowDown size={20} /></a>
        </div>
      </section>

      <PartnershipScrollNav />

      <section id="benefits" className="partner-section page-shell-inline">
        <div className="partner-section-heading"><div><span className="partner-kicker">01 / ДЛЯ ВАШОЇ СПРАВИ</span><h2>Ваша справа — автомобілі.<br /><em>Наша — потрібні запчастини.</em></h2></div><p><strong>Один постачальник. Більше можливостей.</strong> Запчастини для щоденної роботи, підбір за VIN і партнерські ціни — у Львові та з доставкою по Україні.</p></div>
        <PartsGraphic />
        <div className="partner-audience-grid">{audiences.map(({ icon: Icon, number, title: name, lead, text }) => <article key={number} className="partner-audience-card" data-partner-drift={number === "02" ? "-0.035" : "0.035"}><div className="partner-card-top"><Icon size={26} strokeWidth={1.5} /><span>{number}</span></div><h3>{name}</h3><p className="partner-card-lead">{lead}</p><p>{text}</p></article>)}</div>
        <div className="partner-service-line"><span><ScanLine size={20} /> Підбір за VIN та артикулом</span><span><Package size={20} /> Наявність у каталозі</span><span><BadgePercent size={20} /> Спеціальні пропозиції партнерам</span></div>
      </section>

      <section id="how-it-works" className="partner-process">
        <div className="page-shell-inline partner-section">
          <div className="partner-process-intro">
          <div className="partner-section-heading"><div><span className="partner-kicker">02 / ПРОСТИЙ СТАРТ</span><h2>Три кроки.<br /><em>Постійна вигода.</em></h2></div><p><strong>Без заявок, внесків і промокодів.</strong> Замовляйте з одного акаунта — партнерський статус активується автоматично.</p></div>
            <MembershipGraphic />
          </div>
          <ol className="partner-step-grid">
            <li><span>01</span><h3>Створіть акаунт</h3><p><strong>Почніть із реєстрації.</strong> Уже маєте акаунт? Просто увійдіть і замовляйте з нього.</p></li>
            <li><span>02</span><h3>Замовляйте запчастини</h3><p><strong>Накопичте {threshold} грн замовлень.</strong> Обирайте потрібні деталі — система врахує їхню загальну суму в акаунті.</p></li>
            <li><span>03</span><h3>Отримайте статус</h3><p><strong>Ваші наступні покупки — зі знижкою {PARTNER_DISCOUNT_PERCENT}%.</strong> Статус активується автоматично. Достатньо увійти в акаунт.</p></li>
          </ol>
          <div className="partner-personal-status"><PartnershipStatusCard showCta={false} hideGuest /></div>
        </div>
      </section>

      <section id="savings" className="partner-section page-shell-inline partner-savings-section">
        <div><span className="partner-kicker">03 / ВИГОДА В ЦИФРАХ</span><h2>Менше витрат.<br /><em>Більше для бізнесу.</em></h2><p className="partner-section-copy"><strong>{PARTNER_DISCOUNT_PERCENT}% економії — на вашу користь.</strong> Оберіть суму закупівель і побачте, скільки залишиться для інструментів, обладнання чи розвитку бізнесу.</p><div className="partner-promo-note"><BadgePercent size={24} /><div><h3>А ще — спеціальні ціни</h3><p>Окремі товари мають спеціальні партнерські пропозиції. Увійдіть в активний партнерський акаунт і перевірте актуальну ціну в каталозі.</p></div></div></div>
        <div className="partner-savings-drift" data-partner-drift="-0.045"><PartnershipSavings /></div>
      </section>

      <section id="delivery" className="partner-delivery">
        <div className="page-shell-inline partner-section">
          <div className="partner-section-heading"><div><span className="partner-kicker">04 / ПОРУЧ ІЗ ВАМИ</span><h2>Запчастини там,<br /><em>де вони потрібні.</em></h2></div><Link href="/contact" className="partner-text-link">Зв’язатися з PartsON <ArrowUpRight size={18} /></Link></div>
          <DeliveryGraphic />
          <div className="partner-delivery-grid"><article data-partner-drift="0.03"><Truck size={28} /><span className="partner-delivery-tag">ЛЬВІВ</span><h3>Доставка PartsON</h3><p><strong>Прямо до вашої майстерні.</strong> Доставляємо запчастини до СТО чи магазину у Львові. Умови узгодимо під час замовлення.</p></article><article data-partner-drift="-0.03"><Package size={28} /><span className="partner-delivery-tag">УКРАЇНА</span><h3>Нова пошта</h3><p><strong>У ваше місто по Україні.</strong> Відділення, поштомат або кур’єр — обирайте зручне отримання під час замовлення.</p></article><article data-partner-drift="0.03"><MapPin size={28} /><span className="partner-delivery-tag">САМОВИВІЗ</span><h3>Заберіть особисто</h3><p><strong>Зручно, якщо ви поруч.</strong> {STORE_ADDRESS}. Готовність замовлення уточнюйте: <a href={`tel:${STORE_PHONE_TEL}`}>{STORE_PHONE_DISPLAY}</a>.</p></article></div>
          <div className="partner-delivery-settings"><PartnershipDeliveryClient /></div>
        </div>
      </section>

      <section id="faq" className="partner-section page-shell-inline partner-faq-section">
        <div><span className="partner-kicker">05 / УСЕ ЗРОЗУМІЛО</span><h2>Відповіді перед<br /><em>першим замовленням.</em></h2><p className="partner-section-copy">Залишилися запитання про закупівлю автозапчастин для вашого бізнесу? <a href={`tel:${STORE_PHONE_TEL}`}>Зателефонуйте нам.</a></p></div>
        <div className="partner-faq-list">{faqs.map(({ question, answer }) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div>
      </section>

      <section className="partner-final"><div className="page-shell-inline"><span className="partner-kicker">PARTSON / ВАШ НАСТУПНИЙ КРОК</span><h2>Працюйте з автозапчастинами.<br /><em>Заробляйте з перевагою.</em></h2><p>Почніть із реєстрації. Замовлення на <strong>{threshold} грн</strong> відкривають <strong>постійну знижку {PARTNER_DISCOUNT_PERCENT}%</strong> для наступних покупок.</p><PartnershipCtaClient /><Link href="/katalog" className="partner-final-catalog">Переглянути каталог автозапчастин <ArrowUpRight size={17} /></Link></div></section>
    </PartnershipReveal>
  );
}
