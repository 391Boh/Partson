import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { buildCatalogCategoryPath } from "app/lib/catalog-links";

// Homepage banner for the VITOL supplier range (accessories, car care,
// tools), all "під замовлення". Server-rendered, no client JS; the photos are
// real catalog products served by the product-image route.

const ARRIVALS_GROUP = "Автотовари та інструмент";

const SHOWCASE: Array<{ code: string; label: string; alt: string }> = [
  { code: "РТ-00004897", label: "Інструмент", alt: "Набір головок Alloid, 47 предметів" },
  { code: "РТ-00004386", label: "LED-світло", alt: "Фара робочого світла PULSO" },
  { code: "РТ-00002690", label: "Салон", alt: "Чохол на кермо VITOL" },
  { code: "РТ-00001926", label: "Освіжувачі", alt: "Освіжувач повітря AREON Fresh Wave" },
];

const BRANDS = ["ALLOID", "HANS", "PULSO", "VOIN", "AREON", "VITOL"];

export default function HomeNewArrivalsBanner() {
  const href = buildCatalogCategoryPath("", ARRIVALS_GROUP);

  return (
    <section aria-labelledby="home-arrivals-title" className="font-ui bg-[#edf4f7] py-6 sm:py-8">
      <div className="mx-auto w-full max-w-[var(--page-shell-max)] px-[var(--page-shell-gutter)]">
        <div className="group relative isolate grid overflow-hidden rounded-[28px] bg-[linear-gradient(120deg,#091d38_0%,#0d3247_55%,#0f4a56_100%)] text-white shadow-[0_24px_48px_-28px_rgb(8_42_62/70%),inset_0_1px_0_rgb(255_255_255/10%)] md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          {/* Light: a teal glow under the photos and a faint blueprint grid. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 -z-10 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgb(45_212_191/32%)_0%,rgb(56_189_248/12%)_42%,transparent_70%)]"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 opacity-[.07] [background-image:linear-gradient(rgb(255_255_255/60%)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/60%)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:linear-gradient(90deg,transparent,#000_55%)]"
          />

          <div className="flex flex-col items-start justify-center gap-4 px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.08] px-3 py-1 text-[11px] font-[780] uppercase leading-[1.4] tracking-[.07em] text-[#c9f7f2] shadow-[inset_0_1px_0_rgb(255_255_255/12%)]">
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full rounded-full bg-[#5eead4] opacity-70 motion-safe:animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#5eead4]" />
              </span>
              Нове надходження
            </span>

            <h2
              id="home-arrivals-title"
              className="max-w-[22ch] text-[clamp(23px,2.3vw,32px)] font-[760] leading-[1.12] tracking-[-.022em] text-white [text-wrap:balance]"
            >
              Автоаксесуари, автохімія та&nbsp;інструмент
            </h2>

            <p className="max-w-[48ch] text-[14px] font-medium leading-[1.6] text-[#d7e9f1] sm:text-[15px] [text-wrap:pretty]">
              Набори ключів і головок, LED-світло, чохли на кермо, освіжувачі та інше для авто й гаража —
              тепер у каталозі PartsON. Позиції під замовлення: менеджер підтвердить строк постачання.
            </p>

            <ul aria-label="Бренди" className="flex flex-wrap gap-1.5">
              {BRANDS.map((brand) => (
                <li
                  key={brand}
                  className="rounded-full border border-white/12 bg-white/[0.05] px-2.5 py-1 text-[11px] font-bold tracking-[.04em] text-[#e6f3f8]"
                >
                  {brand}
                </li>
              ))}
            </ul>

            <Link
              href={href}
              prefetch={false}
              className="mt-1 inline-flex min-h-11 items-center gap-2.5 rounded-full bg-[linear-gradient(135deg,#5eead4,#38bdf8)] py-2 pl-5 pr-2 text-[14px] font-extrabold text-[#062033] shadow-[0_10px_24px_-12px_rgb(56_189_248/80%)] transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(.16,1,.3,1)] after:absolute after:inset-0 after:rounded-[28px] after:content-[''] hover:-translate-y-px hover:shadow-[0_14px_28px_-12px_rgb(56_189_248/90%)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#5eead4] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              Дивитися новинки
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#062033]/90 text-[#5eead4]">
                <ArrowRight size={16} aria-hidden="true" />
              </span>
            </Link>
          </div>

          <ul
            aria-hidden="true"
            className="grid w-full grid-cols-4 gap-2 px-5 pb-6 sm:gap-3 sm:px-8 sm:pb-8 md:max-w-[400px] md:grid-cols-2 md:content-center md:justify-self-end md:gap-3.5 md:py-9 md:pl-2 md:pr-8 lg:max-w-[440px] lg:gap-4 lg:pr-10"
          >
            {SHOWCASE.map((item, index) => (
              <li
                key={item.code}
                className={`flex flex-col overflow-hidden rounded-[18px] bg-white shadow-[0_18px_32px_-20px_rgb(2_6_23/75%)] ring-1 ring-white/60 transition-transform duration-300 ease-[cubic-bezier(.16,1,.3,1)] motion-reduce:transition-none md:rounded-[22px] ${
                  index % 2 === 1 ? "md:translate-y-4 md:group-hover:translate-y-2" : "md:group-hover:-translate-y-1"
                }`}
              >
                <span className="relative block aspect-square p-1.5 sm:p-3 md:p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element -- the product-image route already serves sized WebP */}
                  <img
                    src={`/product-image/${encodeURIComponent(item.code)}`}
                    alt={item.alt}
                    width={500}
                    height={500}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-contain"
                  />
                </span>
                <span className="hidden border-t border-[#e3edf2] px-3 py-2 text-[12px] font-bold text-[#163343] md:block">
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
