import Link from "next/link";
import { ArrowRight, ArrowUpRight, Clock3 } from "lucide-react";

import { buildGroupItemPath, buildGroupPath } from "app/lib/catalog-links";
import { buildPlainSeoSlug } from "app/lib/seo-slug";
import { VITOL_GROUPS, VITOL_SECTION, type VitolGroup } from "app/lib/vitol-groups";

// Homepage showcase for the new accessories / car care / tools range (VITOL,
// all "під замовлення"), in the light picker-section family of the homepage.
// Full-bleed: a layered mint → sky gradient with real product photos floating
// at the edges (white photo backgrounds vanish under mix-blend-multiply), the
// heading in the pickers' display type, then eight group cards that open the
// real 1C group pages under "Інше" (/groups/inshe/<group>, same slug rules as
// the directory). Server-rendered, no client JS; every photo is a catalog
// product served by the product-image route.

const productImage = (code: string) => `/product-image/${encodeURIComponent(code)}`;

// Brands: the leading producers of each group in the VITOL feed.
const CARDS: Array<{ group: VitolGroup; brands: string; code: string }> = [
  { group: "Ручний інструмент", brands: "ALLOID · HANS", code: "РТ-00004897" },
  { group: "Освіжувачі повітря", brands: "AREON · VITOL · TASOTTI", code: "РТ-00001926" },
  { group: "Автохімія та догляд", brands: "VITOL · VOIN · ABRO", code: "РТ-00003312" },
  { group: "Автолампи", brands: "PULSO", code: "РТ-00002289" },
  { group: "Фари та ліхтарі", brands: "PULSO · DLAA · VOIN", code: "РТ-00004386" },
  { group: "Чохли на кермо та сидіння", brands: "VITOL · VOIN · MILEX", code: "РТ-00002690" },
  { group: "Аварійний набір водія", brands: "VITOL · ШТУРМОВИК · PULSO", code: "РТ-00001948" },
  { group: "Домкрати", brands: "VITOL · IRON HAND", code: "РТ-00002144" },
];

// Decoration around the heading (wide screens only): tools and lamps from the range.
const FLOATING: Array<{ code: string; className: string }> = [
  { code: "РТ-00004117", className: "left-[3%] top-8 w-[170px] -rotate-[6deg] 2xl:left-[8%]" }, // компресор «Ураган»
  { code: "РТ-00004939", className: "left-[15%] top-[140px] w-[140px] rotate-[28deg] 2xl:left-[19%]" }, // тріскачка Alloid
  { code: "РТ-00005117", className: "left-[5%] top-[215px] w-[150px] rotate-[45deg] opacity-80 2xl:left-[10%]" }, // ключ комбінований HANS
  { code: "РТ-00002367", className: "right-[3%] top-10 w-[200px] -rotate-[30deg] 2xl:right-[8%]" }, // динамометричний ключ HANS
  { code: "РТ-00002256", className: "right-[17%] top-[60px] w-[150px] rotate-[8deg] 2xl:right-[21%]" }, // лампи PULSO
  { code: "РТ-00004956", className: "right-[16%] top-[200px] w-[110px] rotate-[62deg] opacity-80 2xl:right-[20%]" }, // молоток Alloid
];

const sectionSlug = buildPlainSeoSlug(VITOL_SECTION);
const groupHref = (group: VitolGroup) => buildGroupItemPath(sectionSlug, buildPlainSeoSlug(group));

