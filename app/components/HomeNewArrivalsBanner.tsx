import Link from "next/link";
import { ArrowRight, ArrowUpRight, Clock3 } from "lucide-react";

import { buildGroupItemPath, buildGroupPath } from "app/lib/catalog-links";
import { buildPlainSeoSlug } from "app/lib/seo-slug";
import { VITOL_GROUPS, VITOL_SECTION, type VitolGroup } from "app/lib/vitol-groups";

// Homepage showcase for the new accessories / car care / tools range (VITOL,
// all "під замовлення"), in the light picker-section family of the homepage.
// Full-bleed: a layered mint → sky gradient with real product photos floating
// at the edges (white photo backgrounds vanish under mix-blend-multiply), the
// heading in the pickers' display type with the section link beside the
// order note, then eight group cards (what each holds, its brands) that open the
// real 1C group pages under "Інше" (/groups/inshe/<group>, same slug rules as
// the directory). Server-rendered, no client JS; every photo is a catalog
// product served by the product-image route.

const productImage = (code: string) => `/product-image/${encodeURIComponent(code)}`;

// What each group holds, and its leading producers in the VITOL feed.
const CARDS: Array<{ group: VitolGroup; about: string; brands: string; code: string }> = [
  { group: "Ручний інструмент", about: "Набори ключів і головок, тріскачки, викрутки", brands: "ALLOID · HANS", code: "РТ-00004897" },
  { group: "Освіжувачі повітря", about: "Гелеві, підвісні та ароматичні саше", brands: "AREON · VITOL · TASOTTI", code: "РТ-00001926" },
  { group: "Автохімія та догляд", about: "Поліролі, шампуні, очисники, омивачі", brands: "VITOL · VOIN · ABRO", code: "РТ-00003312" },
  { group: "Автолампи", about: "LED і галогенні: головне світло, габарити", brands: "PULSO", code: "РТ-00002289" },
  { group: "Фари та ліхтарі", about: "Додаткові LED-фари, протитуманки, ліхтарі", brands: "PULSO · DLAA · VOIN", code: "РТ-00004386" },
  { group: "Чохли на кермо та сидіння", about: "Чохли з шкіри й екошкіри, накидки", brands: "VITOL · VOIN · MILEX", code: "РТ-00002690" },
  { group: "Аварійний набір водія", about: "Аптечки, вогнегасники, троси, пускові дроти", brands: "VITOL · ШТУРМОВИК · PULSO", code: "РТ-00001948" },
  { group: "Домкрати", about: "Підкатні, ромбоподібні, телескопічні", brands: "VITOL · IRON HAND", code: "РТ-00002144" },
];

// Decoration around the heading (wide screens only): a mix of the range.
const FLOATING: Array<{ code: string; className: string }> = [
  { code: "РТ-00004117", className: "left-[3%] top-8 w-[165px] -rotate-[6deg] 2xl:left-[8%]" }, // компресор «Ураган»
  { code: "РТ-00002841", className: "left-[15%] top-[120px] w-[120px] rotate-[10deg] 2xl:left-[19%]" }, // саше VITOL Fresh Bag
  { code: "РТ-00004074", className: "left-[5%] top-[200px] w-[125px] -rotate-[10deg] opacity-90 2xl:left-[10%]" }, // буксирувальний трос
  { code: "РТ-00005556", className: "right-[4%] top-8 w-[150px] rotate-[7deg] 2xl:right-[9%]" }, // шампунь VOIN SnowFoam
  { code: "РТ-00002256", className: "right-[16%] top-[105px] w-[150px] -rotate-[8deg] 2xl:right-[20%]" }, // лампи PULSO
  { code: "РТ-00003979", className: "right-[5%] top-[215px] w-[120px] rotate-[12deg] opacity-90 2xl:right-[10%]" }, // тримач телефону BOROFONE BH36
];

const sectionSlug = buildPlainSeoSlug(VITOL_SECTION);
const groupHref = (group: VitolGroup) => buildGroupItemPath(sectionSlug, buildPlainSeoSlug(group));

