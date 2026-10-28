import { ArrowRight, MapPin, MessageCircle, Star } from "lucide-react";
import StoreVirtualTour from "./StoreVirtualTour";
import StoreLocationMap from "./StoreLocationMap";
import { STORE_TOUR_EMBED_URL, STORE_TOUR_URL } from "app/lib/store-virtual-tour";
import OpenChatButton from "./OpenChatButton";
import SectionRevealAdvantages from "./SectionRevealAdvantages";
import StoreOpenStatus from "./StoreOpenStatus";
import Link from "next/link";
import HomeStoreFaq from "./HomeStoreFaq";
import { HOME_FAQ_JSON_LD } from "app/lib/home-faq";
import { safeJsonLd } from "app/lib/safe-json-ld";

const STORE_MAPS_URL = "https://www.google.com/maps/place/PartsON/@49.8177181,24.0058222,14.15z/data=!4m6!3m5!1s0x473ae70feda65713:0x9fd600e7cfbd0edd!8m2!3d49.8140387!4d23.9892492!16s%2Fg%2F11y4t3x15h?entry=ttu";
const STORE_MAP_EMBED_URL = "https://www.google.com/maps/embed?origin=mfe&pb=!1m2!2m1!1zUGFydHNPTiwg0LLRg9C7LiDQn9C10YDRhNC10YbRjNC60L7Qs9C-LCA4LCDQm9GM0LLRltCy&hl=uk";

// Keep useful search terms in plain, crawlable copy instead of nested cards.
const catalogScope = [
  { label: "Планове техобслуговування", items: "Фільтри, моторні оливи, свічки запалювання, ремені й ролики ГРМ." },
  { label: "Підвіска та гальма", items: "Амортизатори, пружини, важелі, підшипники, гальмівні диски й колодки." },
  { label: "Електрика й охолодження", items: "Датчики, котушки, стартери, генератори, радіатори, помпи та термостати." },
] as const;

type Props = { googleRatingValue?: number; googleReviewCount?: number };

