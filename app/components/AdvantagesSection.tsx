import { ArrowRight, MapPin, MessageCircle, Star, ChevronDown } from "lucide-react";
import OpenChatButton from "./OpenChatButton";
import SectionRevealAdvantages from "./SectionRevealAdvantages";
import StoreOpenStatus from "./StoreOpenStatus";
import Link from "next/link";

const STORE_MAPS_URL = "https://www.google.com/maps/place/PartsON/@49.8177181,24.0058222,14.15z/data=!4m6!3m5!1s0x473ae70feda65713:0x9fd600e7cfbd0edd!8m2!3d49.8140387!4d23.9892492!16s%2Fg%2F11y4t3x15h?entry=ttu";
const STORE_MAP_EMBED_URL = "https://www.google.com/maps/embed?origin=mfe&pb=!1m2!2m1!1zUGFydHNPTiwg0LLRg9C7LiDQn9C10YDRhNC10YbRjNC60L7Qs9C-LCA4LCDQm9GM0LLRltCy&hl=uk";

// Keep useful search terms in plain, crawlable copy instead of nested cards.
const catalogScope = [
  { label: "Двигун і техобслуговування", items: "Моторні оливи, фільтри, свічки запалювання, ремені та ролики ГРМ." },
  { label: "Підвіска та гальма", items: "Амортизатори, пружини, важелі, підшипники, гальмівні диски й колодки." },
  { label: "Електрика й охолодження", items: "Датчики, котушки, стартери, генератори, радіатори, помпи та термостати." },
] as const;

type Props = { googleRatingValue?: number; googleReviewCount?: number };

