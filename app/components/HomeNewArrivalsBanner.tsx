import Link from "next/link";
import { ArrowRight, ArrowUpRight, Clock3 } from "lucide-react";

import { buildGroupItemPath, buildGroupPath } from "app/lib/catalog-links";
import { buildPlainSeoSlug } from "app/lib/seo-slug";
import { VITOL_GROUPS, VITOL_SECTION, type VitolGroup } from "app/lib/vitol-groups";

// Homepage showcase for the new accessories / car care / tools range (VITOL,
// all "під замовлення"). Full-bleed: a real workshop photo (the /auto
// directory's cars) under an ink → teal gradient carries the heading, then
// fades into the page's light ground where eight group cards open the real
// 1C group pages under "Інше" (/groups/inshe/<group>, same slug rules as the
// directory). Server-rendered, no client JS. The photo is lazy, low priority
// and sized per screen; offscreen the section is skipped by content-visibility.

const productImage = (code: string) => `/product-image/${encodeURIComponent(code)}`;

// Brands: the leading producers of each group in the VITOL feed.
const CARDS: Array<{ group: VitolGroup; brands: string; code: string }> = [
  { group: "Ручний інструмент", brands: "ALLOID · HANS", code: "РТ-00004897" },
  { group: "Освіжувачі повітря", brands: "AREON · VITOL · TASOTTI", code: "РТ-00001926" },
  { group: "Автохімія та догляд", brands: "VITOL · VOIN · ABRO", code: "РТ-00003312" },
  { group: "Автолампи", brands: "PULSO", code: "РТ-00002256" },
  { group: "Фари та ліхтарі", brands: "PULSO · DLAA · VOIN", code: "РТ-00004386" },
  { group: "Чохли на кермо та сидіння", brands: "VITOL · VOIN · MILEX", code: "РТ-00002690" },
  { group: "Аварійний набір водія", brands: "VITOL · ШТУРМОВИК · PULSO", code: "РТ-00001948" },
  { group: "Домкрати", brands: "VITOL · IRON HAND", code: "РТ-00002144" },
];

const sectionSlug = buildPlainSeoSlug(VITOL_SECTION);
const groupHref = (group: VitolGroup) => buildGroupItemPath(sectionSlug, buildPlainSeoSlug(group));

export default function HomeNewArrivalsBanner() {
  return (
    <section
      aria-labelledby="home-arrivals-title"
      className="font-ui relative isolate overflow-hidden bg-[#eef5f7] pb-14 pt-12 text-[#0f2b3d] [contain-intrinsic-size:auto_1000px] [content-visibility:auto] sm:pb-16 sm:pt-16 lg:pb-20 lg:pt-20"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[500px] sm:h-[520px] lg:h-[560px]">
        {/* eslint-disable-next-line @next/next/no-img-element -- a static, pre-sized background photo */}
        <img
          src="/images/directories/auto-workshop-v1-960.webp"
          srcSet="/images/directories/auto-workshop-v1-960.webp 960w, /images/directories/auto-workshop-v1.webp 1920w"
          sizes="100vw"
          alt=""
          width={1920}
          height={768}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          className="h-full w-full object-cover object-[68%_center]"
        />
        {/* Ink over the photo: top-down on phones, from the text side on wider screens. */}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(5_22_37/90%)_0%,rgb(5_22_37/78%)_45%,rgb(5_22_37/55%)_70%,rgb(5_22_37/20%)_100%)] md:bg-[linear-gradient(90deg,rgb(5_22_37/96%)_0%,rgb(5_22_37/86%)_34%,rgb(5_22_37/48%)_64%,rgb(5_22_37/18%)_100%)]" />
        <div className="absolute -left-[10%] -top-[40%] h-[620px] w-[620px] rounded-full bg-[radial-gradient(circle,rgb(45_212_191/22%)_0%,transparent_65%)]" />
        <div className="absolute inset-x-0 bottom-0 h-[58%] bg-[linear-gradient(180deg,rgb(238_245_247/0%)_0%,rgb(238_245_247/70%)_55%,#eef5f7_100%)]" />
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-[30%] -right-[10%] -z-10 h-[640px] w-[640px] rounded-full bg-[radial-gradient(circle,rgb(56_189_248/16%)_0%,transparent_68%)]" />

      <div className="mx-auto w-full max-w-[var(--page-shell-max)] px-[var(--page-shell-gutter)]">
        <header className="max-w-[40rem]">
          <h2
            id="home-arrivals-title"
            className="font-display font-display-readable text-[clamp(28px,3.3vw,46px)] font-[800] leading-[1.08] tracking-[-.03em] text-white [text-shadow:0_2px_18px_rgb(2_12_22/45%)]"
          >
            <span className="block">Нове надходження</span>
            <span className="mt-1.5 block text-[#5eead4] [text-wrap:balance] sm:mt-2">
              <span className="underline decoration-[#5eead4]/45 decoration-2 underline-offset-[8px] [text-decoration-skip-ink:auto] [box-decoration-break:clone]">
                аксесуари, автохімія та&nbsp;інструмент
              </span>
            </span>
          </h2>
          <p className="mt-5 max-w-[46ch] text-[15px] font-medium leading-[1.65] text-[#d3e6ee] sm:mt-6 sm:text-[17px] [text-wrap:pretty]">
            Понад 4&nbsp;300 товарів для авто й гаража в&nbsp;{VITOL_GROUPS.length}&nbsp;нових групах: освіжувачі,
            <span className="whitespace-nowrap">LED-лампи</span>, набори ключів, компресори, домкрати та&nbsp;інше.
          </p>
          <p className="mt-5 inline-flex max-w-full items-center gap-2 rounded-[14px] border border-white/15 bg-white/[0.08] px-3.5 py-2 text-[13px] font-semibold leading-[1.4] text-[#e6f3f8] sm:rounded-full sm:py-1.5 sm:text-[13.5px]">
            <Clock3 size={15} aria-hidden="true" className="shrink-0 text-[#5eead4]" />
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
