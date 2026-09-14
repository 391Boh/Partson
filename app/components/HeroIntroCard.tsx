import Image from 'next/image';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { getPublishedBlogPosts } from 'app/lib/blog';

const heroTextShadow =
  '[text-shadow:0_1px_0_rgba(2,6,23,0.95),0_3px_16px_rgba(2,6,23,0.92),0_1px_4px_rgba(2,6,23,0.85),0_0_34px_rgba(2,6,23,0.55)]';
// Was a pastel `bg-clip-text` gradient fill (sky-100 → white → sky-200) —
// against the busy hero photo, a soft pastel fill read as hazy/low-contrast
// even with a strong text-shadow behind it (verified: still hazy against a
// near-opaque black test backdrop, so the fill itself was the problem, not
// the photo). Solid white reads crisp at any size against the shadow.
const heroQuickLinkText =
  'font-display text-[15px] font-extrabold leading-[1.25] tracking-[-0.01em] sm:text-[16px]';

// No card panel / flip mechanism here — the intro text sits directly on the
// hero photo, so legibility comes from `heroTextShadow` plus the toned-down
// top-left glow in hero.tsx instead of a background box. The diagnostics
// and blog links used to be hidden behind a "Новинки" flip trigger; they're
// shown immediately as two image-led preview cards instead.
export default async function HeroIntroCard() {
  // getPublishedBlogPosts is unstable_cache (10 min) + React-cache wrapped,
  // so this costs a real Firestore read only once per revalidation window,
  // not per visit or per homepage regeneration — safe to await directly
  // instead of hardcoding a generic teaser (which previously showed the
  // PartsON logo mark here instead of a real article photo).
  const posts = await getPublishedBlogPosts().catch(() => []);
  const latestPost = posts.find((post) => post.imageDataUrl?.trim()) ?? posts[0] ?? null;
  const coverImage = latestPost?.imageDataUrl;
  // Legacy covers can be hundreds of kilobytes of base64. Embedding one in
  // this server component duplicates it in both HTML and the RSC payload.
  // Serve those covers through the existing image endpoint so next/image can
  // send a cached thumbnail at the card's actual size instead.
  const isInlineCover = coverImage?.startsWith('data:image/');
  const coverVersion = latestPost?.updatedAt || latestPost?.publishedAt || latestPost?.createdAt;
  const blogImage = isInlineCover && latestPost?.slug
    ? `/api/blog/og-image/${encodeURIComponent(latestPost.slug)}${coverVersion ? `?v=${encodeURIComponent(coverVersion)}` : ''}`
    : coverImage || '/Car-parts-fullwidth.webp';
  const blogTitle = latestPost?.title?.trim() || 'Поради з вибору автозапчастин';
  const blogHref = latestPost?.slug ? `/blog/${latestPost.slug}` : '/blog';
  const blogAlt =
    latestPost?.imageAlt?.trim() || latestPost?.title?.trim() || 'Остання стаття блогу PartsON';

  return (
    <div
      className="flex h-full min-w-0 flex-col justify-center gap-3 sm:gap-4 md:pr-3 lg:pr-5"
      style={{ minHeight: 210 }}
    >
      {/* No fade-in here on purpose: this block holds the H1, which Chrome
          picks as the page's LCP element. An opacity:0 → 1 entrance
          animation (even a fast one) means the element isn't "painted" from
          Chrome's perspective until the animation clears it — verified via
          Lighthouse, which was reporting a cookie-banner paragraph as the
          LCP element instead of this heading because of exactly this. It
          must render at full opacity on the very first frame. */}
      <div className="max-w-[600px]">
        <div className="mb-2.5 flex items-center gap-2.5 sm:mb-3 sm:gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-200/40 bg-cyan-300/10 text-cyan-100 shadow-[0_0_22px_rgba(34,211,238,0.22)] backdrop-blur-sm sm:h-10 sm:w-10">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 9l2-5h14l2 5" />
            <path d="M3 9h18" />
            <path d="M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9" />
            <path d="M9 21v-6h6v6" />
          </svg>
        </span>
        {/* The eyebrow adds the selection intent while the H1 below carries
            the primary local-commerce query used by the page metadata. Was
            "PartsON · підбір за VIN та авто" — the brand name was redundant
            next to the logo/header, and "за VIN та авто" read as an
            incomplete phrase (missing what about the car — brand? model?).
            States the intent plainly instead. */}
        <p className={`text-[10px] font-black uppercase leading-snug tracking-[0.11em] text-cyan-50 sm:text-[12px] sm:tracking-[0.12em] ${heroTextShadow}`}>
          Підбір за VIN · маркою · артикулом
        </p>
        </div>
        <h1 className={`font-display max-w-[17ch] text-[34px] font-black leading-[0.98] tracking-[-0.035em] text-white min-[380px]:text-[38px] sm:text-[46px] lg:text-[50px] ${heroTextShadow}`}>
          Автозапчастини у Львові
          <span className="mt-2 block max-w-[24ch] text-[0.52em] font-bold leading-[1.2] tracking-[-0.01em] text-cyan-200 sm:mt-2.5">з доставкою по Україні</span>
        </h1>
        <p className={`mt-2 max-w-[44ch] text-[14px] font-medium leading-[1.45] text-slate-100/90 sm:mt-2.5 sm:text-[15px] ${heroTextShadow}`}>
          Оригінальні деталі й перевірені аналоги для популярних марок авто — швидко знайдемо потрібну запчастину.
        </p>
        <div className="mt-2 grid max-w-[560px] grid-cols-1 gap-1.5 min-[390px]:grid-cols-3 sm:mt-2.5 sm:gap-2">
          <span className="rounded-xl border border-white/20 bg-slate-950/35 px-2.5 py-1.5 text-[10px] font-bold text-white/90 backdrop-blur-sm sm:text-[11px]">✓ Актуальні ціни</span>
          <span className="rounded-xl border border-white/20 bg-slate-950/35 px-2.5 py-1.5 text-[10px] font-bold text-white/90 backdrop-blur-sm sm:text-[11px]">✓ Підбір за VIN</span>
          <span className="rounded-xl border border-white/20 bg-slate-950/35 px-2.5 py-1.5 text-[10px] font-bold text-white/90 backdrop-blur-sm sm:text-[11px]">✓ Доставка по Україні</span>
        </div>
      </div>

      {/* quick-access cards — diagnostics + blog, shown immediately. mt-2 on
          top of the parent's own gap-4 — a bit more breathing room between
          the heading and these, so they read as a distinct row instead of
          crowding the H1's subtitle line. */}
      <div className="hero-reveal-item mt-1 grid max-w-[600px] grid-cols-2 items-stretch gap-2 sm:gap-2.5" style={{ ["--rd" as string]: "240ms" }}>
        <Link
          href="/inform/diagnostics"
          prefetch={false}
          className="group/diag relative flex flex-col overflow-hidden rounded-2xl border border-emerald-100/30 shadow-[0_4px_16px_rgba(16,185,129,0.16)] transition-[border-color,box-shadow] duration-300 ease-out hover:border-emerald-50/60 hover:shadow-[0_12px_32px_rgba(16,185,129,0.32)]"
        >
          <div className="relative aspect-[16/10] w-full overflow-hidden bg-gradient-to-br from-emerald-900 to-emerald-950">
            <Image
              src="/Katlogo/datchyky_ta_elektronika.png"
              alt="Комп'ютерна діагностика"
              fill
              loading="eager"
              fetchPriority="low"
              sizes="(max-width: 640px) 45vw, 220px"
              className="object-cover transition-transform duration-500 ease-out group-hover/diag:scale-[1.07]"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-emerald-950/88 via-emerald-950/10 to-transparent" />
            <span className="absolute left-2 top-2 rounded-md border border-emerald-100/50 bg-emerald-950/80 px-2 py-1 text-[11px] font-black uppercase tracking-[0.06em] text-white shadow-sm">
              Послуга
            </span>
          </div>
          {/* Static two-line label, always — simpler than the earlier
              hover-expand version, and both cards now size identically by
              construction instead of only matching by coincidence. */}
          <span className="flex flex-1 items-end justify-between gap-1.5 bg-gradient-to-b from-emerald-950/45 to-emerald-950/25 px-3 py-2.5">
            <span className={`line-clamp-2 leading-snug text-emerald-50 ${heroQuickLinkText}`}>Комп&apos;ютерна діагностика</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-emerald-200/75 transition-transform duration-300 group-hover/diag:translate-x-1" strokeWidth={2.2} aria-hidden="true" />
          </span>
        </Link>
        <Link
          href={blogHref}
          prefetch={false}
          title={blogTitle}
          className="group/blog relative flex flex-col overflow-hidden rounded-2xl border border-sky-100/28 shadow-[0_4px_16px_rgba(14,165,233,0.16)] transition-[border-color,box-shadow] duration-300 ease-out hover:border-sky-100/55 hover:shadow-[0_12px_32px_rgba(14,165,233,0.32)]"
        >
          <div className="relative aspect-[16/10] w-full overflow-hidden bg-gradient-to-br from-sky-900 to-sky-950">
            <Image
              src={blogImage}
              alt={blogAlt}
              fill
              unoptimized={Boolean(coverImage && !isInlineCover)}
              loading="eager"
              fetchPriority="low"
              sizes="(max-width: 640px) 45vw, 220px"
              className="object-cover transition-transform duration-500 ease-out group-hover/blog:scale-[1.07]"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-sky-950/88 via-sky-950/10 to-transparent" />
            <span className="absolute left-2 top-2 rounded-md border border-sky-100/50 bg-sky-950/80 px-2 py-1 text-[11px] font-black uppercase tracking-[0.06em] text-white shadow-sm">
              Блог
            </span>
          </div>
          <span className="flex flex-1 items-end justify-between gap-1.5 bg-gradient-to-b from-sky-950/45 to-sky-950/25 px-3 py-2.5">
            <span className={`line-clamp-2 leading-snug text-sky-50 ${heroQuickLinkText}`}>
              {blogTitle}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-sky-200/75 transition-transform duration-300 group-hover/blog:translate-x-1" strokeWidth={2.2} aria-hidden="true" />
          </span>
        </Link>
      </div>
    </div>
  );
}
