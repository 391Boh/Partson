"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight, CheckCircle2, MapPin, MessageCircle, XCircle,
  PackageSearch, Star, Truck, Wrench,
} from "lucide-react";
import OpenChatButton from "./OpenChatButton";

const STORE_MAPS_URL = "https://www.google.com/maps/place/PartsON/@49.8177181,24.0058222,14.15z/data=!4m6!3m5!1s0x473ae70feda65713:0x9fd600e7cfbd0edd!8m2!3d49.8140387!4d23.9892492!16s%2Fg%2F11y4t3x15h?entry=ttu";

const galleryItems = [
  ["partson-store-1.jpg", "Магазин автозапчастин PartsON у Львові на вулиці Перфецького, 8", "Магазин у Львові"],
  ["partson-store-4.jpg", "Моторні оливи GM, Mercedes-Benz, Ford, ELF і Mobil у магазині PartsON", "Моторні оливи"],
  ["partson-store-2.jpg", "Автотовари Bosch і Vitol, компресори, домкрати та пускові пристрої", "Автотовари й інструмент"],
  ["partson-store-3.jpg", "Асортимент запчастин та витратних матеріалів у магазині PartsON", "Запчастини в наявності"],
  ["partson-store-5.jpg", "Торговий зал інтернет-магазину автозапчастин PartsON у Львові", "Консультація на місці"],
  ["partson-store-6.jpg", "Оригінальні автозапчастини та перевірені аналоги в каталозі PartsON", "Оригінали й аналоги"],
  ["partson-store-7.jpg", "Автомобільні комплектуючі з доставкою зі Львова по Україні", "Доставка по Україні"],
] as const;

const seoCatalogGroups = [
  {
    title: "ТО та деталі двигуна",
    eyebrow: "Регулярне обслуговування",
    icon: Wrench,
    text: "Фільтри, моторні оливи, ремені ГРМ, ролики, натяжники, прокладки, сальники, помпи, термостати, радіатори та патрубки охолодження.",
    tone: "sky" as const,
  },
  {
    title: "Підвіска і гальма",
    eyebrow: "Безпека та керованість",
    icon: CheckCircle2,
    text: "Амортизатори, опори, пружини, важелі, сайлентблоки, кульові опори, підшипники, гальмівні диски, колодки, супорти та шланги.",
    tone: "cyan" as const,
  },
  {
    title: "Електрика та кузов",
    eyebrow: "Ремонт і догляд",
    icon: PackageSearch,
    text: "Датчики, свічки, котушки, стартери, генератори, фари, ліхтарі, дзеркала, склоочисники, автохімія та аксесуари для автомобіля.",
    tone: "blue" as const,
  },
] as const;

const seoCatalogTones = {
  sky: "border-sky-200/90 from-white via-sky-50/80 to-blue-50/80 text-sky-700 hover:border-sky-400 hover:from-sky-50 hover:to-cyan-50",
  cyan: "border-cyan-200/90 from-white via-cyan-50/75 to-emerald-50/70 text-cyan-700 hover:border-cyan-400 hover:from-cyan-50 hover:to-emerald-50",
  blue: "border-blue-200/90 from-white via-blue-50/75 to-indigo-50/70 text-blue-700 hover:border-blue-400 hover:from-blue-50 hover:to-violet-50",
} as const;

const serviceCards = [
  {
    title: "Підбір автозапчастин",
    eyebrow: "VIN, артикул або код деталі",
    icon: PackageSearch,
    text: "Допоможемо перевірити сумісність запчастини з конкретною моделлю, роком випуску та модифікацією автомобіля. Пояснимо різницю між оригінальною деталлю і якісним аналогом.",
    links: [["/auto", "Підібрати за авто"], ["/katalog", "Знайти за артикулом"], ["/inform/warranty", "Гарантія"]],
    tone: "sky" as const,
  },
  {
    title: "Перевірка перед покупкою",
    eyebrow: "Менше ризику помилитися",
    icon: Wrench,
    text: "Уточнимо виробника, характеристики й актуальну наявність. Якщо потрібної позиції немає, запропонуємо сумісний варіант у відповідному ціновому діапазоні.",
    links: [["/groups", "Групи товарів"], ["/manufacturers", "Виробники"], ["/blog", "Поради фахівців"]],
    tone: "cyan" as const,
  },
  {
    title: "Купівля та отримання",
    eyebrow: "Львів і доставка по Україні",
    icon: Truck,
    text: "Замовлення можна отримати самовивозом у Львові або оформити доставку по Україні. Доступна консультація щодо термінів, способів оплати, гарантії та повернення.",
    links: [["/inform/delivery", "Доставка"], ["/inform/payment", "Оплата"], ["/inform/returns", "Повернення"]],
    tone: "blue" as const,
  },
] as const;

