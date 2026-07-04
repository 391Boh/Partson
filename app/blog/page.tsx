import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookOpen, CalendarDays, Clock, PenLine, Wrench, ShieldCheck, Gauge } from "lucide-react";

import BlogAdminComposer from "app/blog/BlogAdminComposer";
import { getPublishedBlogPosts } from "app/lib/blog";
import { appendSeoContact, buildPageMetadata } from "app/lib/seo-metadata";
import { safeJsonLd } from "app/lib/safe-json-ld";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 3600;

export const metadata: Metadata = buildPageMetadata({
  title: "Блог — статті про автозапчастини та ТО",
  description: appendSeoContact(
    "Як вибрати запчастини під своє авто, які бренди надійніші, як розпізнати несправність і що перевірити при обслуговуванні — статті від фахівців PartsON у Львові."
  ),
  canonicalPath: "/blog",
  keywords: [
    "блог автозапчастини",
    "як вибрати запчастини",
    "підбір автодеталей",
    "надійні бренди запчастин",
    "діагностика несправностей авто",
    "технічне обслуговування автомобіля",
    "поради автомеханіка",
    "запчастини Львів",
    "купити автозапчастини",
  ],
  openGraphTitle: "Блог PartsON — корисні статті про запчастини та обслуговування авто",
});

const formatDate = (value: string | undefined) => {
  if (!value) return "";
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
};

