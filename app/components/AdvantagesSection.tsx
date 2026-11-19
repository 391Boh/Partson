import { ArrowRight, MapPin, MessageCircle, Star } from "lucide-react";
import StoreVirtualTour from "./StoreVirtualTour";
import StoreLocationMap from "./StoreLocationMap";
import { STORE_TOUR_EMBED_URL, STORE_TOUR_URL } from "app/lib/store-virtual-tour";
import SectionRevealAdvantages from "./SectionRevealAdvantages";
import StoreOpenStatus from "./StoreOpenStatus";
import HomeStoreFaq from "./HomeStoreFaq";
import { HOME_FAQ_JSON_LD } from "app/lib/home-faq";
import { safeJsonLd } from "app/lib/safe-json-ld";

const STORE_MAPS_URL = "https://www.google.com/maps/place/PartsON/@49.8177181,24.0058222,14.15z/data=!4m6!3m5!1s0x473ae70feda65713:0x9fd600e7cfbd0edd!8m2!3d49.8140387!4d23.9892492!16s%2Fg%2F11y4t3x15h?entry=ttu";
const STORE_MAP_EMBED_URL = "https://www.google.com/maps/embed?origin=mfe&pb=!1m2!2m1!1zUGFydHNPTiwg0LLRg9C7LiDQn9C10YDRhNC10YbRjNC60L7Qs9C-LCA4LCDQm9GM0LLRltCy&hl=uk";

type Props = { googleRatingValue?: number; googleReviewCount?: number };

