import Link from "next/link";
import {
  ArrowRight, MapPin, MessageCircle,
  PackageSearch, Star, Truck, Wrench,
} from "lucide-react";
import DeferredSeoPhotosBackdrop, { DeferredStoreMap } from "./DeferredHomeVisuals";
import OpenChatButton from "./OpenChatButton";
import StoreOpenStatus from "./StoreOpenStatus";

const STORE_MAPS_URL = "https://www.google.com/maps/place/PartsON/@49.8177181,24.0058222,14.15z/data=!4m6!3m5!1s0x473ae70feda65713:0x9fd600e7cfbd0edd!8m2!3d49.8140387!4d23.9892492!16s%2Fg%2F11y4t3x15h?entry=ttu";
const STORE_MAP_EMBED_URL = "https://www.google.com/maps?q=PartsON,+вул.+Перфецького,+8,+Львів&output=embed";

// One quiet, keyword-rich list of what the catalog covers — replaces the
// old three mini-cards that visually duplicated the service cards below.
const catalogScope = [
  {
    label: "Двигун і ТО",
    items: "олива, фільтри, ремені та ролики ГРМ, помпи, термостати, свічки, радіатори, патрубки",
  },
  {
    label: "Ходова і гальма",
    items: "амортизатори, пружини, важелі, сайлентблоки, кульові опори, підшипники, диски, колодки, супорти",
  },
  {
    label: "Електрика і кузов",
    items: "датчики, котушки, стартери, генератори, фари, ліхтарі, дзеркала, склоочисники, автохімія",
  },
] as const;

// Three non-overlapping steps: підбір → наявність → отримання. Each links to
// a distinct set of routes; the copy no longer restates the others.
const serviceCards = [
  {
    title: "Підбір за авто чи артикулом",
    eyebrow: "VIN · артикул · модель",
    icon: PackageSearch,
    text: "Перевіримо, чи підходить деталь до вашої моделі, року й модифікації, та підкажемо різницю між оригіналом і аналогом.",
    links: [["/auto", "Підбір за авто"], ["/katalog", "Пошук за артикулом"], ["/groups", "Групи товарів"]],
    tone: "sky" as const,
  },
  {
    title: "Наявність і аналоги",
    eyebrow: "Актуальні залишки складу",
    icon: Wrench,
    text: "Уточнимо виробника, характеристики та залишок на складі. Якщо позиції немає — запропонуємо сумісний аналог у вашому бюджеті.",
    links: [["/manufacturers", "Виробники"], ["/blog", "Поради фахівців"], ["/inform/warranty", "Гарантія"]],
    tone: "cyan" as const,
  },
  {
    title: "Оплата та доставка",
    eyebrow: "Львів і вся Україна",
    icon: Truck,
    text: "Самовивіз із магазину на вул. Перфецького або доставка Новою поштою по Україні. Підкажемо щодо оплати, термінів і повернення.",
    links: [["/inform/delivery", "Доставка"], ["/inform/payment", "Оплата"], ["/inform/returns", "Повернення"]],
    tone: "blue" as const,
  },
] as const;

const cardTones = {
  sky: { chip: "from-sky-500 to-cyan-400", glow: "rgba(14,165,233,0.5)", link: "text-sky-700 hover:text-sky-500", dot: "bg-sky-500", hoverText: "group-hover/service:text-sky-900" },
  cyan: { chip: "from-teal-500 to-cyan-400", glow: "rgba(13,148,136,0.5)", link: "text-teal-700 hover:text-teal-500", dot: "bg-teal-500", hoverText: "group-hover/service:text-teal-900" },
  blue: { chip: "from-blue-600 to-indigo-400", glow: "rgba(79,70,229,0.5)", link: "text-blue-700 hover:text-blue-500", dot: "bg-blue-500", hoverText: "group-hover/service:text-blue-900" },
} as const;

type Props = { googleRatingValue?: number; googleReviewCount?: number };

