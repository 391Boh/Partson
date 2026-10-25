import { ArrowRight, MapPin, MessageCircle, Star } from "lucide-react";
import DeferredSeoPhotosBackdrop, { DeferredStoreMap } from "./DeferredHomeVisuals";
import OpenChatButton from "./OpenChatButton";
import SectionRevealAdvantages from "./SectionRevealAdvantages";
import StoreOpenStatus from "./StoreOpenStatus";
import Link from "next/link";

const STORE_MAPS_URL = "https://www.google.com/maps/place/PartsON/@49.8177181,24.0058222,14.15z/data=!4m6!3m5!1s0x473ae70feda65713:0x9fd600e7cfbd0edd!8m2!3d49.8140387!4d23.9892492!16s%2Fg%2F11y4t3x15h?entry=ttu";
const STORE_MAP_EMBED_URL = "https://www.google.com/maps/embed?origin=mfe&pb=!1m2!2m1!1zUGFydHNPTiwg0LLRg9C7LiDQn9C10YDRhNC10YbRjNC60L7Qs9C-LCA4LCDQm9GM0LLRltCy&hl=uk";

// Keep useful search terms in plain, crawlable copy instead of nested cards.
const catalogScope = [
  {
    label: "Двигун і технічне обслуговування",
    items: "Моторні оливи, масляні, повітряні та салонні фільтри, ремені й ролики ГРМ, свічки запалювання. Для системи охолодження — помпи, термостати, радіатори та патрубки.",
  },
  {
    label: "Підвіска та гальмівна система",
    items: "Амортизатори, пружини, важелі підвіски, сайлентблоки, кульові опори й підшипники маточин. Для гальмівної системи — диски, колодки та супорти.",
  },
  {
    label: "Автоелектрика, освітлення та кузов",
    items: "Датчики, котушки запалювання, стартери й генератори, фари, ліхтарі, дзеркала та склоочисники. В асортименті також є автохімія.",
  },
] as const;

type Props = { googleRatingValue?: number; googleReviewCount?: number };

export default function AdvantagesSection({ googleRatingValue = 4.3, googleReviewCount = 12 }: Props) {
  return (
    <section className="home-seo-story-section font-ui group/seo relative isolate w-full overflow-hidden border-y border-teal-100/70 bg-[radial-gradient(150%_120%_at_-25%_-25%,rgba(13,148,136,0.1),transparent_66%),radial-gradient(150%_120%_at_125%_130%,rgba(34,211,238,0.09),transparent_64%),linear-gradient(168deg,#e3f4f1_0%,#ebf6f8_44%,#e2eefc_100%)] pb-5 pt-5 text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_-1px_0_rgba(13,148,136,0.1),0_18px_40px_-18px_rgba(15,56,86,0.16)] sm:pb-6 sm:pt-6">
      <DeferredSeoPhotosBackdrop />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-16 bg-[linear-gradient(to_bottom,rgba(227,244,241,0.85)_0%,rgba(227,244,241,0.22)_58%,transparent_100%)]" />
      <span className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-[2px] bg-[linear-gradient(to_top,rgba(15,118,110,0.18),transparent)]" />
      <SectionRevealAdvantages>
        {/* ---- Essential overview and store location ---- */}
        <div className="home-story-grid grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(340px,1fr)] lg:items-stretch lg:gap-8 xl:gap-10">
          <div className="reveal-adv-copy home-story-copy flex min-w-0 flex-col lg:order-1">
            <div className="home-story-intro">
              <div className="home-story-intro-photo" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element -- static responsive photos are served directly by nginx */}
                <img
                  src="/images/directories/auto-workshop-v1.webp"
                  srcSet="/images/directories/auto-workshop-v1-960.webp 960w, /images/directories/auto-workshop-v1.webp 1920w"
                  sizes="(max-width: 767px) 100vw, (max-width: 1279px) 65vw, 900px"
                  alt=""
                  width="1920"
                  height="1080"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div className="home-story-intro-shade" />
              <div className="home-story-intro-content">
                <h2 className="font-display font-display-readable">
                  Автозапчастини <span>у Львові</span>
                </h2>
                <div className="home-story-intro-copy">
                  <p>
                    У PartsON можна підібрати запчастини для технічного
                    обслуговування й ремонту автомобіля.
                  </p>
                  <p>
                    Шукайте за артикулом або категорією. Сумісність із вашим
                    авто допоможемо перевірити за VIN-кодом.
                  </p>
                </div>
              </div>
            </div>
            <div className="home-story-copy-body flex flex-1 flex-col pt-4 sm:pt-5">
              <h3 className="text-base font-bold text-slate-900">Що є в каталозі</h3>
              <ul className="mt-2 divide-y divide-teal-900/10">
                {catalogScope.map((row) => (
                  <li key={row.label} className="py-2.5 first:pt-0 last:pb-0">
                    <h4 className="text-sm font-bold leading-snug text-slate-900">{row.label}</h4>
                    <p className="mt-1 text-sm leading-[1.6] text-slate-700">{row.items}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-4 space-y-2">
                <p className="home-description text-[14px] leading-[1.7] text-slate-700">
                  Перед замовленням звірте характеристики деталі з вимогами
                  виробника автомобіля. Якщо сумніваєтеся у виборі, надішліть
                  менеджеру VIN-код.
                </p>
                <p className="text-[14px] leading-[1.7] text-slate-700">
                  Перегляньте <Link href="/katalog" className="font-semibold text-teal-700 underline underline-offset-4">каталог автозапчастин</Link>
                  {" "}та <Link href="/inform/delivery" className="font-semibold text-teal-700 underline underline-offset-4">умови доставки й самовивозу</Link>.
                </p>
              </div>
            </div>
          </div>

          <div className="reveal-adv-map home-story-map flex h-full min-h-0 flex-col overflow-hidden rounded-2xl bg-white shadow-[0_14px_34px_-24px_rgba(10,45,64,0.4)] lg:order-2">
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

        <div className="reveal-adv-cta flex flex-col gap-4 border-t border-teal-900/10 pt-5 sm:flex-row sm:items-center sm:justify-between sm:pt-6" aria-labelledby="parts-help-title">
          <div className="min-w-0">
            <h3 id="parts-help-title" className="text-lg font-bold leading-snug text-slate-900">
              Підберемо деталь для вашого авто
            </h3>
            <p className="mt-1 max-w-[65ch] text-sm leading-relaxed text-slate-600">
              Надішліть VIN-код, артикул або марку й модель авто — перевіримо
              сумісність, наявність і ціну.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <OpenChatButton
              message="Допоможіть підібрати деталь для мого авто."
              label="Написати менеджеру"
              title="Написати менеджеру для підбору запчастини"
              className="parts-help-button"
            />
            <p className="text-xs text-slate-600">Відповімо в чаті та допоможемо з підбором</p>
          </div>
        </div>
      </SectionRevealAdvantages>
    </section>
  );
}