export default function AdvantagesSection({ googleRatingValue = 4.3, googleReviewCount = 12 }: Props) {
  return (
    <section className="home-seo-story-section home-bottom-editorial font-ui group/seo relative isolate w-full overflow-hidden border-y border-teal-100/70 bg-[radial-gradient(150%_120%_at_-25%_-25%,rgba(13,148,136,0.1),transparent_66%),radial-gradient(150%_120%_at_125%_130%,rgba(34,211,238,0.09),transparent_64%),linear-gradient(168deg,#e3f4f1_0%,#ebf6f8_44%,#e2eefc_100%)] pb-5 pt-5 text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_-1px_0_rgba(13,148,136,0.1),0_18px_40px_-18px_rgba(15,56,86,0.16)] sm:pb-6 sm:pt-6">
      <SectionRevealAdvantages>
        <header className="home-store-heading"><h2 className="font-display font-display-readable">Магазин автозапчастин <span>у Львові</span></h2><p>PartsON — запчастини для ремонту й техобслуговування. Знайдіть деталь за артикулом, автомобілем або категорією. Забирайте замовлення на вул. Перфецького, 8 чи обирайте доставку по Україні.</p></header>
        <div className="home-story-grid grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(340px,1fr)] lg:items-stretch lg:gap-8 xl:gap-10">
          <div className="reveal-adv-copy home-story-copy flex min-w-0 flex-col lg:order-2">
            <div className="home-store-gallery">
            <figure className="home-store-photo">
              {/* eslint-disable-next-line @next/next/no-img-element -- original photograph of our store */}
              <img src="/storefront/photos/partson-store-1.webp" srcSet="/storefront/photos/partson-store-1-768.webp 768w, /storefront/photos/partson-store-1.webp 1200w" sizes="(min-width: 1024px) 30vw, 70vw" width="1200" height="800" alt="Вхід до магазину автозапчастин PartsON на вул. Перфецького, 8 у Львові" loading="lazy" decoding="async" />
              <figcaption>Завітайте до PartsON · Львів, Перфецького, 8</figcaption>
            </figure>
            <figure className="home-store-detail-photo">
              {/* eslint-disable-next-line @next/next/no-img-element -- actual store photograph */}
              <img src="/storefront/photos/bg/store-6.webp" width="600" height="400" alt="Автозапчастини у вітрині магазину PartsON" loading="lazy" decoding="async" />
            </figure>
            </div>
            <div className="home-story-copy-body flex flex-1 flex-col pt-4 sm:pt-5">
              <h3 className="text-base font-bold text-slate-900">Що є в каталозі</h3>
              <div className="home-store-assortment">
                <ul>
                  {catalogScope.map((row) => (
                    <li key={row.label}><h4>{row.label}</h4><p>{row.items}</p></li>
                  ))}
                </ul>
              </div>
              <div className="mt-4 space-y-2">
                <p className="text-[14px] leading-[1.7] text-slate-700">
                  Перегляньте <Link href="/katalog" className="font-semibold text-teal-700 underline underline-offset-4">каталог автозапчастин</Link>
                  {" "}та <Link href="/inform/delivery" className="font-semibold text-teal-700 underline underline-offset-4">умови доставки й самовивозу</Link>.
                </p>
              </div>
              <nav className="home-store-directories" aria-label="Розділи каталогу"><Link href="/auto">За автомобілем</Link><Link href="/groups">За категорією</Link><Link href="/manufacturers">За виробником</Link></nav>
            </div>
          </div>

          <div className="reveal-adv-map home-story-map flex h-full min-h-0 flex-col overflow-hidden rounded-2xl bg-white shadow-[0_14px_34px_-24px_rgba(10,45,64,0.4)] lg:order-1">
            <div className="home-store-map-frame">
              <iframe src={STORE_MAP_EMBED_URL} title="Google Maps — магазин PartsON, Львів, Перфецького, 8" loading="eager" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
            </div>
            <a href={STORE_MAPS_URL} target="_blank" rel="noreferrer" className="home-store-route">
              <MapPin aria-hidden="true" size={20} />
              <span><strong>Львів, вул. Перфецького, 8</strong><small>Прокласти маршрут у Google Maps</small></span>
              <ArrowRight aria-hidden="true" size={18} />
            </a>
            <div className="grid grid-cols-2 divide-x divide-slate-200 border-t border-slate-200">
              <a href="tel:+380634211851" className="group/phone flex items-center justify-center gap-2 px-3 py-3.5 text-[12px] font-black text-slate-700 transition-colors hover:bg-slate-50 hover:text-sky-800"><MessageCircle className="h-4 w-4 text-sky-600 transition-transform group-hover/phone:scale-110" />+38 (063) 421-18-51</a>
              <StoreOpenStatus />
            </div>
            {googleReviewCount > 0 && <a href={STORE_MAPS_URL} target="_blank" rel="noreferrer" aria-label={`Переглянути ${googleReviewCount} відгуків PartsON у Google`} className="group/reviews flex cursor-pointer items-center justify-center gap-2 border-t border-amber-200/70 bg-amber-50 px-3 py-3 text-[12px] font-extrabold text-amber-900 transition-colors duration-200 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400"><span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-400 text-white transition-transform duration-200 group-hover/reviews:scale-110"><Star className="h-3.5 w-3.5 fill-current" /></span><span>{googleRatingValue.toFixed(1)} · {googleReviewCount} відгуків Google</span><ArrowRight className="h-3.5 w-3.5 text-amber-600 opacity-60 transition-[transform,opacity] group-hover/reviews:translate-x-1 group-hover/reviews:opacity-100" /></a>}
          </div>
        </div>

        <div className="reveal-adv-cta home-store-help" aria-labelledby="parts-help-title">
          <div className="home-store-help-copy">
            <MessageCircle className="home-store-help-icon" size={25} aria-hidden="true" />
            <h3 id="parts-help-title">Є запитання про запчастини?</h3>
            <p>Надішліть VIN-код і назву деталі. Допоможемо перевірити сумісність, уточнимо наявність та ціну.</p>
            <OpenChatButton message="Допоможіть підібрати деталь для мого авто." label="Запитати менеджера" title="Написати менеджеру для підбору запчастини" className="parts-help-button" />
          </div>
          <div className="home-store-questions">
            {[
              ["Як підібрати запчастини до мого авто?", "Оберіть марку, модель і модифікацію автомобіля або знайдіть деталь за артикулом. Для перевірки сумісності надішліть менеджеру VIN-код."],
              ["Де забрати замовлення у Львові?", "Завітайте до магазину PartsON на вул. Перфецького, 8. Розташування магазину та маршрут можна переглянути на карті Google."],
              ["Чи є доставка по Україні?", "Так, замовлення можна отримати доставкою по Україні. Спосіб отримання уточніть у менеджера або в розділі доставки й самовивозу."],
            ].map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={17} aria-hidden="true" /></summary><p>{answer}</p></details>)}
          </div>
        </div>
      </SectionRevealAdvantages>
    </section>
  );
}