export default function AdvantagesSection({ googleRatingValue = 4.3, googleReviewCount = 12 }: Props) {
  return (
    <section className="home-seo-story-section home-bottom-editorial home-store-editorial font-ui group/seo relative isolate w-full overflow-hidden border-y border-teal-100/70 bg-[radial-gradient(150%_120%_at_-25%_-25%,rgba(13,148,136,0.1),transparent_66%),radial-gradient(150%_120%_at_125%_130%,rgba(34,211,238,0.09),transparent_64%),linear-gradient(168deg,#e3f4f1_0%,#ebf6f8_44%,#e2eefc_100%)] pb-5 pt-5 text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_-1px_0_rgba(13,148,136,0.1),0_18px_40px_-18px_rgba(15,56,86,0.16)] sm:pb-6 sm:pt-6">
            <div className="home-store-photo-background" aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element -- one lightweight original store photograph */}
              <img src="/storefront/photos/bg/store-2-detail.webp" width="765" height="1020" alt="" loading="lazy" decoding="async" />
            </div>
      <SectionRevealAdvantages>
        {/* Visit: the 360° tour and the map in one dark card, heading on top. */}
        <section
          aria-labelledby="store-visit-title"
          className="font-ui relative isolate mx-[calc(50%-50vw)] -my-2 overflow-hidden py-32 sm:py-36"
        >
          {/* Background with depth: the dark ground fades in and out at the
              top and bottom edges (mask), so the light sections around it
              melt into it. On it: a teal key light from the upper left, a sky
              rim light at the lower right, a perspective grid floor receding
              to a glowing horizon, and a vignette. Static gradients only. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 [mask-image:linear-gradient(180deg,transparent_0,rgb(0_0_0/8%)_32px,rgb(0_0_0/28%)_72px,rgb(0_0_0/58%)_112px,rgb(0_0_0/84%)_148px,#000_180px,#000_calc(100%-180px),rgb(0_0_0/84%)_calc(100%-148px),rgb(0_0_0/58%)_calc(100%-112px),rgb(0_0_0/28%)_calc(100%-72px),rgb(0_0_0/8%)_calc(100%-32px),transparent_100%)]">
            <div className="absolute inset-0 bg-[radial-gradient(130%_95%_at_18%_8%,#2a8a93_0%,#1d6676_34%,#185468_62%,#164a5e_100%)]" />
            <div className="absolute -left-[10%] top-[6%] h-[70%] w-[55%] rounded-full bg-[radial-gradient(closest-side,rgb(94_234_212/26%),transparent)]" />
            <div className="absolute -right-[8%] bottom-[2%] h-[65%] w-[50%] rounded-full bg-[radial-gradient(closest-side,rgb(125_211_252/22%),transparent)]" />
            <div className="absolute left-1/2 top-[38%] h-[46%] w-[80%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgb(94_234_212/12%),transparent)]" />
            <div className="absolute inset-x-[-25%] bottom-0 h-[58%] origin-bottom [background-image:linear-gradient(rgb(204_251_241/16%)_1px,transparent_1px),linear-gradient(90deg,rgb(204_251_241/16%)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:linear-gradient(180deg,transparent,#000_45%,#000_75%,transparent)] [transform:perspective(520px)_rotateX(64deg)]" />
            <div className="absolute inset-x-0 top-[44%] h-px bg-[linear-gradient(90deg,transparent,rgb(94_234_212/35%)_30%,rgb(125_211_252/35%)_70%,transparent)]" />
            <div className="absolute inset-0 shadow-[inset_0_0_140px_20px_rgb(8_40_55/22%)]" />
          </div>
          <div className="mx-auto w-full max-w-[var(--page-shell-max)] px-[var(--page-shell-gutter)]">
          <header className="mb-6 flex flex-col items-start gap-3 sm:mb-8">
            <div className="min-w-0">
              <p className="!m-0 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.16em] text-[#5eead4]">
                <MapPin size={14} aria-hidden="true" />Магазин у Львові
              </p>
              <h3 id="store-visit-title" className="font-display font-display-readable !m-0 !mt-2 !text-[clamp(26px,1.3vw+19px,38px)] !font-[800] !leading-[1.08] !tracking-[-.03em] !text-white">
                Завітайте в <span className="bg-[linear-gradient(90deg,#5eead4,#38bdf8)] bg-clip-text text-transparent">PartsON</span>
              </h3>
            </div>
            <p className="!m-0 max-w-[60ch] text-[14.5px] font-medium leading-[1.6] text-[#b6d3dd] sm:text-[16px]">
              Огляньте магазин у панорамі 360° ще до візиту, а на карті прокладіть маршрут до вул.&nbsp;Перфецького,&nbsp;8.
            </p>
          </header>
          <div className="grid gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
            <StoreVirtualTour embedUrl={STORE_TOUR_EMBED_URL} tourUrl={STORE_TOUR_URL} />
              <div className="reveal-adv-map home-story-map flex h-full min-h-0 flex-col overflow-hidden !rounded-[20px] bg-white shadow-[0_14px_34px_-24px_rgba(10,45,64,0.4)] lg:order-1">
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
                {googleReviewCount > 0 && <a href={STORE_MAPS_URL} target="_blank" rel="noreferrer" aria-label={`${googleRatingValue.toFixed(1)} · ${googleReviewCount} відгуків Google — відкриються в Google Картах`} className="home-store-review-link group/reviews flex cursor-pointer items-center justify-center gap-2 border-t border-amber-200/70 bg-amber-50 px-3 py-3 text-[12px] font-extrabold text-amber-900 transition-colors duration-200 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400"><span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-400 text-white transition-transform duration-200 group-hover/reviews:scale-110"><Star className="h-3.5 w-3.5 fill-current" /></span><span>{googleRatingValue.toFixed(1)} · {googleReviewCount} відгуків Google</span><ArrowRight className="h-3.5 w-3.5 text-amber-600 opacity-60 transition-[transform,opacity] group-hover/reviews:translate-x-1 group-hover/reviews:opacity-100" /></a>}
              </div>
          </div>
          </div>
        </section>

        <div className="reveal-adv-cta home-store-help" aria-labelledby="parts-help-title">
          <div className="home-store-help-photo" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element -- decorative, lazy-loaded background exclusive to the homepage FAQ */}
            <img src="/images/home/faq-parts-still-life-v1.webp" width="2160" height="720" alt="" loading="lazy" decoding="async" />
          </div>
          {/* The chat bubble and the footer's call-to-action already ask the
              visitor to write or call; this block only answers questions. */}
          <div className="home-store-help-copy">
            <span aria-hidden="true" className="mb-3.5 flex items-center gap-1.5">
              <span className="h-[5px] w-9 rounded-full bg-[linear-gradient(90deg,#0d9488,#38bdf8)] sm:w-11" />
              <span className="h-[5px] w-[5px] rounded-full bg-[#38bdf8]/70" />
            </span>
            <h3
              id="parts-help-title"
              className="font-display font-display-readable !m-0 !text-[clamp(26px,1.2vw+19px,36px)] !font-[800] !leading-[1.08] !tracking-[-.03em] !text-[#0b2233] ![text-shadow:0_1px_0_rgb(255_255_255/90%),0_2px_0_rgb(8_70_90/14%),0_8px_18px_rgb(15_60_80/22%)] [-webkit-text-stroke:3px_rgb(255_255_255/80%)] [paint-order:stroke_fill]"
            >
              Часті <span className="bg-[linear-gradient(180deg,transparent_60%,rgb(94_234_212/45%)_60%,rgb(94_234_212/45%)_92%,transparent_92%)] px-[0.08em] text-[#086f7a]">запитання</span>
            </h3>
            <p className="!mb-0 !mt-3 max-w-[34ch] text-[14.5px] font-medium leading-[1.6] text-[#2b4f63] sm:text-[15.5px]">
              Коротко про підбір запчастин, самовивіз у Львові та доставку.
            </p>
          </div>
          <HomeStoreFaq />
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(HOME_FAQ_JSON_LD) }} />
        </div>
      </SectionRevealAdvantages>
    </section>
  );
}
