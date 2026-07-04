import type { Metadata } from "next";
import React from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Clock } from "lucide-react";

import { getPublishedBlogPostBySlug, getPublishedBlogPosts } from "app/lib/blog";
import { appendSeoContact, buildPageMetadata } from "app/lib/seo-metadata";
import { safeJsonLd } from "app/lib/safe-json-ld";
import { getSiteUrl } from "app/lib/site-url";
import BlogAdminActions from "./BlogAdminActions";

type BlogPostPageProps = { params: Promise<{ slug: string }> };

export const revalidate = 3600;

const formatDate = (value: string | undefined) => {
  if (!value) return "Оновлено";
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

const getVideoEmbedUrl = (url: string): string | null => {
  try {
    const u = new URL(url);
    // YouTube
    const ytId =
      u.searchParams.get("v") ||
      (u.hostname === "youtu.be" ? u.pathname.slice(1) : null) ||
      (u.pathname.startsWith("/embed/") ? u.pathname.slice(7) : null) ||
      (u.pathname.startsWith("/shorts/") ? u.pathname.slice(8) : null);
    if (ytId) return `https://www.youtube.com/embed/${ytId}?rel=0`;
    // Vimeo
    if (u.hostname.includes("vimeo.com")) {
      const id = u.pathname.replace(/\//g, "");
      if (id) return `https://player.vimeo.com/video/${id}`;
    }
  } catch { /* ignore */ }
  return null;
};

type BlockNode =
  | { type: "p"; lines: string[] }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] };

const applyInline = (text: string): (string | React.ReactElement)[] => {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a key={i} href={linkMatch[2]} rel="noopener noreferrer" className="text-sky-600 underline decoration-sky-200 underline-offset-2 hover:text-sky-700">
          {linkMatch[1]}
        </a>
      );
    }
    return part;
  });
};

const parseContent = (content: string): BlockNode[] => {
  const lines = content.split("\n");
  const blocks: BlockNode[] = [];
  let currentP: string[] = [];
  let currentUl: string[] = [];

  const flushP = () => {
    if (currentP.length > 0) { blocks.push({ type: "p", lines: [...currentP] }); currentP = []; }
  };
  const flushUl = () => {
    if (currentUl.length > 0) { blocks.push({ type: "ul", items: [...currentUl] }); currentUl = []; }
  };

  for (const line of lines) {
    if (line.trim() === "") {
      flushP(); flushUl();
    } else if (line.startsWith("## ")) {
      flushP(); flushUl();
      blocks.push({ type: "h2", text: line.slice(3).trim() });
    } else if (line.startsWith("### ")) {
      flushP(); flushUl();
      blocks.push({ type: "h3", text: line.slice(4).trim() });
    } else if (line.startsWith("- ")) {
      flushP();
      currentUl.push(line.slice(2).trim());
    } else {
      flushUl();
      currentP.push(line);
    }
  }
  flushP(); flushUl();
  return blocks;
};