export default function HomeNewArrivalsBanner() {
  return (
    <section
      aria-labelledby="home-arrivals-title"
      className="font-ui relative isolate overflow-hidden py-12 text-[#0f2b3d] [contain-intrinsic-size:auto_760px] [content-visibility:auto] sm:py-16 lg:py-20"
    >
      {/* Background: a soft mesh of teal, sky and lilac light over a pale
          ground, a light beam behind the heading, a fine grid fading out from
          the centre, hairlines at the edges, and the floating products. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#f3faf9_0%,#eaf4f7_45%,#e6eef8_100%)]" />
        <div className="absolute -left-[8%] -top-[25%] h-[620px] w-[620px] rounded-full bg-[radial-gradient(circle,rgb(45_212_191/24%)_0%,rgb(45_212_191/6%)_50%,transparent_70%)] blur-2xl" />
        <div className="absolute -right-[6%] top-[5%] h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle,rgb(56_189_248/20%)_0%,rgb(56_189_248/5%)_50%,transparent_70%)] blur-2xl" />
        <div className="absolute -bottom-[30%] left-[30%] h-[600px] w-[700px] rounded-full bg-[radial-gradient(circle,rgb(129_140_248/13%)_0%,transparent_68%)] blur-2xl" />
        <div className="absolute left-1/2 top-0 h-[460px] w-[min(980px,90%)] -translate-x-1/2 bg-[radial-gradient(ellipse_at_top,rgb(255_255_255/85%)_0%,rgb(255_255_255/35%)_40%,transparent_72%)]" />
        <div className="absolute inset-0 [background-image:linear-gradient(rgb(15_76_92/6%)_1px,transparent_1px),linear-gradient(90deg,rgb(15_76_92/6%)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_75%_65%_at_50%_35%,#000_10%,transparent_75%)]" />
        <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgb(8_119_131/35%),transparent)]" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,transparent,rgb(8_119_131/35%),transparent)]" />
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
        {/* Two heading lines, a balanced lead, then the section link and the
            order note side by side. */}
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
          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
            <Link
              href={buildGroupPath(sectionSlug)}
              prefetch={false}
              className="group/cta inline-flex min-h-11 items-center gap-2.5 rounded-full bg-[#0f2b3d] py-1.5 pl-5 pr-1.5 text-[14px] font-bold text-white shadow-[0_12px_26px_-14px_rgb(15_43_61/70%)] transition-[transform,box-shadow,background-color] duration-200 ease-[cubic-bezier(.16,1,.3,1)] hover:-translate-y-px hover:bg-[#0b3a4f] hover:shadow-[0_16px_30px_-14px_rgb(15_43_61/80%)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#087783] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              Усі {VITOL_GROUPS.length} групи
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,#5eead4,#38bdf8)] text-[#062033] transition-transform duration-200 group-hover/cta:translate-x-0.5">
                <ArrowRight size={16} aria-hidden="true" />
              </span>
            </Link>
            <p className="text-[13px] font-semibold leading-[1.4] text-[#21485c] sm:text-[13.5px]">
              <Clock3 size={15} aria-hidden="true" className="mr-1.5 inline-block -translate-y-px align-middle text-[#087783]" />
              Під замовлення: строк підтвердить менеджер
            </p>
          </div>
        </header>

        {/* Compact cards: a small photo tile beside the text. Phones scroll
            two rows sideways; tablets show two columns, desktops four. */}
        <ul
          aria-label="Групи нового надходження"
          className="-mx-[var(--page-shell-gutter)] mt-10 grid snap-x snap-mandatory auto-cols-[82%] grid-flow-col grid-rows-2 gap-2.5 overflow-x-auto scroll-px-[var(--page-shell-gutter)] px-[var(--page-shell-gutter)] pb-2 [scrollbar-width:none] min-[480px]:auto-cols-[58%] sm:mt-11 md:mx-0 md:grid-flow-row md:grid-cols-2 md:grid-rows-none md:gap-3 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-4 [&::-webkit-scrollbar]:hidden"
        >
          {CARDS.map((card) => (
            <li key={card.group} className="min-w-0 snap-start">
              <Link
                href={groupHref(card.group)}
                prefetch={false}
                className="group/card flex h-full items-center gap-3 rounded-[18px] border border-[#0f4c5c]/[0.08] bg-white/90 p-2 pr-3 shadow-[0_1px_2px_rgb(15_43_61/5%),0_10px_24px_-18px_rgb(15_60_80/45%)] transition-[transform,box-shadow,border-color,background-color] duration-300 ease-[cubic-bezier(.16,1,.3,1)] hover:-translate-y-0.5 hover:border-[#087783]/25 hover:bg-white hover:shadow-[0_1px_2px_rgb(15_43_61/5%),0_18px_32px_-20px_rgb(8_90_110/55%)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#087783] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <span className="relative h-[76px] w-[76px] shrink-0 overflow-hidden rounded-[13px] bg-[linear-gradient(150deg,#f3faf9_0%,#e6f0f6_100%)] sm:h-[84px] sm:w-[84px]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- the product-image route already serves sized WebP */}
                  <img
                    src={productImage(card.code)}
                    alt=""
                    width={500}
                    height={500}
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 h-full w-full object-contain p-1.5 mix-blend-multiply transition-transform duration-500 ease-[cubic-bezier(.16,1,.3,1)] group-hover/card:scale-[1.07] motion-reduce:transition-none"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className="line-clamp-2 text-[14px] font-bold leading-[1.25] text-[#0f2b3d] sm:text-[14.5px]">{card.group}</span>
                    <ArrowUpRight
                      size={15}
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 text-[#087783]/70 transition-[transform,color] duration-200 group-hover/card:-translate-y-px group-hover/card:translate-x-px group-hover/card:text-[#087783]"
                    />
                  </span>
                  <span className="mt-0.5 line-clamp-2 text-[12px] font-medium leading-[1.4] text-[#4b6878] sm:text-[12.5px]">
                    {card.about}
                  </span>
                  <span className="mt-1 block truncate text-[10px] font-bold uppercase leading-[1.4] tracking-[.06em] text-[#087783] sm:text-[10.5px]">
                    {card.brands}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

      </div>
    </section>
  );
}