export default function AdvantagesSection({ googleRatingValue = 4.3, googleReviewCount = 12 }: Props) {
  return (
    <section className="font-ui group/seo relative isolate w-full overflow-hidden border-y border-teal-100/70 bg-[radial-gradient(150%_120%_at_-25%_-25%,rgba(13,148,136,0.1),transparent_66%),radial-gradient(150%_120%_at_125%_130%,rgba(34,211,238,0.09),transparent_64%),linear-gradient(168deg,#e3f4f1_0%,#ebf6f8_44%,#e2eefc_100%)] pb-5 pt-5 text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_-1px_0_rgba(13,148,136,0.1),0_18px_40px_-18px_rgba(15,56,86,0.16)] sm:pb-6 sm:pt-6">
      <DeferredSeoPhotosBackdrop />
      {/* top bridge — melts the manufacturers section's mint edge into this one */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-16 bg-[linear-gradient(to_bottom,rgba(227,244,241,0.85)_0%,rgba(227,244,241,0.22)_58%,transparent_100%)]" />
      {/* section hover — the panel lights up: a teal / cyan bloom swells in and a
          bright band sweeps across */}
      <div className="home-scroll-decor pointer-events-none absolute -inset-8 z-[1] opacity-0 transition-[opacity,transform] duration-[600ms] ease-out group-hover/seo:opacity-100 group-hover/seo:scale-[1.04] bg-[radial-gradient(circle_at_8%_10%,rgba(13,148,136,0.3),transparent_42%),radial-gradient(circle_at_92%_86%,rgba(34,211,238,0.26),transparent_40%),radial-gradient(circle_at_50%_-8%,rgba(56,189,248,0.18),transparent_44%),radial-gradient(circle_at_52%_112%,rgba(45,212,191,0.16),transparent_58%)]" />
      <div className="home-scroll-decor pointer-events-none absolute inset-y-0 -left-1/3 z-[1] w-2/3 -translate-x-1/4 opacity-0 transition-[opacity,transform] duration-[900ms] ease-out group-hover/seo:translate-x-[70%] group-hover/seo:opacity-100 bg-[linear-gradient(105deg,transparent_0%,rgba(94,234,212,0.16)_38%,rgba(255,255,255,0.34)_50%,rgba(56,189,248,0.14)_62%,transparent_100%)]" />
      {/* machined panel edges + one diagonal light streak — a touch of metal */}
      <span className="home-scroll-decor pointer-events-none absolute inset-x-0 top-0 z-[2] h-[3px] bg-[linear-gradient(to_bottom,rgba(255,255,255,0.95),rgba(255,255,255,0.32)_46%,transparent)] transition-[box-shadow] duration-500 group-hover/seo:shadow-[0_0_22px_rgba(13,148,136,0.7)]" />
      <span className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-[2px] bg-[linear-gradient(to_top,rgba(15,118,110,0.18),transparent)]" />
      <span className="pointer-events-none absolute inset-0 z-[1] opacity-50 bg-[linear-gradient(101deg,transparent_0%,transparent_34%,rgba(255,255,255,0.22)_48%,rgba(255,255,255,0.3)_50%,rgba(255,255,255,0.18)_52%,transparent_66%,transparent_100%)]" />
      <div className="section-reveal-advantages is-revealed page-shell-inline relative z-10 max-w-[1200px] space-y-7 sm:space-y-10">
        {/* ---- Header + store card: one balanced two-column row ---- */}
        <div className="grid gap-5 lg:grid-cols-2 lg:items-stretch lg:gap-8 xl:gap-10">
          <div className="reveal-adv-copy relative min-w-0 rounded-[24px] border border-white/80 bg-white/78 p-5 shadow-[0_18px_42px_-20px_rgba(15,56,86,0.28),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-sm sm:p-7 lg:min-h-[520px] lg:p-8">
            {/* Soft glow behind the heading — light, blurred wash lifting
                the title off the section background, same treatment as the
                other homepage sections' card headings. */}
            <span className="pointer-events-none absolute -left-6 top-10 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(13,148,136,0.22),transparent_70%)] blur-2xl" aria-hidden="true" />
            <div className="flex items-center gap-3">
              <span className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-teal-500 via-sky-500 to-sky-400 text-white shadow-[0_13px_30px_-8px_rgba(13,148,136,0.6),inset_0_1px_0_rgba(255,255,255,0.6),inset_0_-2px_6px_-2px_rgba(4,47,46,0.45)] after:pointer-events-none after:absolute after:inset-0 after:bg-[radial-gradient(circle_at_30%_22%,rgba(255,255,255,0.6),transparent_52%)] sm:h-11 sm:w-11">
                {/* Original simple line-art open-box mark — the anchor for
                    this whole icon family: same style language (viewBox 24,
                    thin round-cap stroke, no fill) as HeroIntroCard's own
                    custom eyebrow SVG, now shared by every homepage
                    section's eyebrow badge instead of four different
                    lucide-react glyphs. */}
                <svg viewBox="0 0 24 24" className="relative h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3.5 8.2 12 3.5l8.5 4.7" />
                  <path d="M3.5 8.2v8.4L12 21l8.5-4.4V8.2" />
                  <path d="M12 12.6 20.5 8.2M12 12.6 3.5 8.2M12 12.6V21" />
                </svg>
              </span>
              <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase leading-snug tracking-[0.14em] text-teal-600 sm:text-[11px] sm:tracking-[0.18em]">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-teal-500 shadow-[0_0_10px_rgba(13,148,136,0.6)]" />
                PartsON · Львів
              </span>
            </div>
            <h2 className="relative mt-3.5 max-w-[20ch] font-display text-[27px] font-black leading-[1.08] tracking-[-0.025em] text-slate-950 min-[480px]:text-[30px] sm:text-[34px] lg:text-[31px] xl:text-[35px]">
              Інтернет-магазин <span className="text-teal-600">автозапчастин у Львові</span>
            </h2>
            <span className="mt-4 block h-[3px] w-24 rounded-full bg-[linear-gradient(90deg,#0d9488_0%,#14b8a6_26%,#ccfbf1_46%,#38bdf8_64%,transparent_100%)] shadow-[0_1px_2px_rgba(15,118,110,0.28)]" />
            <p className="mt-3.5 max-w-[50ch] text-[15px] font-medium leading-[1.68] text-slate-700 sm:text-[16px]">
              <strong className="font-extrabold text-slate-900">PartsON підбирає оригінальні деталі та перевірені аналоги</strong> для легкових авто. Шукайте за VIN, артикулом або моделлю — заберіть у Львові чи замовте доставку по Україні.
            </p>

            <div className="mt-5 rounded-[18px] border border-slate-200/90 bg-slate-50/90 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] sm:mt-6 sm:p-5">
              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-teal-700">Що знайдете в каталозі</p>
              <dl className="mt-3.5 space-y-3.5">
                {catalogScope.map((row) => (
                  <div key={row.label} className="grid gap-1 border-b border-slate-200/80 pb-3 last:border-0 last:pb-0 sm:grid-cols-[138px_minmax(0,1fr)] sm:gap-4">
                    <dt className="text-[13px] font-black leading-snug text-slate-900">{row.label}</dt>
                    <dd className="text-[13px] leading-[1.58] text-slate-600">{row.items}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          {/* store / map card — frosted glass, height roughly matches the column */}
          <div className="reveal-adv-map flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] border border-white/75 bg-white/70 shadow-[0_26px_58px_-20px_rgba(15,56,86,0.34),inset_0_1px_0_rgba(255,255,255,0.95)] ring-1 ring-white/55">
            <a href={STORE_MAPS_URL} target="_blank" rel="noreferrer" className="group/map relative block aspect-[16/9] min-h-[220px] flex-1 cursor-zoom-in overflow-hidden bg-sky-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-sky-400/60 lg:aspect-auto lg:min-h-[360px]">
              <DeferredStoreMap src={STORE_MAP_EMBED_URL} title="Карта розташування PartsON у Львові" />
              <span className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-transparent to-white/10" />
              <span className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-3 rounded-[14px] border border-white/35 bg-slate-950/78 px-3 py-2.5 text-white shadow-lg backdrop-blur-md transition-[transform,background-color] duration-200 group-hover/map:-translate-y-0.5 group-hover/map:bg-sky-950/90">
                <span className="flex min-w-0 items-center gap-2.5"><MapPin className="h-5 w-5 shrink-0 text-cyan-300" /><span><strong className="block text-[12px] font-black">Львів, вул. Перфецького, 8</strong><small className="block text-[10px] font-semibold text-sky-100/80">Відкрити маршрут у Google Maps</small></span></span><ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover/map:translate-x-1" />
              </span>
            </a>
            <div className="grid grid-cols-2 divide-x divide-white/60 border-t border-white/60">
              <a href="tel:+380634211851" className="group/phone flex items-center justify-center gap-2 px-3 py-3.5 text-[12px] font-black text-slate-700 transition-colors hover:bg-white/60 hover:text-sky-800"><MessageCircle className="h-4 w-4 text-sky-600 transition-transform group-hover/phone:scale-110" />+38 (063) 421-18-51</a>
              <StoreOpenStatus />
            </div>
            {googleReviewCount > 0 && <a href={STORE_MAPS_URL} target="_blank" rel="noreferrer" aria-label={`Переглянути ${googleReviewCount} відгуків PartsON у Google`} className="group/reviews flex cursor-pointer items-center justify-center gap-2 border-t border-amber-200/70 bg-[linear-gradient(135deg,rgba(255,253,245,0.85),rgba(255,247,214,0.8))] px-3 py-3 text-[12px] font-extrabold text-amber-900 transition-[background-color,color,box-shadow] duration-200 hover:bg-[linear-gradient(135deg,#fff8d8,#ffed9c)] hover:text-amber-950 hover:shadow-[inset_0_3px_0_rgba(245,158,11,0.55),0_-8px_20px_rgba(245,158,11,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400"><span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-400 text-white shadow-[0_5px_12px_rgba(245,158,11,0.28)] transition-[transform,background-color] duration-200 group-hover/reviews:-translate-y-0.5 group-hover/reviews:scale-110 group-hover/reviews:bg-amber-500"><Star className="h-3.5 w-3.5 fill-current" /></span><span>{googleRatingValue.toFixed(1)} · {googleReviewCount} відгуків Google</span><ArrowRight className="h-3.5 w-3.5 text-amber-600 opacity-60 transition-[transform,opacity] group-hover/reviews:translate-x-1 group-hover/reviews:opacity-100" /></a>}
          </div>
        </div>

        {/* ---- Services: three non-overlapping steps, cards aligned ---- */}
        <div className="reveal-adv-cards grid gap-4 lg:grid-cols-3">
          {serviceCards.map((item) => {
            const Icon = item.icon;
            const tone = cardTones[item.tone];
            return (
              <article key={item.title} className="card-metal group/service relative flex h-full flex-col overflow-hidden rounded-[20px] border border-white/55 bg-white/40 p-5 shadow-[0_14px_32px_-12px_rgba(15,56,86,0.22),inset_0_1px_0_rgba(255,255,255,0.7)] transition-[transform,box-shadow,background-color] duration-300 ease-out hover:-translate-y-1 hover:bg-white/70 hover:shadow-[0_26px_50px_-16px_rgba(14,116,144,0.34),inset_0_1px_0_white] sm:p-6">
                <div className="relative z-[3] flex items-start gap-3.5">
                  <span
                    className={`relative inline-flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[15px] bg-gradient-to-br text-white transition-transform duration-300 group-hover/service:-translate-y-0.5 group-hover/service:scale-110 ${tone.chip} after:pointer-events-none after:absolute after:inset-0 after:bg-[radial-gradient(circle_at_30%_22%,rgba(255,255,255,0.6),transparent_52%)]`}
                    style={{ boxShadow: `0 12px 26px -8px ${tone.glow}, inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -2px 6px -2px rgba(4,32,46,0.4)` }}
                  >
                    <Icon className="relative h-[21px] w-[21px]" strokeWidth={2.2} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">{item.eyebrow}</p>
                    <h3 className={`mt-1 font-display text-[19px] font-black leading-[1.12] tracking-[-0.015em] text-slate-900 transition-colors sm:text-[21px] ${tone.hoverText}`}>{item.title}</h3>
                  </div>
                </div>
                <p className="relative z-[3] mt-3.5 text-[14px] font-medium leading-[1.68] text-slate-600 sm:text-[14.5px]">{item.text}</p>
                <div className="relative z-[3] mt-auto flex flex-wrap gap-x-4 gap-y-2 pt-5">
                  {item.links.map(([href, label]) => (
                    <Link key={href} href={href} className={`group inline-flex items-center gap-1.5 text-[12.5px] font-extrabold ${tone.link}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                      {label}
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                    </Link>
                  ))}
                </div>
              </article>
            );
          })}
        </div>

        {/* ---- CTA ---- */}
        <div className="reveal-adv-cta grid gap-4 overflow-hidden rounded-[22px] border border-white/55 bg-white/45 px-5 py-6 shadow-[0_18px_40px_-16px_rgba(15,56,86,0.24),inset_0_1px_0_rgba(255,255,255,0.75)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-8 sm:py-7">
          <div>
            <h3 className="font-display text-[20px] font-black tracking-[-0.015em] text-slate-950 [text-shadow:0_1px_0_#fff] sm:text-[23px]">Не знайшли потрібну деталь?</h3>
            <p className="mt-1.5 text-[14px] leading-[1.62] text-slate-600 sm:text-[15px]">Напишіть менеджеру — підкажемо сумісний аналог, перевіримо наявність і порахуємо вартість доставки.</p>
          </div>
          <OpenChatButton
            message="Допоможіть підібрати автозапчастину."
            label="Написати менеджеру"
            title="Відкрити чат для підбору автозапчастини"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-[14px] bg-gradient-to-r from-teal-600 via-sky-600 to-cyan-500 px-6 text-[13px] font-black text-white shadow-[0_14px_30px_-8px_rgba(13,148,136,0.5),inset_0_1px_0_rgba(255,255,255,0.4)] transition-[filter,box-shadow] hover:brightness-105 hover:shadow-[0_18px_38px_-8px_rgba(13,148,136,0.55),inset_0_1px_0_rgba(255,255,255,0.5)]"
          />
        </div>
      </div>
    </section>
  );
}
