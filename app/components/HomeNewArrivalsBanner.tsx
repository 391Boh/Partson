import Link from "next/link";
import HomeHeading from "./HomeHeading";
import { ArrowRight, ArrowUpRight, Clock3 } from "lucide-react";
import FadeInOnLoad from "./FadeInOnLoad";
import HomeArrivalBackdropMotion from "./HomeArrivalBackdropMotion";

import { buildGroupItemPath } from "app/lib/catalog-links";
import { HOME_ARRIVAL_IMAGES } from "app/generated/home-arrival-images";
import { HOME_ARRIVAL_CARDS, HOME_ARRIVAL_FLOATING } from "app/lib/home-arrivals";
import { buildPlainSeoSlug } from "app/lib/seo-slug";
import { VITOL_GROUPS, VITOL_GROUP_SECTION, type VitolGroup } from "app/lib/vitol-groups";

// Homepage showcase for the new accessories / car care / tools range (VITOL,
// all "під замовлення"), in the light picker-section family of the homepage.
// Full-bleed: a layered mint → sky gradient with real product photos floating
// at the edges (white photo backgrounds vanish under mix-blend-multiply), the
// heading in the pickers' display type with the section link beside the
// order note, then six group cards (what each holds, its brands) that open the
// real 1C group pages in their sections (/groups/<section>/<group>, same slug
// rules as the directory; see VITOL_GROUP_SECTION). Server-rendered with a tiny CSS playback controller. Every
// photo is a catalog product snapshotted as a static thumbnail, so this section never
// competes with search/navigation for 1C or image-transform workers.

const EMPTY_DECORATION = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

const groupHref = (group: VitolGroup) =>
  buildGroupItemPath(buildPlainSeoSlug(VITOL_GROUP_SECTION[group]), buildPlainSeoSlug(group));