const timeAgo = (value: string | undefined): string => {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "щойно";
  if (mins < 60) return `${mins} хв тому`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return `${hours} год тому`;
  const days = Math.floor(diff / 86_400_000);
  if (days < 30) return `${days} дн тому`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} міс тому`;
  return `${Math.floor(days / 365)} р тому`;
};

export default async function BlogPage() {
  const posts = await getPublishedBlogPosts();
  const featured = posts[0];
  const rest = posts.slice(1);

  const siteUrl = getSiteUrl();
  const blogJsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Блог PartsON — автозапчастини",
    url: `${siteUrl.replace(/\/$/, "")}/blog`,
    description: "Корисні статті про підбір автозапчастин, надійні бренди та технічне обслуговування авто від фахівців PartsON у Львові.",
    publisher: {
      "@type": "Organization",
      name: "PartsON",
      logo: { "@type": "ImageObject", url: `${siteUrl.replace(/\/$/, "")}/favicon-512x512.png` },
    },
    blogPost: posts.slice(0, 10).map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      description: p.excerpt,
      url: `${siteUrl.replace(/\/$/, "")}/blog/${p.slug}`,
      datePublished: p.publishedAt || p.createdAt,
      dateModified: p.updatedAt || p.publishedAt || p.createdAt,
      author: { "@type": "Organization", name: "PartsON" },
    })),
  };

  return (
    <main
      className="font-ui min-h-screen text-slate-900"
      style={{
        background:
          "linear-gradient(180deg,#e8f4fd 0%,#f0f8ff 12%,#f6fbff 28%,#fafcff 50%,#ffffff 72%)",
      }}
    >
      <BlogAdminComposer />

      {/* ── hero ── */}
      <section
        className="relative isolate overflow-hidden text-white"
        style={{
          background:
            "linear-gradient(148deg,#071e38 0%,#0a3460 30%,#0d5490 58%,#1268a8 80%,#0a3d6c 100%)",
          boxShadow:
            "0 8px 40px rgba(7,30,56,0.50), 0 2px 0 rgba(18,104,168,0.28)",
        }}
      >
        <span
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 65% 80% at 0% 0%,rgba(56,182,255,0.26) 0%,transparent 55%)," +
              "radial-gradient(ellipse 55% 60% at 100% 0%,rgba(80,140,255,0.18) 0%,transparent 52%)," +
              "radial-gradient(ellipse 80% 40% at 50% 100%,rgba(6,25,50,0.55) 0%,transparent 70%)",
          }}
        />
        <span
          className="pointer-events-none absolute inset-0 opacity-[0.032]"
          style={{
            backgroundImage:
              "radial-gradient(circle,rgba(186,230,255,1) 1px,transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/40 to-transparent" />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-b from-transparent to-black/18" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-sky-950/55" />

        <div className="page-shell-inline relative z-10 py-5 sm:py-7">
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded border border-sky-400/22 bg-sky-500/12 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-sky-300 backdrop-blur-sm">
              <BookOpen size={10} strokeWidth={2.5} /> Блог
            </span>
            {posts.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/6 px-2 py-0.5 text-[10px] font-semibold text-sky-200/60">
                {posts.length}{" "}
                {posts.length === 1 ? "стаття" : posts.length < 5 ? "статті" : "статей"}
              </span>
            )}
          </div>
          <h1 className="max-w-xl text-[1.35rem] font-black leading-[1.1] tracking-[-0.04em] text-white sm:text-[1.75rem]">
            Статті про автозапчастини, підбір деталей і&nbsp;ТО
          </h1>
          <p className="mt-2 max-w-lg text-[12.5px] font-medium leading-relaxed text-sky-100/60 sm:text-[13px]">
            Як вибрати надійні деталі, розпізнати несправність і&nbsp;не переплатити — досвід фахівців PartsON у&nbsp;Львові.
          </p>
        </div>
      </section>

      {/* ── posts ── */}
      <section className="page-shell-inline py-6 sm:py-8">
        {featured ? (
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">

            {/* ── featured ── */}
            <Link
              href={`/blog/${featured.slug}`}
              className="group col-span-2 flex flex-col overflow-hidden rounded-[12px] border border-slate-200/70 bg-white shadow-[0_2px_12px_rgba(14,116,144,0.08)] transition-shadow duration-300 hover:shadow-[0_6px_22px_rgba(14,116,144,0.14)]"
            >
              <div className="relative overflow-hidden" style={{ aspectRatio: "16/7" }}>
                {featured.imageDataUrl ? (
                  <Image
                    src={featured.imageDataUrl}
                    alt={featured.imageAlt || featured.title}
                    fill
                    unoptimized
                    priority
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                ) : (
                  <div
                    className="absolute inset-0 flex items-center justify-center text-sky-300/60"
                    style={{ background: "linear-gradient(148deg,#071e38,#0d5490)" }}
                  >
                    <PenLine size={28} strokeWidth={1.2} />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1 p-3">
                <div className="flex items-center gap-1 text-[9.5px] font-medium text-slate-400">
                  <CalendarDays size={9} strokeWidth={1.8} />
                  <span>{formatDate(featured.publishedAt || featured.createdAt)}</span>
                  <span className="text-slate-300">·</span>
                  <Clock size={9} strokeWidth={1.8} />
                  <span>{timeAgo(featured.publishedAt || featured.createdAt)}</span>
                </div>
                <h2 className="line-clamp-1 text-[13px] font-black leading-[1.25] tracking-[-0.03em] text-slate-900 sm:text-[14px]">
                  {featured.title}
                </h2>
                <div className="flex items-center justify-between">
                  <p className="line-clamp-1 text-[11px] text-slate-500 flex-1 pr-3">
                    {featured.excerpt}
                  </p>
                  <span className="inline-flex shrink-0 items-center gap-1 text-[9.5px] font-black uppercase tracking-[0.1em] text-sky-600">
                    Читати <ArrowRight size={8} strokeWidth={2.5} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                  </span>
                </div>
              </div>
            </Link>

            {/* ── rest cards ── */}
            {rest.length > 0 ? rest.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group flex flex-col overflow-hidden rounded-[12px] border border-slate-200/70 bg-white shadow-[0_2px_10px_rgba(14,116,144,0.07)] transition-shadow duration-300 hover:shadow-[0_5px_18px_rgba(14,116,144,0.13)]"
              >
                <div className="relative aspect-square overflow-hidden">
                  {post.imageDataUrl ? (
                    <Image
                      src={post.imageDataUrl}
                      alt={post.imageAlt || post.title}
                      fill
                      unoptimized
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                    />
                  ) : (
                    <div
                      className="absolute inset-0 flex items-center justify-center text-sky-300/50"
                      style={{ background: "linear-gradient(148deg,#0a2540,#0d5490)" }}
                    >
                      <BookOpen size={18} strokeWidth={1.3} />
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-0.5 p-2.5">
                  <span className="text-[9px] font-medium text-slate-400">
                    {formatDate(post.publishedAt || post.createdAt)} · {timeAgo(post.publishedAt || post.createdAt)}
                  </span>
                  <h3 className="line-clamp-2 text-[11.5px] font-black leading-[1.3] tracking-[-0.02em] text-slate-900">
                    {post.title}
                  </h3>
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-sky-600">
                    Читати <ArrowRight size={7} strokeWidth={2.5} />
                  </span>
                </div>
              </Link>
            )) : (
              <div className="aspect-square rounded-[14px] border border-dashed border-sky-200/60 bg-sky-50/30 flex items-center justify-center text-[12px] font-semibold text-slate-400">
                Невдовзі
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-[14px] border border-sky-100/60 bg-gradient-to-br from-white to-sky-50/40 p-10 text-center shadow-[0_6px_28px_rgba(14,116,144,0.07)]">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-[12px] border border-sky-100 bg-sky-50 text-sky-600">
              <BookOpen size={22} strokeWidth={1.5} />
            </div>
            <h2 className="text-[1.2rem] font-black tracking-[-0.03em] text-slate-950">
              Блог готується до запуску
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-[12.5px] font-medium leading-relaxed text-slate-500">
              Перша стаття зʼявиться тут після публікації адміністратором.
            </p>
          </div>
        )}
      </section>

      {/* ── seo text ── */}
      <section className="page-shell-inline pb-10 pt-4">
        <div className="rounded-[14px] border border-slate-200/60 bg-white/70 px-6 py-7 shadow-[0_2px_14px_rgba(14,116,144,0.06)] sm:px-8">

          <p className="mb-4 text-[13px] font-black uppercase tracking-[0.14em] text-slate-400">
            Про блог PartsON
          </p>

          <div className="grid gap-6 sm:grid-cols-3">
            <div className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-sky-100 bg-sky-50 text-sky-600">
                <Wrench size={15} strokeWidth={1.8} />
              </span>
              <div>
                <h3 className="mb-1 text-[12.5px] font-black tracking-[-0.01em] text-slate-800">
                  Підбір запчастин
                </h3>
                <p className="text-[11.5px] leading-relaxed text-slate-500">
                  Як правильно підібрати деталі під своє авто: за VIN, артикулом або маркою автомобіля. Порівнюємо оригінал і якісний аналог — що вибрати і чому.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-emerald-100 bg-emerald-50 text-emerald-600">
                <ShieldCheck size={15} strokeWidth={1.8} />
              </span>
              <div>
                <h3 className="mb-1 text-[12.5px] font-black tracking-[-0.01em] text-slate-800">
                  Надійні бренди
                </h3>
                <p className="text-[11.5px] leading-relaxed text-slate-500">
                  Огляди виробників автозапчастин: Bosch, Gates, SKF, Febi, LuK, Sachs та інших. Розбираємо, де економити безпечно, а де краще не ризикувати.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-amber-100 bg-amber-50 text-amber-600">
                <Gauge size={15} strokeWidth={1.8} />
              </span>
              <div>
                <h3 className="mb-1 text-[12.5px] font-black tracking-[-0.01em] text-slate-800">
                  Технічне обслуговування
                </h3>
                <p className="text-[11.5px] leading-relaxed text-slate-500">
                  Практичні поради з ТО автомобіля: коли міняти масло, фільтри, гальмівні колодки, ремінь ГРМ. Ознаки несправностей і що робити, щоб не довести до поломки.
                </p>
              </div>
            </div>
          </div>

          <p className="mt-6 border-t border-slate-100 pt-5 text-[11.5px] leading-relaxed text-slate-500">
            Блог магазину автозапчастин <strong className="font-bold text-slate-700">PartsON у&nbsp;Львові</strong> — корисні матеріали для власників автомобілів та механіків. Ми пишемо про підбір і&nbsp;встановлення запчастин, порівнюємо виробників, пояснюємо складні технічні терміни простою мовою. Статті допоможуть зорієнтуватися при купівлі деталей — чи то двигун, підвіска, гальмівна система або електрика авто. <Link href="/katalog" className="font-semibold text-sky-600 underline decoration-sky-200 underline-offset-2 hover:text-sky-700">Перейти до каталогу запчастин</Link>.
          </p>

        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(blogJsonLd) }}
      />
    </main>
  );
}
