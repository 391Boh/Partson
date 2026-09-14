import {
  ArrowRight, Gauge, MapPin, MessageCircle,
  PackageSearch, Settings, Star, Truck, Wrench, Zap,
} from "lucide-react";
import DeferredSeoPhotosBackdrop, { DeferredStoreMap } from "./DeferredHomeVisuals";
import OpenChatButton from "./OpenChatButton";
import StoreOpenStatus from "./StoreOpenStatus";

const STORE_MAPS_URL = "https://www.google.com/maps/place/PartsON/@49.8177181,24.0058222,14.15z/data=!4m6!3m5!1s0x473ae70feda65713:0x9fd600e7cfbd0edd!8m2!3d49.8140387!4d23.9892492!16s%2Fg%2F11y4t3x15h?entry=ttu";
const STORE_MAP_EMBED_URL = "https://www.google.com/maps?q=PartsON,+вул.+Перфецького,+8,+Львів&output=embed";

// One quiet, keyword-rich list of what the catalog covers — replaces the
// old three mini-cards that visually duplicated the service cards below.
// Each row also carries its own icon now for quicker scanning.
const catalogScope = [
  {
    label: "Двигун і ТО",
    icon: Settings,
    items: "олива, фільтри, ремені та ролики ГРМ, помпи, термостати, свічки, радіатори, патрубки",
  },
  {
    label: "Ходова і гальма",
    icon: Gauge,
    items: "амортизатори, пружини, важелі, сайлентблоки, кульові опори, підшипники, диски, колодки, супорти",
  },
  {
    label: "Електрика і кузов",
    icon: Zap,
    items: "датчики, котушки, стартери, генератори, фари, ліхтарі, дзеркала, склоочисники, автохімія",
  },
] as const;

// Three non-overlapping steps: підбір → наявність → отримання. Each links to
// a distinct set of routes; the copy no longer restates the others.
// Purely informational now — each card's own links used to restate entries
// already in the footer's "Інформація" column (групи товарів, виробники,
// доставка/оплата/повернення), so the duplicate CTA row was dropped.
const serviceCards = [
  {
    title: "Підбір за авто чи артикулом",
    eyebrow: "VIN · артикул · модель",
    icon: PackageSearch,
    text: "Перевіримо, чи підходить деталь до вашої моделі, року й модифікації, та підкажемо різницю між оригіналом і аналогом.",
    tone: "sky" as const,
  },
  {
    title: "Наявність і аналоги",
    eyebrow: "Актуальні залишки складу",
    icon: Wrench,
    text: "Уточнимо виробника, характеристики та залишок на складі. Якщо позиції немає — запропонуємо сумісний аналог у вашому бюджеті.",
    tone: "cyan" as const,
  },
  {
    title: "Оплата та доставка",
    eyebrow: "Львів і вся Україна",
    icon: Truck,
    text: "Самовивіз із магазину на вул. Перфецького або доставка Новою поштою по Україні. Підкажемо щодо оплати, термінів і повернення.",
    tone: "blue" as const,
  },
] as const;