export default function AdvantagesSection({ googleRatingValue = 4.3, googleReviewCount = 12 }: Props) {
  return (
    <section className="home-seo-story-section home-bottom-editorial home-store-editorial font-ui group/seo relative isolate w-full overflow-hidden border-y border-teal-100/70 bg-[radial-gradient(150%_120%_at_-25%_-25%,rgba(13,148,136,0.1),transparent_66%),radial-gradient(150%_120%_at_125%_130%,rgba(34,211,238,0.09),transparent_64%),linear-gradient(168deg,#e3f4f1_0%,#ebf6f8_44%,#e2eefc_100%)] pb-5 pt-5 text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_-1px_0_rgba(13,148,136,0.1),0_18px_40px_-18px_rgba(15,56,86,0.16)] sm:pb-6 sm:pt-6">
            <div className="home-store-photo-background" aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element -- one lightweight original store photograph */}
              <img src="/storefront/photos/bg/store-2-detail.webp" width="765" height="1020" alt="" loading="lazy" decoding="async" />
            </div>
      <SectionRevealAdvantages>
        <div className="home-story-grid grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(340px,1fr)] lg:items-stretch lg:gap-8 xl:gap-10">
          <div className="reveal-adv-copy home-story-copy flex min-w-0 flex-col lg:order-2">
            <div className="home-story-copy-body flex flex-1 flex-col pt-4 sm:pt-5">
              <header className="home-store-heading home-store-card-heading">
                <span className="home-store-kicker">Каталог PartsON · Львів</span>
                <h2 className="font-display font-display-readable">Автозапчастини{" "}<br /><span>для вашого авто</span></h2>
                <p>Для техобслуговування й ремонту. Шукайте за автомобілем, артикулом або категорією — забирайте у Львові чи замовляйте доставку по Україні.</p>
              </header>
              <div className="home-store-assortment">
                <ul>
                  {catalogScope.map((row, index) => (
                    <li key={row.label}><span className="home-store-row-number" aria-hidden="true">0{index + 1}</span><div><h3>{row.label}</h3><p>{row.items}</p></div></li>
                  ))}
                </ul>
              </div>
              <div className="home-store-catalog-actions">
                <p className="text-[14px] leading-[1.7] text-slate-700">
                  <Link href="/katalog" className="home-store-catalog-link">Перейти до каталогу<ArrowRight size={17} aria-hidden="true" /></Link>
                  <Link href="/inform/delivery" className="home-store-delivery-link">Доставка й самовивіз</Link>
                </p>
              </div>
              <nav className="home-store-directories" aria-label="Розділи каталогу"><Link href="/auto">За автомобілем</Link><Link href="/groups">За категорією</Link><Link href="/manufacturers">За виробником</Link></nav>
            </div>
          </div>

          <div className="reveal-adv-map home-story-map flex h-full min-h-0 flex-col overflow-hidden rounded-2xl bg-white shadow-[0_14px_34px_-24px_rgba(10,45,64,0.4)] lg:order-1">
            <header className="home-store-location-heading">
              <div><span>Магазин у Львові</span><h3>Завітайте в PartsON</h3></div>
              <MapPin size={23} strokeWidth={1.6} aria-hidden="true" />
            </header>
            <StoreLocationMap src={STORE_MAP_EMBED_URL} />
            <a href={STORE_MAPS_URL} target="_blank" rel="noreferrer" className="home-store-route">
              <MapPin aria-hidden="true" size={20} />
              <span><strong>Львів, вул. Перфецького, 8</strong><small>Прокласти маршрут у Google Maps</small></span>
              <ArrowRight aria-hidden="true" size={18} />
            </a>
            <div className="home-store-contact-row grid grid-cols-2 divide-x divide-slate-200 border-t border-slate-200">
              <a href="tel:+380634211851" className="group/phone flex items-center justify-center gap-2 px-3 py-3.5 text-[12px] font-black text-slate-700 transition-colors hover:bg-slate-50 hover:text-sky-800"><MessageCircle className="h-4 w-4 text-sky-600 transition-transform group-hover/phone:scale-110" />+38 (063) 421-18-51</a>
              <StoreOpenStatus />
            </div>
            {googleReviewCount > 0 && <a href={STORE_MAPS_URL} target="_blank" rel="noreferrer" aria-label={`Переглянути ${googleReviewCount} відгуків PartsON у Google`} className="home-store-review-link group/reviews flex cursor-pointer items-center justify-center gap-2 border-t border-amber-200/70 bg-amber-50 px-3 py-3 text-[12px] font-extrabold text-amber-900 transition-colors duration-200 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400"><span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-400 text-white transition-transform duration-200 group-hover/reviews:scale-110"><Star className="h-3.5 w-3.5 fill-current" /></span><span>{googleRatingValue.toFixed(1)} · {googleReviewCount} відгуків Google</span><ArrowRight className="h-3.5 w-3.5 text-amber-600 opacity-60 transition-[transform,opacity] group-hover/reviews:translate-x-1 group-hover/reviews:opacity-100" /></a>}
          </div>
        </div>

        <StoreVirtualTour embedUrl={STORE_TOUR_EMBED_URL} tourUrl={STORE_TOUR_URL} />

        <div className="reveal-adv-cta home-store-help" aria-labelledby="parts-help-title">
          <div className="home-store-help-photo" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element -- decorative, lazy-loaded background exclusive to the homepage FAQ */}
            <img src="/images/home/faq-parts-still-life-v1.webp" width="2160" height="720" alt="" loading="lazy" decoding="async" />
          </div>
          <div className="home-store-help-copy">
            <h3 id="parts-help-title">Допоможемо обрати{" "}<br />й замовити</h3>
            <p>Не впевнені, яка деталь підійде? Напишіть менеджеру марку й модель авто або артикул. VIN-код допоможе перевірити сумісність.</p>
            <OpenChatButton message="Допоможіть підібрати деталь для мого авто." label="Запитати менеджера" title="Написати менеджеру для підбору запчастини" className="parts-help-button" />
          </div>
          <HomeStoreFaq />
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(HOME_FAQ_JSON_LD) }} />
        </div>
      </SectionRevealAdvantages>
    </section>
  );
}