const cardTones = {
  sky: { icon: "border-sky-200 bg-sky-100 text-sky-700", link: "text-sky-700 hover:text-sky-500", dot: "bg-sky-500" },
  cyan: { icon: "border-cyan-200 bg-cyan-100 text-cyan-700", link: "text-cyan-700 hover:text-cyan-500", dot: "bg-cyan-500" },
  blue: { icon: "border-blue-200 bg-blue-100 text-blue-700", link: "text-blue-700 hover:text-blue-500", dot: "bg-blue-500" },
} as const;

type Props = { googleRatingValue?: number; googleReviewCount?: number };

export default function AdvantagesSection({ googleRatingValue = 4.3, googleReviewCount = 12 }: Props) {
  const galleryRailRef = useRef<HTMLDivElement | null>(null);
  const galleryPausedRef = useRef(false);
  const [isStoreOpen, setIsStoreOpen] = useState<boolean | null>(null);

  useEffect(() => {
    const updateStoreStatus = () => {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Europe/Kyiv",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).formatToParts(new Date());
      const readPart = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((part) => part.type === type)?.value ?? "";
      const weekday = readPart("weekday");
      const hour = Number(readPart("hour"));
      const minute = Number(readPart("minute"));
      const currentMinutes = hour * 60 + minute;
      const closingMinutes = weekday === "Sun" ? 16 * 60 : 18 * 60;

      setIsStoreOpen(currentMinutes >= 8 * 60 && currentMinutes < closingMinutes);
    };

    updateStoreStatus();
    const intervalId = window.setInterval(updateStoreStatus, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const rail = galleryRailRef.current;
    if (!rail) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animationFrame = 0;
    let previousTime = performance.now();
    let loopPoint = 0;
    let isRailVisible = false;
    const speedPxPerSecond = 16;

    const measureLoopPoint = () => {
      const cards = rail.querySelectorAll<HTMLElement>("[data-seo-gallery-card]");
      const firstCard = cards[0];
      const firstDuplicate = cards[galleryItems.length];
      loopPoint =
        firstCard && firstDuplicate
          ? firstDuplicate.offsetLeft - firstCard.offsetLeft
          : rail.scrollWidth / 2;
    };

    measureLoopPoint();
    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measureLoopPoint)
        : null;
    resizeObserver?.observe(rail);
    const visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        isRailVisible = entry?.isIntersecting === true;
        previousTime = performance.now();
        if (isRailVisible && animationFrame === 0) {
          animationFrame = window.requestAnimationFrame(animate);
        } else if (!isRailVisible && animationFrame !== 0) {
          window.cancelAnimationFrame(animationFrame);
          animationFrame = 0;
        }
      },
      { rootMargin: "80px 0px", threshold: 0.01 }
    );

    const animate = (time: number) => {
      animationFrame = 0;
      const elapsed = Math.min(64, time - previousTime);
      previousTime = time;

      if (
        isRailVisible &&
        !galleryPausedRef.current &&
        !reducedMotion.matches &&
        !document.documentElement.classList.contains("is-scrolling") &&
        document.visibilityState === "visible"
      ) {
        rail.scrollLeft += (speedPxPerSecond * elapsed) / 1000;
        if (loopPoint > 0 && rail.scrollLeft >= loopPoint) {
          rail.scrollLeft -= loopPoint;
        }
      }

      if (isRailVisible) {
        animationFrame = window.requestAnimationFrame(animate);
      }
    };

    // Resuming the auto-scroll the instant a pointer lifts fights touch
    // momentum scrolling — the browser keeps animating scrollLeft on its own
    // for a while after pointerup, and the auto-scroll's own scrollLeft
    // writes then collide with that momentum, producing a visible jump. Wait
    // for the rail's own scrollend (or a short timeout fallback where
    // scrollend isn't supported) before resuming, mirroring the page-scroll
    // "is-scrolling" intent detection in LayoutHost.tsx.
    const supportsScrollEnd = "onscrollend" in window;
    let resumeTimer: number | null = null;
    const clearResumeTimer = () => {
      if (resumeTimer !== null) {
        window.clearTimeout(resumeTimer);
        resumeTimer = null;
      }
    };
    const handlePointerDown = () => {
      galleryPausedRef.current = true;
      clearResumeTimer();
    };
    const handlePointerRelease = () => {
      if (supportsScrollEnd) return; // scrollend below owns the resume
      clearResumeTimer();
      resumeTimer = window.setTimeout(() => {
        galleryPausedRef.current = false;
      }, 150);
    };
    const handleScrollEnd = () => {
      clearResumeTimer();
      galleryPausedRef.current = false;
    };
    const handleFocusIn = () => {
      galleryPausedRef.current = true;
      clearResumeTimer();
    };
    const handleFocusOut = () => {
      galleryPausedRef.current = false;
    };

    rail.addEventListener("pointerdown", handlePointerDown, { passive: true });
    rail.addEventListener("pointerup", handlePointerRelease, { passive: true });
    rail.addEventListener("pointercancel", handlePointerRelease, { passive: true });
    if (supportsScrollEnd) rail.addEventListener("scrollend", handleScrollEnd, { passive: true });
    rail.addEventListener("focusin", handleFocusIn);
    rail.addEventListener("focusout", handleFocusOut);

    visibilityObserver.observe(rail);
    return () => {
      if (animationFrame !== 0) window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      visibilityObserver.disconnect();
      clearResumeTimer();
      rail.removeEventListener("pointerdown", handlePointerDown);
      rail.removeEventListener("pointerup", handlePointerRelease);
      rail.removeEventListener("pointercancel", handlePointerRelease);
      if (supportsScrollEnd) rail.removeEventListener("scrollend", handleScrollEnd);
      rail.removeEventListener("focusin", handleFocusIn);
      rail.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  return (
    <section className="font-ui group/seo relative isolate w-full overflow-hidden bg-[radial-gradient(ellipse_at_8%_0%,rgba(14,165,233,0.24),transparent_34%),radial-gradient(ellipse_at_92%_8%,rgba(45,212,191,0.22),transparent_32%),linear-gradient(145deg,#c8e1ec_0%,#e5f6fb_42%,#d7e9ff_100%)] py-5 text-slate-800 sm:py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_6%,rgba(14,165,233,0.3),transparent_32%),radial-gradient(circle_at_92%_16%,rgba(20,184,166,0.24),transparent_34%),linear-gradient(115deg,rgba(255,255,255,0.3),rgba(59,130,246,0.06)_48%,rgba(45,212,191,0.1))] opacity-65" />
      <div className="home-scroll-decor pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_18%_10%,rgba(2,132,199,0.34),transparent_38%),radial-gradient(ellipse_at_84%_18%,rgba(13,148,136,0.3),transparent_40%),linear-gradient(125deg,rgba(186,230,253,0.34),rgba(224,242,254,0.1)_44%,rgba(167,243,208,0.28))] opacity-0 transition-opacity duration-500 ease-out group-hover/seo:opacity-100" />
      <div className="page-shell-inline relative z-10">
        <div className="relative overflow-hidden rounded-[28px] border border-white bg-white/90 shadow-[0_30px_80px_rgba(15,56,86,0.18),0_8px_24px_rgba(14,116,144,0.12),inset_0_1px_0_white] ring-1 ring-sky-200/80 transition-[box-shadow,border-color] duration-500 group-hover/seo:border-sky-100 group-hover/seo:shadow-[0_36px_90px_rgba(15,56,86,0.22),0_10px_30px_rgba(14,116,144,0.15),inset_0_1px_0_white]">
          <span className="pointer-events-none absolute inset-x-12 top-0 z-20 h-[3px] rounded-b-full bg-gradient-to-r from-transparent via-sky-500 to-cyan-400 shadow-[0_4px_18px_rgba(14,165,233,0.45)]" />
          <header className="relative grid gap-5 overflow-hidden border-b border-sky-100/90 bg-[radial-gradient(circle_at_12%_0%,rgba(125,211,252,0.24),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.99),rgba(239,249,255,0.97),rgba(224,242,254,0.92))] px-5 py-6 sm:px-7 sm:py-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.65fr)] lg:items-end lg:gap-8">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] bg-gradient-to-br from-sky-600 to-cyan-400 text-white shadow-[0_10px_22px_rgba(14,165,233,0.3),inset_0_1px_0_rgba(255,255,255,0.35)]">
                  <PackageSearch className="h-5 w-5" strokeWidth={2.4} />
                </span>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.17em] text-sky-700 sm:text-[10px]">Магазин автозапчастин PartsON</p>
                  <h2 className="mt-0.5 max-w-4xl font-display text-[22px] font-black leading-[1.08] tracking-[-0.035em] text-slate-950 sm:text-[27px] lg:text-[31px]">Автозапчастини у Львові</h2>
                </div>
              </div>
              <p className="mt-4 max-w-4xl text-[13.5px] font-medium leading-[1.65] text-slate-600 sm:text-[14px]">
                Допомагаємо купити <strong className="font-extrabold text-slate-900">оригінальні автозапчастини та перевірені аналоги</strong>, підібрати деталь за VIN-кодом, артикулом або параметрами автомобіля та перевірити сумісність перед замовленням.
              </p>

              <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
                {seoCatalogGroups.map((item) => {
                  const Icon = item.icon;
                  return (
                    <article key={item.title} data-tone={item.tone} className={`seo-topic-card group/seo-card rounded-[17px] border bg-gradient-to-br p-3.5 shadow-[0_8px_20px_rgba(15,23,42,0.06),inset_0_1px_0_white] transition-[transform,border-color,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_18px_34px_rgba(14,116,144,0.2),0_0_0_3px_rgba(56,189,248,0.1),inset_0_1px_0_white] ${seoCatalogTones[item.tone]}`}>
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px] border border-current/20 bg-white/80 shadow-sm transition-transform duration-300 group-hover/seo-card:scale-110 group-hover/seo-card:-rotate-3">
                          <Icon className="h-4 w-4" strokeWidth={2.4} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[8px] font-black uppercase tracking-[0.12em] opacity-70">{item.eyebrow}</p>
                          <h3 className="mt-0.5 text-[13px] font-black leading-tight text-slate-800">{item.title}</h3>
                        </div>
                      </div>
                      <p className="mt-2.5 text-[11.5px] font-semibold leading-[1.52] text-slate-600">{item.text}</p>
                    </article>
                  );
                })}
              </div>
            </div>
            <div className="overflow-hidden rounded-[20px] border border-white bg-white shadow-[0_16px_34px_rgba(15,56,86,0.16)] ring-1 ring-sky-200/80">
              <a href={STORE_MAPS_URL} target="_blank" rel="noreferrer" className="group/map relative block aspect-[16/8] cursor-zoom-in overflow-hidden bg-sky-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-sky-400/60">
                <Image src="/storefront/partson-location-map-v7.svg" alt="Карта: PartsON, Львів, вул. Перфецького, 8" fill sizes="(max-width: 1024px) 100vw, 360px" unoptimized className="object-cover transition-transform duration-500 ease-out group-hover/map:scale-[1.015]" />
                <span className="pointer-events-none absolute left-1/2 top-[39%] z-[2] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center drop-shadow-[0_10px_14px_rgba(7,89,133,0.28)] transition-transform duration-300 group-hover/map:-translate-y-[56%]">
                  <span className="flex h-[46px] w-[76px] items-center justify-center rounded-[14px] border-[3px] border-sky-700 bg-white px-2 shadow-[inset_0_1px_0_white]">
                    <Image src="/partson-logo-v2.webp" alt="" width={1024} height={604} sizes="70px" quality={85} className="h-auto w-full object-contain" />
                  </span>
                  <span className="-mt-1 h-4 w-4 rotate-45 border-b-[3px] border-r-[3px] border-sky-700 bg-white" />
                  <span className="mt-1 h-2.5 w-8 rounded-full bg-sky-900/20 blur-[2px]" />
                </span>
                <span className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-transparent to-white/10" />
                <span className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-3 rounded-[14px] border border-white/35 bg-slate-950/78 px-3 py-2.5 text-white shadow-lg backdrop-blur-md transition-[transform,background-color] duration-200 group-hover/map:-translate-y-0.5 group-hover/map:bg-sky-950/90">
                  <span className="flex min-w-0 items-center gap-2.5"><MapPin className="h-5 w-5 shrink-0 text-cyan-300" /><span><strong className="block text-[12px] font-black">Львів, вул. Перфецького, 8</strong><small className="block text-[10px] font-semibold text-sky-100/80">Відкрити маршрут у Google Maps</small></span></span><ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover/map:translate-x-1" />
                </span>
              </a>
              <div className="grid grid-cols-2 divide-x divide-sky-100 border-t border-sky-100">
                <a href="tel:+380634211851" className="group/phone flex items-center gap-2 px-3 py-3 text-[11px] font-black text-slate-700 transition-colors hover:bg-sky-50 hover:text-sky-800"><MessageCircle className="h-4 w-4 text-sky-600 transition-transform group-hover/phone:scale-110" />+38 (063) 421-18-51</a>
                <div className={`flex items-center justify-center gap-2 px-3 py-3 text-[11px] font-black transition-colors ${isStoreOpen === false ? "bg-rose-50/80 text-rose-800" : "bg-emerald-50/70 text-emerald-800"}`} suppressHydrationWarning>
                  <span className={`h-2.5 w-2.5 rounded-full shadow-[0_0_0_3px_rgba(15,23,42,0.06)] ${isStoreOpen === false ? "bg-rose-500" : "bg-emerald-500"}`} />
                  {isStoreOpen === false ? <XCircle className="h-4 w-4 text-rose-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                  {isStoreOpen === null ? "Перевіряємо…" : isStoreOpen ? "Працюємо" : "Зачинено"}
                </div>
              </div>
              {googleReviewCount > 0 && <a href={STORE_MAPS_URL} target="_blank" rel="noreferrer" aria-label={`Переглянути ${googleReviewCount} відгуків PartsON у Google`} className="group/reviews flex cursor-pointer items-center justify-center gap-2 border-t border-amber-200/80 bg-[linear-gradient(135deg,#fffdf5,#fff7d6)] px-3 py-2.5 text-[11px] font-extrabold text-amber-900 transition-[background-color,color,box-shadow] duration-200 hover:bg-[linear-gradient(135deg,#fff8d8,#ffed9c)] hover:text-amber-950 hover:shadow-[inset_0_3px_0_rgba(245,158,11,0.55),0_-8px_20px_rgba(245,158,11,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400"><span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-400 text-white shadow-[0_5px_12px_rgba(245,158,11,0.28)] transition-[transform,background-color] duration-200 group-hover/reviews:-translate-y-0.5 group-hover/reviews:scale-110 group-hover/reviews:bg-amber-500"><Star className="h-3.5 w-3.5 fill-current" /></span><span>{googleRatingValue.toFixed(1)} · {googleReviewCount} відгуків Google</span><ArrowRight className="h-3.5 w-3.5 text-amber-600 opacity-60 transition-[transform,opacity] group-hover/reviews:translate-x-1 group-hover/reviews:opacity-100" /></a>}
            </div>
          </header>

          <div className="px-4 py-5 sm:px-6 sm:py-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.16em] text-sky-600">PartsON наживо</p>
                <h3 className="mt-1 font-display text-[20px] font-black tracking-[-0.025em] text-slate-800 sm:text-[23px]">
                  Магазин та асортимент
                </h3>
              </div>
              <span className="hidden text-[11px] font-bold text-slate-500 sm:inline">Гортайте фотографії горизонтально →</span>
            </div>
            <div
              ref={galleryRailRef}
              className="no-scrollbar mt-4 flex gap-3 overflow-x-auto overscroll-x-contain pb-2 [-webkit-overflow-scrolling:touch]"
              role="region"
              aria-label="Фотографії магазину та асортименту"
            >
              {[0, 1].map((setIndex) => (
                <div
                  key={setIndex}
                  className="contents"
                  aria-hidden={setIndex === 1 ? "true" : undefined}
                >
                  {galleryItems.map(([file, alt, label]) => (
                    <figure data-seo-gallery-card key={`${setIndex}-${file}`} className="relative aspect-[16/10] w-[82vw] max-w-[360px] shrink-0 overflow-hidden rounded-[18px] border border-white bg-slate-100 shadow-[0_10px_22px_rgba(15,23,42,0.1)] sm:w-[310px]">
                      <Image src={`/storefront/photos/${file}`} alt={setIndex === 0 ? alt : ""} fill loading="lazy" quality={72} sizes="(max-width: 640px) 82vw, 310px" className="object-cover" />
                      <figcaption className="absolute inset-x-2 bottom-2 rounded-[11px] bg-slate-950/72 px-3 py-2 text-[11px] font-bold text-white shadow-sm">{label}</figcaption>
                    </figure>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="grid border-t border-sky-100/90 lg:grid-cols-3 lg:divide-x lg:divide-sky-100/90">
            {serviceCards.map((item) => { const Icon = item.icon; const tone = cardTones[item.tone]; return <article key={item.title} className="group/service border-b border-sky-100/90 px-5 py-5 transition-[background-color,box-shadow] duration-200 last:border-b-0 hover:bg-sky-50/75 hover:shadow-[inset_0_3px_0_rgba(14,165,233,0.55)] sm:px-6 sm:py-6 lg:border-b-0"><div className="flex items-start gap-3.5"><span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] border transition-transform duration-200 group-hover/service:-translate-y-0.5 group-hover/service:scale-110 ${tone.icon}`}><Icon className="h-[18px] w-[18px]" strokeWidth={2.2} /></span><div><p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{item.eyebrow}</p><h3 className="mt-1 text-[19px] font-black leading-tight tracking-[-0.025em] text-slate-800 transition-colors group-hover/service:text-sky-900">{item.title}</h3></div></div><p className="mt-3 text-[13px] font-medium leading-[1.65] text-slate-600 sm:text-[13.5px]">{item.text}</p><div className="mt-4 space-y-2">{item.links.map(([href, label]) => <Link key={href} href={href} className={`group flex items-center gap-2 text-[11.5px] font-extrabold ${tone.link}`}><span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />{label}<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" /></Link>)}</div></article>; })}
          </div>

          <footer className="grid gap-3 border-t border-sky-100/90 bg-[linear-gradient(135deg,#f8fdff,#eef9ff)] px-5 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-7">
            <div><h3 className="text-[17px] font-black tracking-[-0.02em] text-slate-800">Потрібна допомога з вибором запчастини?</h3><p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">Надішліть VIN-код або артикул — менеджер перевірить застосування, наявність і доступні варіанти.</p></div>
            <OpenChatButton
              message="Допоможіть підібрати автозапчастину за VIN-кодом або артикулом."
              label="Написати для підбору"
              title="Відкрити чат для підбору автозапчастини"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-[14px] bg-gradient-to-r from-sky-600 to-cyan-500 px-5 text-[12px] font-black text-white shadow-[0_9px_20px_rgba(14,165,233,0.24)] hover:brightness-105"
            />
          </footer>
        </div>
      </div>
    </section>
  );
}