export default function HomeNewArrivalsBanner() {
  return (
    <section
      aria-labelledby="home-arrivals-title"
      className="font-ui relative isolate overflow-hidden py-12 text-[#0f2b3d] [contain-intrinsic-size:auto_1000px] [content-visibility:auto] sm:py-16 lg:py-20"
    >
      {/* Background: gradient, two glows, a dotted texture, floating products. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(160deg,#f2fbf9_0%,#e4f3f4_34%,#dceaf6_68%,#e8ecf9_100%)]" />
        <div className="absolute -left-[12%] -top-[30%] h-[680px] w-[680px] rounded-full bg-[radial-gradient(circle,rgb(45_212_191/26%)_0%,rgb(45_212_191/8%)_45%,transparent_70%)]" />
        <div className="absolute -bottom-[35%] -right-[10%] h-[760px] w-[760px] rounded-full bg-[radial-gradient(circle,rgb(56_189_248/24%)_0%,rgb(99_102_241/8%)_48%,transparent_72%)]" />
        <div className="absolute inset-0 opacity-50 [background-image:radial-gradient(rgb(15_76_92/14%)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_30%,#000,transparent)]" />
        <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgb(8_119_131/30%),transparent)]" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,transparent,rgb(8_119_131/30%),transparent)]" />
        <div className="hidden lg:block">
          {FLOATING.map((item) => (
            // eslint-disable-next-line @next/next/no-img-element -- decorative, served sized by the product-image route
            <img
              key={item.code}
              src={productImage(item.code)}
              alt=""
              width={500}
              height={500}
              loading="lazy"
              decoding="async"
              className={`absolute aspect-square object-contain mix-blend-multiply ${item.className}`}
            />
          ))}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[var(--page-shell-max)] px-[var(--page-shell-gutter)]">
        {/* Two deliberate heading lines, a balanced lead, one quiet note. */}
        <header className="mx-auto flex max-w-[46rem] flex-col items-center text-center">
          <h2
            id="home-arrivals-title"
            className="font-display font-display-readable text-[clamp(28px,3.3vw,46px)] font-[800] leading-[1.08] tracking-[-.03em] text-[#0f2b3d] [text-shadow:0_2px_1px_rgb(255_255_255/80%)]"
          >
            <span className="block">Нове надходження</span>
            <span className="mt-1.5 block text-[#087783] [text-wrap:balance] sm:mt-2">
              <span className="underline decoration-[#7ebdc4] decoration-2 underline-offset-[8px] [text-decoration-skip-ink:auto] [box-decoration-break:clone]">
                аксесуари, автохімія та&nbsp;інструмент
              </span>
            </span>
          </h2>
          <p className="mt-5 max-w-[46ch] text-[15px] font-medium leading-[1.65] text-[#31566b] sm:mt-6 sm:text-[17px] [text-wrap:balance]">
            Понад 4&nbsp;300 товарів для авто й гаража в&nbsp;{VITOL_GROUPS.length}&nbsp;нових групах: освіжувачі,
            {" "}<span className="whitespace-nowrap">LED-лампи</span>, набори ключів, компресори, домкрати та&nbsp;інше.
          </p>
          <p className="mt-5 inline-flex max-w-full items-center gap-2 rounded-[14px] border border-[#087783]/15 bg-white/65 px-3.5 py-2 text-left text-[13px] font-semibold leading-[1.4] text-[#21485c] shadow-[0_1px_0_rgb(255_255_255/80%)_inset] sm:rounded-full sm:py-1.5 sm:text-[13.5px]">
            <Clock3 size={15} aria-hidden="true" className="shrink-0 text-[#087783]" />
            <span>
              Під замовлення <span aria-hidden="true">·</span> строк постачання підтвердить менеджер
            </span>
          </p>
        </header>

        <ul
          aria-label="Групи нового надходження"
          className="-mx-[var(--page-shell-gutter)] mt-9 flex snap-x snap-mandatory scroll-px-[var(--page-shell-gutter)] gap-3 overflow-x-auto px-[var(--page-shell-gutter)] pb-3 [scrollbar-width:none] sm:mt-11 md:mx-0 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:px-0 md:pb-0 lg:gap-5 [&::-webkit-scrollbar]:hidden"
        >
          {CARDS.map((card) => (
            <li key={card.group} className="w-[46%] shrink-0 snap-start min-[480px]:w-[36%] md:w-auto">
              <Link
                href={groupHref(card.group)}
                prefetch={false}
                className="group/card flex h-full flex-col overflow-hidden rounded-[22px] border border-[#0f4c5c]/[0.08] bg-white shadow-[0_1px_2px_rgb(15_43_61/6%),0_14px_30px_-20px_rgb(15_60_80/45%)] transition-[transform,box-shadow,border-color] duration-300 ease-[cubic-bezier(.16,1,.3,1)] hover:-translate-y-1 hover:border-[#087783]/25 hover:shadow-[0_1px_2px_rgb(15_43_61/6%),0_24px_40px_-22px_rgb(8_90_110/55%)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#087783] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <span className="relative block aspect-[4/3] overflow-hidden bg-[linear-gradient(150deg,#f4faf9_0%,#e9f2f7_100%)] md:aspect-[2/1]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- the product-image route already serves sized WebP */}
                  <img
                    src={productImage(card.code)}
                    alt=""
                    width={500}
                    height={500}
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 h-full w-full object-contain p-3 mix-blend-multiply md:p-3 transition-transform duration-500 ease-[cubic-bezier(.16,1,.3,1)] group-hover/card:scale-[1.05] motion-reduce:transition-none sm:p-4"
                  />
                </span>
                <span className="flex flex-1 items-start justify-between gap-2 px-3.5 pb-3.5 pt-3 sm:px-4 sm:pb-4">
                  <span className="min-w-0">
                    <span className="block text-[14px] font-bold leading-[1.25] text-[#0f2b3d] [text-wrap:balance] sm:text-[15px]">
                      {card.group}
                    </span>
                    <span className="mt-1 block text-[11.5px] font-semibold uppercase leading-[1.4] tracking-[.04em] text-[#56788a] sm:text-[12px]">
                      {card.brands}
                    </span>
                  </span>
                  <span className="mt-0.5 hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eef7f8] text-[#087783] transition-colors duration-200 group-hover/card:bg-[#087783] group-hover/card:text-white sm:inline-flex">
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-8 flex justify-center sm:mt-10">
          <Link
            href={buildGroupPath(sectionSlug)}
            prefetch={false}
            className="inline-flex min-h-12 items-center gap-3 rounded-full bg-[#0f2b3d] py-2 pl-6 pr-2 text-[15px] font-bold text-white shadow-[0_14px_30px_-16px_rgb(15_43_61/70%)] transition-[transform,box-shadow,background-color] duration-200 ease-[cubic-bezier(.16,1,.3,1)] hover:-translate-y-px hover:bg-[#0b3a4f] hover:shadow-[0_18px_34px_-16px_rgb(15_43_61/80%)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#087783] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            Переглянути всі {VITOL_GROUPS.length} групи
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[linear-gradient(135deg,#5eead4,#38bdf8)] text-[#062033]">
              <ArrowRight size={17} aria-hidden="true" />
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}