// Same base/hover gradient crossfade technique as footer.tsx — a static
// background layer and a second, slightly deeper one that fades in on
// hover, so the card gains warmth without moving (no translate) or costing
// an extra paint beyond one opacity transition.
const cardTones = {
  sky: {
    iconBg: "bg-sky-50", iconText: "text-sky-600",
    tagBg: "bg-sky-50", tagText: "text-sky-700",
    cardHoverBorder: "hover:border-sky-200",
    baseGradient: "linear-gradient(135deg, #ffffff 0%, #f5fafe 55%, #eef8ff 100%)",
    hoverGradient: "linear-gradient(135deg, #ffffff 0%, #e6f4ff 45%, #e0f7fa 100%)",
  },
  cyan: {
    iconBg: "bg-teal-50", iconText: "text-teal-600",
    tagBg: "bg-teal-50", tagText: "text-teal-700",
    cardHoverBorder: "hover:border-teal-200",
    baseGradient: "linear-gradient(135deg, #ffffff 0%, #f3fbf9 55%, #ecfbf7 100%)",
    hoverGradient: "linear-gradient(135deg, #ffffff 0%, #ccfbf1 45%, #ecfeff 100%)",
  },
  blue: {
    iconBg: "bg-indigo-50", iconText: "text-indigo-600",
    tagBg: "bg-indigo-50", tagText: "text-indigo-700",
    cardHoverBorder: "hover:border-indigo-200",
    baseGradient: "linear-gradient(135deg, #ffffff 0%, #f5f6fe 55%, #eef1fd 100%)",
    hoverGradient: "linear-gradient(135deg, #ffffff 0%, #e0e7ff 45%, #eef2ff 100%)",
  },
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
      <div className="section-reveal-advantages is-revealed page-shell-inline relative z-10 space-y-7 sm:space-y-10">
        {/* ---- Header + store card: one balanced two-column row ---- */}
        <div className="grid gap-5 lg:grid-cols-2 lg:items-stretch lg:gap-8 xl:gap-10">
          <div className="reveal-adv-copy flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 lg:min-h-[520px] lg:p-8">
            <div className="flex items-center gap-3">
              <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-600 sm:h-11 sm:w-11">
                {/* Shared line-art open-box mark — same style language (viewBox
                    24, thin round-cap stroke, no fill) as HeroIntroCard's own
                    eyebrow SVG, now flattened to match the rest of the
                    homepage's icon tiles instead of a gradient chip. */}
                <svg viewBox="0 0 24 24" className="relative h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3.5 8.2 12 3.5l8.5 4.7" />
                  <path d="M3.5 8.2v8.4L12 21l8.5-4.4V8.2" />
                  <path d="M12 12.6 20.5 8.2M12 12.6 3.5 8.2M12 12.6V21" />
                </svg>
              </span>
              <span className="inline-flex items-center rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-teal-700">
                PartsON · Львів
              </span>
            </div>
            <h2 className="mt-4 max-w-[20ch] font-display text-[27px] font-black leading-[1.08] tracking-[-0.025em] text-slate-950 min-[480px]:text-[30px] sm:text-[34px] lg:text-[31px] xl:text-[35px]">
              Інтернет-магазин <span className="text-teal-600">автозапчастин у Львові</span>
            </h2>
            {/* Distinct from the hero's own H1/lead ("Автозапчастини у Львові
                з доставкою по Україні" + оригінальні деталі й аналоги) —
                this paragraph covers catalog scale and search methods
                instead of repeating that claim, and sets up the category
                breakdown below with matching keywords (двигун, ходова,
                електрика й кузов). */}
            <p className="mt-3.5 max-w-[50ch] text-[15px] leading-[1.68] text-slate-600 sm:text-[16px]">
              Понад 10&nbsp;000 запчастин у каталозі — від двигуна й ходової до електрики та кузовних деталей — для десятків марок легкових авто. Знайдіть потрібну позицію за VIN-кодом, номером кузова, артикулом чи моделлю.
            </p>

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:mt-6 sm:p-5">
              <h3 className="text-[11px] font-black uppercase tracking-[0.12em] text-teal-700">Що знайдете в каталозі</h3>
              <dl className="mt-3.5 space-y-3.5">
                {catalogScope.map((row) => {
                  const RowIcon = row.icon;
                  return (
                    <div key={row.label} className="border-b border-slate-200 pb-3 last:border-0 last:pb-0">
                      <dt className="flex items-center gap-2">
                        <RowIcon className="h-4 w-4 shrink-0 text-teal-600" strokeWidth={2} aria-hidden="true" />
                        <h4 className="text-[13px] font-black leading-snug text-slate-900">{row.label}</h4>
                      </dt>
                      <dd className="mt-1 pl-6 text-[13px] leading-[1.58] text-slate-600">{row.items}</dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          </div>

          {/* store / map card — same flat card language as the rest of the section */}
          <div className="reveal-adv-map flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <a href={STORE_MAPS_URL} target="_blank" rel="noreferrer" className="group/map relative block aspect-[16/9] min-h-[220px] flex-1 cursor-zoom-in overflow-hidden bg-sky-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-sky-400/60 lg:aspect-auto lg:min-h-[360px]">
              <DeferredStoreMap src={STORE_MAP_EMBED_URL} title="Карта розташування PartsON у Львові" />
              <span className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-transparent to-white/10" />
              <span className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-3 rounded-[14px] border border-white/35 bg-slate-950/78 px-3 py-2.5 text-white shadow-lg backdrop-blur-md transition-colors duration-200 group-hover/map:bg-sky-950/90">
                <span className="flex min-w-0 items-center gap-2.5"><MapPin className="h-5 w-5 shrink-0 text-cyan-300" /><span><strong className="block text-[12px] font-black">Львів, вул. Перфецького, 8</strong><small className="block text-[10px] font-semibold text-sky-100/80">Відкрити маршрут у Google Maps</small></span></span><ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover/map:translate-x-1" />
              </span>
            </a>
            <div className="grid grid-cols-2 divide-x divide-slate-200 border-t border-slate-200">
              <a href="tel:+380634211851" className="group/phone flex items-center justify-center gap-2 px-3 py-3.5 text-[12px] font-black text-slate-700 transition-colors hover:bg-slate-50 hover:text-sky-800"><MessageCircle className="h-4 w-4 text-sky-600 transition-transform group-hover/phone:scale-110" />+38 (063) 421-18-51</a>
              <StoreOpenStatus />
            </div>
            {googleReviewCount > 0 && <a href={STORE_MAPS_URL} target="_blank" rel="noreferrer" aria-label={`Переглянути ${googleReviewCount} відгуків PartsON у Google`} className="group/reviews flex cursor-pointer items-center justify-center gap-2 border-t border-amber-200/70 bg-amber-50 px-3 py-3 text-[12px] font-extrabold text-amber-900 transition-colors duration-200 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400"><span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-400 text-white transition-transform duration-200 group-hover/reviews:scale-110"><Star className="h-3.5 w-3.5 fill-current" /></span><span>{googleRatingValue.toFixed(1)} · {googleReviewCount} відгуків Google</span><ArrowRight className="h-3.5 w-3.5 text-amber-600 opacity-60 transition-[transform,opacity] group-hover/reviews:translate-x-1 group-hover/reviews:opacity-100" /></a>}
          </div>
        </div>

        {/* ---- Services: three non-overlapping steps, cards aligned ---- */}
        <div className="reveal-adv-cards grid gap-4 lg:grid-cols-3">
          {serviceCards.map((item) => {
            const Icon = item.icon;
            const tone = cardTones[item.tone];
            return (
              <article
                key={item.title}
                className={`group/service relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 p-6 shadow-sm transition-[box-shadow,border-color] duration-300 ease-out hover:shadow-md ${tone.cardHoverBorder}`}
              >
                {/* Base/hover gradient crossfade — a pure opacity transition
                    between two static layers, so the card warms up on hover
                    without moving or repainting a live gradient. */}
                <span
                  className="pointer-events-none absolute inset-0 transition-opacity duration-300 ease-in-out"
                  style={{ backgroundImage: tone.baseGradient }}
                />
                <span
                  className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 ease-in-out group-hover/service:opacity-100"
                  style={{ backgroundImage: tone.hoverGradient }}
                />
                <div className="relative z-10 flex items-center gap-3">
                  <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone.iconBg} ${tone.iconText}`}>
                    <Icon className="h-5 w-5" strokeWidth={2} />
                  </span>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.04em] ${tone.tagBg} ${tone.tagText}`}>
                    {item.eyebrow}
                  </span>
                </div>
                <h3 className="relative z-10 mt-4 text-[19px] font-bold leading-snug text-slate-900 sm:text-[20px]">{item.title}</h3>
                <p className="relative z-10 mt-2 text-[14px] leading-relaxed text-slate-600 sm:text-[14.5px]">{item.text}</p>
              </article>
            );
          })}
        </div>

        {/* ---- CTA ---- */}
        <div className="reveal-adv-cta parts-help" aria-labelledby="parts-help-title">
          <div className="parts-help-copy">
            <div className="parts-help-eyebrow">
              <span className="parts-help-icon" aria-hidden="true">
                <PackageSearch size={22} strokeWidth={1.8} />
              </span>
              <span>Допомога з підбором</span>
            </div>
            <h3 id="parts-help-title" className="parts-help-title">
              Підберемо деталь <span>для вашого авто</span>
            </h3>
            <p className="parts-help-description">
              Надішліть VIN, артикул або модель авто — перевіримо сумісність,
              наявність і ціну.
            </p>
          </div>
          <div className="parts-help-action">
            <OpenChatButton
              message="Допоможіть підібрати деталь для мого авто."
              label="Написати менеджеру"
              title="Написати менеджеру для підбору запчастини"
              className="parts-help-button"
            />
            <p className="parts-help-note">Деталі запиту уточнимо в чаті</p>
          </div>
        </div>
      </div>
    </section>
  );
}