export default function HomeNewArrivalsBanner() {
  return (
    <section
      aria-labelledby="home-arrivals-title"
      className="home-arrivals-banner font-ui relative isolate overflow-hidden py-10 text-[#0f2b3d] sm:py-14 xl:py-20"
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
        <HomeArrivalBackdropMotion>
          <FadeInOnLoad>
          {HOME_ARRIVAL_FLOATING.map((item) => (
            <picture key={item.code} className={`absolute block aspect-square mix-blend-multiply ${item.className}`}>
              <source media="(min-width: 1280px)" srcSet={HOME_ARRIVAL_IMAGES[item.code].src} />
              {/* CSS hiding alone does not prevent a mobile browser downloading
                  an img. The picture source makes the request desktop-only. */}
              <img
                src={EMPTY_DECORATION}
                alt=""
                width={360}
                height={360}
                loading="lazy"
                decoding="async"
                fetchPriority="low"
                className="home-arrival-float block h-full w-full object-contain"
              />
            </picture>
          ))}
          </FadeInOnLoad>
        </HomeArrivalBackdropMotion>
      </div>

      <div className="mx-auto w-full max-w-[var(--page-shell-max)] px-[var(--page-shell-gutter)]">
        <header className="mx-auto flex max-w-[46rem] flex-col items-center text-center">
          <HomeHeading id="home-arrivals-title" align="center">
            Нове надходження<br />
            <span>аксесуари, автохімія та&nbsp;інструмент</span>
          </HomeHeading>
          <p className="mt-4 max-w-[46ch] text-[16px] font-medium leading-[1.6] text-[#2b4f63] [text-wrap:balance] sm:mt-5 sm:text-[17px]">
            <strong className="font-bold text-[#0b2233]">Понад 4&nbsp;300 товарів</strong> для авто й гаража в{" "}
            <strong className="font-bold text-[#0b2233]">{VITOL_GROUPS.length}&nbsp;нових групах</strong>.
          </p>
          <div className="mt-6 flex w-full flex-col items-center justify-center gap-4 sm:w-auto sm:flex-row sm:gap-6">
            <Link
              href="/nove-nadkhodzhennya"
              prefetch={false}
              className="group/cta inline-flex min-h-12 w-full max-w-[320px] items-center justify-between gap-3 rounded-full bg-[#0f2b3d] py-2 pl-5 pr-2 text-[14px] font-bold text-white shadow-[0_12px_26px_-14px_rgb(15_43_61/70%)] transition-[transform,box-shadow,background-color] duration-200 ease-[cubic-bezier(.16,1,.3,1)] hover:-translate-y-px hover:bg-[#0b3a4f] hover:shadow-[0_16px_30px_-14px_rgb(15_43_61/80%)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#087783] motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:w-auto sm:max-w-none"
            >
              Усе нове надходження
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,#5eead4,#38bdf8)] text-[#062033] transition-transform duration-200 group-hover/cta:translate-x-0.5">
                <ArrowRight size={16} aria-hidden="true" />
              </span>
            </Link>
            <p className="flex items-start gap-2 text-left text-[13px] font-medium leading-[1.45] text-[#31566b] sm:text-[14px]">
              <Clock3 size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-[#087783]" />
              <span>
                <strong className="block font-semibold text-[#21485c]">Товари під замовлення</strong>
                <span className="block">Строк уточнить менеджер</span>
              </span>
            </p>
          </div>
        </header>

        {/* All groups stay visible: a compact list on phones, two columns on
            tablets and three only when the full descriptions fit comfortably. */}
        <ul
          aria-label="Групи нового надходження"
          className="mt-7 grid auto-rows-fr grid-cols-1 gap-3 min-[720px]:grid-cols-2 sm:mt-9 sm:gap-4 xl:mt-11 xl:grid-cols-3"
        >
          {HOME_ARRIVAL_CARDS.map((card) => (
            <li key={card.group} className="min-w-0">
              <Link
                href={groupHref(card.group)}
                prefetch={false}
                className="group/card flex h-full items-center gap-3 rounded-[20px] border border-white/80 bg-white/65 p-3 shadow-[inset_0_1px_0_rgb(255_255_255/90%),0_1px_2px_rgb(15_43_61/5%),0_12px_28px_-18px_rgb(15_60_80/40%)] backdrop-blur-md backdrop-saturate-150 transition-[transform,box-shadow,border-color,background-color] duration-200 ease-[cubic-bezier(.16,1,.3,1)] hover:-translate-y-0.5 hover:border-[#5eead4]/60 hover:bg-white/85 hover:shadow-[inset_0_1px_0_rgb(255_255_255/90%),0_1px_2px_rgb(15_43_61/5%),0_20px_34px_-20px_rgb(8_90_110/50%)] min-[480px]:gap-4 min-[480px]:p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#087783] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <span className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-[14px] bg-white/85 shadow-[inset_0_0_0_1px_rgb(15_76_92/6%)] min-[360px]:h-20 min-[360px]:w-20 min-[480px]:h-[88px] min-[480px]:w-[88px] min-[720px]:h-20 min-[720px]:w-20 xl:h-[88px] xl:w-[88px] 2xl:h-24 2xl:w-24">
                  <FadeInOnLoad>
                  {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized static WebP */}
                  <img
                    src={HOME_ARRIVAL_IMAGES[card.code].src}
                    alt=""
                    width={224}
                    height={224}
                    loading="lazy"
                    decoding="async"
                    fetchPriority="low"
                    className="absolute inset-0 h-full w-full object-contain p-2 mix-blend-multiply transition-transform duration-500 ease-[cubic-bezier(.16,1,.3,1)] group-hover/card:scale-[1.07] motion-reduce:transition-none"
                  />
                  </FadeInOnLoad>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2 min-[720px]:min-h-[2.6em]">
                    <span className="text-[15px] font-bold leading-[1.3] tracking-[-.01em] text-[#0b2233] min-[360px]:text-[16px] xl:text-[16.5px]">{card.group}</span>
                    <ArrowUpRight
                      size={15}
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 text-[#087783]/70 transition-[transform,color] duration-200 group-hover/card:-translate-y-px group-hover/card:translate-x-px group-hover/card:text-[#087783]"
                    />
                  </span>
                  <span className="mt-1 block text-[14px] font-normal leading-[1.5] text-[#33586c] min-[720px]:min-h-[3em] xl:text-[14.5px]">
                    {card.about}
                  </span>
                  <span className="mt-2 block text-[11px] font-semibold leading-[1.5] tracking-[.035em] text-[#087783] [overflow-wrap:anywhere] xl:text-[11.5px]">
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