export async function generateStaticParams() {
  const posts = await getPublishedBlogPosts();
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedBlogPostBySlug(decodeURIComponent(slug));
  if (!post) {
    return buildPageMetadata({
      title: "Статтю не знайдено",
      description: "Стаття недоступна",
      canonicalPath: "/blog",
      index: false,
      follow: true,
    });
  }
  const contentWords = post.content
    .split(/[\s,\.;\:\!\?\/\(\)\-–—«»"'\n]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 5 && !/^\d+$/.test(w))
    .slice(0, 6);
  return buildPageMetadata({
    title: post.title,
    description: appendSeoContact(post.excerpt),
    canonicalPath: `/blog/${post.slug}`,
    type: "article",
    keywords: ["блог PartsON", "автозапчастини Львів", post.title, ...contentWords],
    image: { url: "/Car-parts-fullwidth.png", alt: post.imageAlt || post.title },
    openGraphTitle: `${post.title} | Блог PartsON`,
  });
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = await getPublishedBlogPostBySlug(decodeURIComponent(slug));
  if (!post) notFound();

  const siteUrl = getSiteUrl();
  const canonicalUrl = `${siteUrl.replace(/\/$/, "")}/blog/${post.slug}`;
  const published = post.publishedAt || post.createdAt;
  const updated = post.updatedAt || published;

  const contentBlocks = parseContent(post.content);
  const extraImages = post.extraImages ?? [];
  const videoEmbedUrl = post.videoUrl ? getVideoEmbedUrl(post.videoUrl) : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    image: `${siteUrl.replace(/\/$/, "")}/Car-parts-fullwidth.png`,
    datePublished: published,
    dateModified: updated,
    wordCount: Math.round(post.content.split(/\s+/).length / 10) * 10,
    articleSection: "Автозапчастини",
    inLanguage: "uk",
    author: { "@type": "Organization", name: "PartsON" },
    publisher: {
      "@type": "Organization",
      name: "PartsON",
      logo: { "@type": "ImageObject", url: `${siteUrl.replace(/\/$/, "")}/favicon-512x512.png` },
    },
    mainEntityOfPage: canonicalUrl,
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Головна", item: siteUrl.replace(/\/$/, "") },
      { "@type": "ListItem", position: 2, name: "Блог", item: `${siteUrl.replace(/\/$/, "")}/blog` },
      { "@type": "ListItem", position: 3, name: post.title, item: canonicalUrl },
    ],
  };

  return (
    <main
      className="font-ui min-h-screen text-slate-900"
      style={{ background: "linear-gradient(180deg,#dbeeff 0%,#eaf4fd 10%,#f2f8fe 24%,#f9fcff 42%,#ffffff 66%,#f5f9fd 100%)" }}
    >
      <BlogAdminActions
        slug={post.slug}
        initialTitle={post.title}
        initialExcerpt={post.excerpt}
        initialContent={post.content}
        initialImageDataUrl={post.imageDataUrl}
        initialImageAlt={post.imageAlt}
        initialExtraImages={post.extraImages}
        initialVideoUrl={post.videoUrl}
      />

      <article>
        {/* ── hero ── */}
        <header
          className="relative isolate overflow-hidden text-white"
          style={{
            background: "linear-gradient(148deg,#071e38 0%,#0a3460 30%,#0d5490 58%,#1268a8 80%,#0a3d6c 100%)",
            boxShadow: "0 8px 40px rgba(7,30,56,0.55), 0 2px 0 rgba(18,104,168,0.30)",
          }}
        >
          {/* deep volume layer */}
          <span className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(ellipse 65% 80% at 0% 0%,rgba(56,182,255,0.28) 0%,transparent 55%)," +
                "radial-gradient(ellipse 55% 60% at 100% 0%,rgba(80,140,255,0.20) 0%,transparent 52%)," +
                "radial-gradient(ellipse 80% 40% at 50% 100%,rgba(6,25,50,0.60) 0%,transparent 70%)",
            }}
          />
          {/* dot grid */}
          <span className="pointer-events-none absolute inset-0 opacity-[0.035]"
            style={{
              backgroundImage: "radial-gradient(circle,rgba(186,230,255,1) 1px,transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          />
          {/* inner top highlight */}
          <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/40 to-transparent" />
          {/* bottom shadow fade */}
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-b from-transparent to-black/20" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-sky-950/60" />

          <div className="page-shell-inline relative z-10 py-3.5 sm:py-5">
            <div className={`grid items-center gap-4 ${post.imageDataUrl ? "lg:grid-cols-[1fr_480px]" : ""}`}>
              <div>
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <Link
                    href="/blog"
                    className="inline-flex items-center gap-1 rounded border border-white/18 bg-white/10 px-2 py-0.5 text-[10.5px] font-bold text-sky-200 transition hover:bg-white/16"
                  >
                    <ArrowLeft size={10} strokeWidth={2.5} /> Блог
                  </Link>
                  <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-sky-300/70">
                    <CalendarDays size={10} /> {formatDate(published)}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-white/45">
                    <Clock size={10} /> {timeAgo(published)}
                  </span>
                </div>
                <h1 className="text-[1.35rem] font-black leading-[1.1] tracking-[-0.04em] text-white sm:text-[1.8rem] lg:text-[2rem]">
                  {post.title}
                </h1>
                <p className="mt-1.5 text-[12.5px] font-medium leading-snug text-sky-50/55 sm:text-[13px]">
                  {post.excerpt}
                </p>
              </div>

              {post.imageDataUrl && (
                <div className="hidden lg:block">
                  <div className="overflow-hidden rounded-[8px] border border-white/18 shadow-[0_16px_44px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.12)]">
                    <Image
                      src={post.imageDataUrl}
                      alt={post.imageAlt || post.title}
                      width={960}
                      height={560}
                      unoptimized
                      priority
                      className="aspect-[16/9] w-full object-cover"
                    />
                  </div>
                </div>
              )}
            </div>

            {post.imageDataUrl && (
              <div className="mt-2.5 lg:hidden">
                <div className="overflow-hidden rounded-[7px] border border-white/16 shadow-[0_8px_24px_rgba(0,0,0,0.28)]">
                  <Image
                    src={post.imageDataUrl}
                    alt={post.imageAlt || post.title}
                    width={720}
                    height={380}
                    unoptimized
                    priority
                    className="max-h-[240px] w-full object-cover sm:max-h-[320px]"
                  />
                </div>
              </div>
            )}
          </div>
        </header>

        {/* ── article body ── */}
        <div className="page-shell-inline py-8 sm:py-11"
          style={{ filter: "drop-shadow(0 -1px 0 rgba(14,80,128,0.08))" }}
        >

          {/* decorative header line */}
          <div className="mb-7 flex items-center gap-3">
            <div className="h-[2px] w-8 rounded-full bg-sky-400/60" />
            <span className="text-[10px] font-black uppercase tracking-[0.24em] text-sky-500/70">Матеріал</span>
            <div className="h-px flex-1 bg-gradient-to-r from-sky-200/50 to-transparent" />
          </div>

          {/* article content */}
          <div className="space-y-5">
            {(() => {
              let pIdx = 0;
              return contentBlocks.map((block, idx) => {
                if (block.type === "h2") {
                  return (
                    <h2 key={idx} className="mt-8 mb-2 text-[1.2rem] font-black leading-tight tracking-[-0.03em] text-slate-950 sm:text-[1.35rem]">
                      {applyInline(block.text)}
                    </h2>
                  );
                }
                if (block.type === "h3") {
                  return (
                    <h3 key={idx} className="mt-6 mb-1.5 text-[1rem] font-extrabold leading-tight tracking-[-0.02em] text-slate-800 sm:text-[1.08rem]">
                      {applyInline(block.text)}
                    </h3>
                  );
                }
                if (block.type === "ul") {
                  return (
                    <ul key={idx} className="ml-4 space-y-1.5 list-disc">
                      {block.items.map((item, iIdx) => (
                        <li key={iIdx} className="text-[15.5px] font-[440] leading-[1.8] text-slate-700 sm:text-[16px]">
                          {applyInline(item)}
                        </li>
                      ))}
                    </ul>
                  );
                }
                // "p" block — keep image-interleave logic with pIdx
                const img = extraImages[pIdx];
                const isEven = pIdx % 2 === 0;
                const isFirst = pIdx === 0;
                pIdx++;

                const makeText = (align: string) => (
                  <p className={`text-[15.5px] font-[440] leading-[1.9] text-slate-700 sm:text-[16px] ${align}`}>
                    {block.lines.map((line, lIdx) =>
                      lIdx < block.lines.length - 1 ? (
                        <span key={lIdx}>{applyInline(line)}<br /></span>
                      ) : (
                        <span key={lIdx}>{applyInline(line)}</span>
                      )
                    )}
                  </p>
                );

                if (!img) {
                  return (
                    <div key={idx} className="group relative">
                      {isFirst && (
                        <div className="absolute -left-4 top-1 bottom-1 w-[3px] rounded-full bg-gradient-to-b from-sky-400/70 to-sky-200/30 sm:-left-5" />
                      )}
                      {!isFirst && (
                        <div className="mb-5 h-px bg-gradient-to-r from-slate-200/70 via-slate-100/50 to-transparent" />
                      )}
                      {makeText("text-justify")}
                    </div>
                  );
                }

                return (
                  <div key={idx}>
                    {!isFirst && (
                      <div className="mb-7 h-px bg-gradient-to-r from-slate-200/60 via-slate-100/40 to-transparent" />
                    )}
                    <div className={`flex flex-col gap-4 sm:items-start ${isEven ? "sm:flex-row" : "sm:flex-row-reverse"}`}>
                      <div className="w-full shrink-0 sm:w-[250px] lg:w-[290px]">
                        <div className="overflow-hidden rounded-[8px] border border-slate-200/60 shadow-[0_3px_14px_rgba(15,23,42,0.09)] transition-shadow hover:shadow-[0_6px_22px_rgba(15,23,42,0.13)]">
                          <Image
                            src={img}
                            alt={`${post.title} — фото ${pIdx}`}
                            width={580}
                            height={400}
                            unoptimized
                            className="aspect-[4/3] w-full object-cover"
                          />
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        {makeText(isEven ? "sm:text-right" : "text-justify")}
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>

          {/* ── video ── */}
          {videoEmbedUrl && (
            <div className="mt-8">
              <div className="mb-4 flex items-center gap-3">
                <div className="h-[2px] w-8 rounded-full bg-sky-400/60" />
                <span className="text-[10px] font-black uppercase tracking-[0.24em] text-sky-500/70">Відео</span>
                <div className="h-px flex-1 bg-gradient-to-r from-sky-200/50 to-transparent" />
              </div>
              <div
                className="overflow-hidden rounded-[10px] border border-slate-200/60 shadow-[0_4px_18px_rgba(15,23,42,0.09)]"
                style={{ aspectRatio: "16/9" }}
              >
                <iframe
                  src={videoEmbedUrl}
                  title={post.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full"
                  loading="lazy"
                />
              </div>
            </div>
          )}

          {/* bottom rule + back link */}
          <div className="mt-10 flex items-center gap-4">
            <div className="h-px flex-1 bg-gradient-to-r from-slate-200/70 to-transparent" />
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 rounded-[7px] border border-slate-200/80 bg-white px-3.5 py-2 text-[12.5px] font-bold text-slate-600 shadow-[0_2px_8px_rgba(15,23,42,0.05)] transition hover:border-sky-200 hover:text-sky-700"
            >
              <ArrowLeft size={12} strokeWidth={2.2} /> Усі статті
            </Link>
          </div>
        </div>
      </article>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
      />
    </main>
  );
}
