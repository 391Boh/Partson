import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";

import { buildGroupItemPath, buildGroupPath } from "app/lib/catalog-links";
import { buildPlainSeoSlug } from "app/lib/seo-slug";
import { VITOL_SECTION, type VitolGroup } from "app/lib/vitol-groups";

// Homepage banner for the new accessories / car care / tools range (VITOL,
// all "під замовлення"). Every tile links to its real 1C group page under
// "Інше" (/groups/inshe/<group>), built with the same slug rules as the
// directory. Server-rendered, no client JS; photos are real catalog products
// served by the product-image route.

// The photo is decoration: the tile's accessible name is its group.
const SHOWCASE: Array<{ group: VitolGroup; code: string }> = [
  { group: "Освіжувачі повітря", code: "РТ-00001926" }, // AREON Fresh Wave
  { group: "Ручний інструмент", code: "РТ-00004897" }, // набір головок Alloid
  { group: "Фари та ліхтарі", code: "РТ-00004386" }, // фара робочого світла PULSO
  { group: "Чохли на кермо та сидіння", code: "РТ-00002690" }, // чохол на кермо VITOL
  { group: "Автохімія та догляд", code: "РТ-00003312" }, // поліроль VOIN
  { group: "Домкрати", code: "РТ-00002144" }, // підкатний домкрат
];

const MORE_GROUPS: VitolGroup[] = [
  "Автолампи",
  "Щітки склоочисника",
  "Компресори та шиноремонт",
  "Аварійний набір водія",
  "Гаджети та зарядні пристрої",
  "Аксесуари для салону",
  "Інструмент для ремонту авто",
  "Свердла, диски та абразив",
];

const sectionSlug = buildPlainSeoSlug(VITOL_SECTION);
const groupHref = (group: VitolGroup) => buildGroupItemPath(sectionSlug, buildPlainSeoSlug(group));

export default function HomeNewArrivalsBanner() {
  return (
    <section aria-labelledby="home-arrivals-title" className="font-ui bg-[#edf4f7] py-6 sm:py-8">
      <div className="mx-auto w-full max-w-[var(--page-shell-max)] px-[var(--page-shell-gutter)]">
        <div className="relative isolate overflow-hidden rounded-[28px] bg-[linear-gradient(120deg,#091d38_0%,#0d3247_55%,#0f4a56_100%)] text-white shadow-[0_24px_48px_-28px_rgb(8_42_62/70%),inset_0_1px_0_rgb(255_255_255/10%)]">
          {/* Light: a teal glow behind the tiles and a faint blueprint grid. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-28 -top-28 -z-10 h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle,rgb(45_212_191/30%)_0%,rgb(56_189_248/12%)_42%,transparent_70%)]"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 opacity-[.07] [background-image:linear-gradient(rgb(255_255_255/60%)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/60%)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:linear-gradient(90deg,transparent,#000_55%)]"
          />

          <div className="grid gap-6 px-5 py-6 sm:px-8 sm:py-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.25fr)] lg:items-center lg:gap-10 lg:px-10 lg:py-10">
            <div className="flex flex-col items-start gap-4">
              <h2
                id="home-arrivals-title"
                className="max-w-[20ch] text-[clamp(23px,2.3vw,32px)] font-[760] leading-[1.12] tracking-[-.022em] text-white [text-wrap:balance]"
              >
                <span className="block text-[#5eead4]">Нове надходження:</span>
                автоаксесуари, автохімія та&nbsp;інструмент
              </h2>

              <p className="max-w-[46ch] text-[14px] font-medium leading-[1.6] text-[#d7e9f1] sm:text-[15px] [text-wrap:pretty]">
                Понад двадцять груп товарів для авто й гаража: від освіжувачів і ламп до наборів ключів і домкратів.
                Позиції під замовлення — менеджер підтвердить строк постачання.
              </p>

              <Link
                href={buildGroupPath(sectionSlug)}
                prefetch={false}
                className="mt-1 inline-flex min-h-11 items-center gap-2.5 rounded-full bg-[linear-gradient(135deg,#5eead4,#38bdf8)] py-2 pl-5 pr-2 text-[14px] font-extrabold text-[#062033] shadow-[0_10px_24px_-12px_rgb(56_189_248/80%)] transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(.16,1,.3,1)] hover:-translate-y-px hover:shadow-[0_14px_28px_-12px_rgb(56_189_248/90%)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#5eead4] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                Усі групи розділу
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#062033]/90 text-[#5eead4]">
                  <ArrowRight size={16} aria-hidden="true" />
                </span>
              </Link>
            </div>

            <ul className="grid grid-cols-3 gap-2 sm:gap-3 lg:gap-3.5">
              {SHOWCASE.map((item) => (
                <li key={item.group}>
                  <Link
                    href={groupHref(item.group)}
                    prefetch={false}
                    className="group/tile flex h-full flex-col overflow-hidden rounded-[14px] bg-white text-[#163343] shadow-[0_18px_32px_-20px_rgb(2_6_23/75%)] ring-1 ring-white/60 transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(.16,1,.3,1)] hover:-translate-y-1 hover:shadow-[0_24px_40px_-20px_rgb(2_6_23/85%)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5eead4] motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:rounded-[20px]"
                  >
                    <span className="relative block aspect-square bg-white p-1.5 sm:aspect-[4/3] sm:p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element -- the product-image route already serves sized WebP */}
                      <img
                        src={`/product-image/${encodeURIComponent(item.code)}`}
                        alt=""
                        width={500}
                        height={500}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-contain transition-transform duration-300 ease-[cubic-bezier(.16,1,.3,1)] group-hover/tile:scale-[1.04] motion-reduce:transition-none"
                      />
                    </span>
                    <span className="flex min-h-10 items-center justify-between gap-1 border-t border-[#e3edf2] px-2 py-1.5 text-[11px] font-bold leading-tight sm:min-h-11 sm:gap-2 sm:px-3 sm:py-2 sm:text-[13px]">
                      {item.group}
                      <ArrowUpRight size={15} aria-hidden="true" className="hidden shrink-0 text-[#0e7490] min-[420px]:block transition-transform duration-200 group-hover/tile:-translate-y-px group-hover/tile:translate-x-px" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <nav
            aria-label="Інші групи нового надходження"
            className="border-t border-white/10 bg-[#061527]/40 py-4 sm:px-8 lg:px-10"
          >
            {/* Phones: one swipeable row; wider screens wrap. */}
            <ul className="flex snap-x snap-mandatory scroll-px-5 items-center gap-1.5 overflow-x-auto px-5 [scrollbar-width:none] sm:flex-wrap sm:gap-2 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
              <li className="mr-1 shrink-0 text-[11px] font-bold uppercase tracking-[.07em] text-[#9fc3d3]">Також</li>
              {MORE_GROUPS.map((group) => (
                <li key={group} className="shrink-0 snap-start">
                  <Link
                    href={groupHref(group)}
                    prefetch={false}
                    className="inline-flex min-h-10 items-center whitespace-nowrap rounded-full border border-white/12 bg-white/[0.06] px-3 text-[12.5px] font-semibold text-[#e6f3f8] transition-colors hover:border-[#5eead4]/50 hover:bg-white/[0.12] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5eead4]"
                  >
                    {group}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </section>
  );
}
