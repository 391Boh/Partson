import type { Metadata } from "next";
import React from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Clock, ShieldCheck } from "lucide-react";
import { blogReadingMinutes, formatBlogDate } from "app/lib/blog-presentation";
import ArticleReadingProgress from "../ArticleReadingProgress";

import {
  getPublishedBlogPostBySlug,
  getPublishedBlogPosts,
} from "app/lib/blog";
import {
  buildBlogCoverCropPath,
  toPublicBlogImageSrc,
} from "app/lib/blog-media";
import { appendSeoContact, buildPageMetadata } from "app/lib/seo-metadata";
import { safeJsonLd } from "app/lib/safe-json-ld";
import { getSiteUrl } from "app/lib/site-url";
import BlogAdminActions from "./BlogAdminActions";

type BlogPostPageProps = { params: Promise<{ slug: string }> };

export const revalidate = 3600;

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
  } catch {
    /* ignore */
  }
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
        <a
          key={i}
          href={linkMatch[2]}
          rel="noopener noreferrer"
          className="text-sky-600 underline decoration-sky-200 underline-offset-2 hover:text-sky-700"
        >
          {linkMatch[1]}
        </a>
      );
    }
    return part;
  });
};

// Authors rarely type "## " by hand. A standalone short line with no
// sentence-ending punctuation (or ending in "?") reads as a section title in
// practice — "Синтетична", "Як часто потрібно міняти моторну оливу?" — while
// a normal sentence almost always ends in ".", "," ";" or ":". Only promotes
// single-line paragraph blocks, so it never touches multi-line body text.
const looksLikeAutoHeading = (line: string): boolean => {
  const trimmed = line.trim();
  if (trimmed.length < 3 || trimmed.length > 100) return false;
  if (/[.,;:!]$/.test(trimmed)) return false;
  return /[?)a-zа-яіїєґ'’0-9»"]$/iu.test(trimmed);
};

const parseContent = (content: string): BlockNode[] => {
  const lines = content.split("\n");
  const blocks: BlockNode[] = [];
  let currentP: string[] = [];
  let currentUl: string[] = [];

  const flushP = () => {
    if (currentP.length === 0) return;
    if (currentP.length === 1 && looksLikeAutoHeading(currentP[0])) {
      blocks.push({ type: "h2", text: currentP[0].trim() });
    } else {
      blocks.push({ type: "p", lines: [...currentP] });
    }
    currentP = [];
  };
  const flushUl = () => {
    if (currentUl.length > 0) {
      blocks.push({ type: "ul", items: [...currentUl] });
      currentUl = [];
    }
  };

  for (const line of lines) {
    if (line.trim() === "") {
      flushP();
      flushUl();
    } else if (line.startsWith("## ")) {
      flushP();
      flushUl();
      blocks.push({ type: "h2", text: line.slice(3).trim() });
    } else if (line.startsWith("### ")) {
      flushP();
      flushUl();
      blocks.push({ type: "h3", text: line.slice(4).trim() });
    } else if (line.startsWith("- ")) {
      flushP();
      currentUl.push(line.slice(2).trim());
    } else {
      flushUl();
      currentP.push(line);
    }
  }
  flushP();
  flushUl();
  return blocks;
};

// Changes on every edit, so versioned image URLs can be cached for good.
const buildBlogImageVersion = (post: {
  updatedAt?: string;
  publishedAt?: string;
  createdAt?: string;
}) =>
  String(
    new Date(
      post.updatedAt || post.publishedAt || post.createdAt || 0,
    ).getTime(),
  );

export async function generateStaticParams() {
  const posts = await getPublishedBlogPosts();
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: BlogPostPageProps): Promise<Metadata> {
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
  // A 16:9 crop of the cover (≤1200px wide) — the shape Google and social
  // networks use for large previews — instead of the raw upload.
  const socialImage = post.imageDataUrl
    ? buildBlogCoverCropPath(post.slug, "16x9", buildBlogImageVersion(post))
    : "/opengraph-partson-v3.png";
  return buildPageMetadata({
    title: post.title,
    description: appendSeoContact(post.excerpt),
    canonicalPath: `/blog/${post.slug}`,
    type: "article",
    keywords: [
      "блог PartsON",
      "автозапчастини Львів",
      post.title,
      ...contentWords,
    ],
    image: { url: socialImage, alt: post.imageAlt || post.title },
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
  const siteOrigin = siteUrl.replace(/\/$/, "");
  // Google recommends article images in 16:9, 4:3 and 1:1.
  const seoImage = post.imageDataUrl
    ? (["16x9", "4x3", "1x1"] as const).map(
        (ratio) =>
          `${siteOrigin}${buildBlogCoverCropPath(post.slug, ratio, buildBlogImageVersion(post))}`,
      )
    : [`${siteOrigin}/opengraph-partson-v3.png`];

  const contentBlocks = parseContent(post.content);
  // Legacy posts keep images as inline base64 — swap them for short proxy
  // URLs so the HTML doesn't carry megabytes of image data.
  const imageVersion = buildBlogImageVersion(post);
  const coverImageSrc = toPublicBlogImageSrc(
    post.imageDataUrl,
    post.slug,
    null,
    imageVersion,
  );
  const extraImages = (post.extraImages ?? []).map(
    (src, index) =>
      toPublicBlogImageSrc(src, post.slug, index, imageVersion) ?? "",
  );
  const videoEmbedUrl = post.videoUrl ? getVideoEmbedUrl(post.videoUrl) : null;
  // Not a recognized YouTube/Vimeo link but still a video URL — an uploaded
  // file (see /api/blog/upload), play it natively instead of iframe-embedding.
  const videoFileUrl = post.videoUrl && !videoEmbedUrl ? post.videoUrl : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    image: seoImage,
    datePublished: published,
    dateModified: updated,
    wordCount: Math.round(post.content.split(/\s+/).length / 10) * 10,
    articleSection: "Автозапчастини",
    inLanguage: "uk",
    author: {
      "@type": "Organization",
      "@id": `${siteUrl.replace(/\/$/, "")}/authors/partson#author`,
      name: "Редакція PartsON",
      url: `${siteUrl.replace(/\/$/, "")}/authors/partson`,
      description:
        "Команда фахівців PartsON з практичним досвідом підбору автозапчастин, перевірки сумісності та обслуговування клієнтів.",
    },
    publisher: {
      "@type": "Organization",
      name: "PartsON",
      logo: {
        "@type": "ImageObject",
        url: `${siteUrl.replace(/\/$/, "")}/google-logo-partson-v3.png`,
      },
    },
    mainEntityOfPage: canonicalUrl,
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Головна",
        item: siteUrl.replace(/\/$/, ""),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Блог",
        item: `${siteUrl.replace(/\/$/, "")}/blog`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: post.title,
        item: canonicalUrl,
      },
    ],
  };

  const headings = contentBlocks.flatMap((block, index) =>
    block.type === "h2" || block.type === "h3"
      ? [
          {
            id: `section-${index}`,
            title: block.text.replace(/\*\*/g, ""),
            level: block.type,
          },
        ]
      : [],
  );
  const contents = (
    <ol>
      {headings.map((heading) => (
        <li
          key={heading.id}
          className={heading.level === "h3" ? "blog-toc-subheading" : undefined}
        >
          <a href={`#${heading.id}`}>{heading.title}</a>
        </li>
      ))}
    </ol>
  );

  return (
    <main className="blog-page blog-article-page font-ui">
      <ArticleReadingProgress />
      <BlogAdminActions
        slug={post.slug}
        initialTitle={post.title}
        initialExcerpt={post.excerpt}
        initialContent={post.content}
        initialImageDataUrl={coverImageSrc}
        initialImageAlt={post.imageAlt}
        initialExtraImages={post.extraImages ? extraImages : undefined}
        initialVideoUrl={post.videoUrl}
      />
      <article>
        <header className="blog-article-header page-shell-inline">
          <nav className="blog-breadcrumb" aria-label="Навігація статті">
            <Link href="/">Головна</Link>
            <span aria-hidden="true">/</span>
            <Link href="/blog">Блог</Link>
            <span aria-hidden="true">/</span>
            <span>Стаття</span>
          </nav>
          <h1 className="font-display">{post.title}</h1>
          <p className="blog-article-deck">{post.excerpt}</p>
          <div className="blog-article-byline">
            <Link href="/authors/partson" rel="author">
              <ShieldCheck size={18} aria-hidden="true" />
              Редакція PartsON
            </Link>
            <time dateTime={published}>{formatBlogDate(published)}</time>
            <span>
              <Clock size={15} aria-hidden="true" />
              {blogReadingMinutes(post.content)} хв читання
            </span>
            {updated !== published && (
              <time dateTime={updated}>Оновлено {formatBlogDate(updated)}</time>
            )}
          </div>
          {coverImageSrc && (
            <figure className="blog-article-cover">
              <Image
                src={coverImageSrc}
                alt={post.imageAlt || post.title}
                width={1200}
                height={675}
                unoptimized
                loading="eager"
                fetchPriority="high"
                className="blog-cover-image"
              />
            </figure>
          )}
        </header>
        <div
          className={`page-shell-inline blog-reading-layout ${headings.length ? "blog-reading-layout--with-toc" : ""}`}
        >
          {headings.length > 0 && (
            <aside className="blog-toc">
              <nav className="blog-toc-desktop" aria-label="Зміст статті">
                <h2>У цій статті</h2>
                {contents}
              </nav>
              <details className="blog-toc-mobile">
                <summary>Зміст статті</summary>
                <nav aria-label="Зміст статті">{contents}</nav>
              </details>
            </aside>
          )}
          <div id="blog-reading-content" className="blog-reading-content">
            <div className="blog-prose">
              {(() => {
                let pIdx = 0;
                return contentBlocks.map((block, idx) => {
                  if (block.type === "h2")
                    return (
                      <h2 key={idx} id={`section-${idx}`}>
                        {applyInline(block.text)}
                      </h2>
                    );
                  if (block.type === "h3")
                    return (
                      <h3 key={idx} id={`section-${idx}`}>
                        {applyInline(block.text)}
                      </h3>
                    );
                  if (block.type === "ul")
                    return (
                      <ul key={idx}>
                        {block.items.map((item, index) => (
                          <li key={index}>{applyInline(item)}</li>
                        ))}
                      </ul>
                    );
                  const img = extraImages[pIdx];
                  pIdx++;
                  return (
                    <React.Fragment key={idx}>
                      <p>
                        {block.lines.map((line, index) => (
                          <React.Fragment key={index}>
                            {applyInline(line)}
                            {index < block.lines.length - 1 && <br />}
                          </React.Fragment>
                        ))}
                      </p>
                      {img && (
                        <figure className="blog-inline-figure">
                          <Image
                            src={img}
                            alt={`${post.title} — фото ${pIdx}`}
                            width={760}
                            height={520}
                            unoptimized
                            loading="lazy"
                          />
                        </figure>
                      )}
                    </React.Fragment>
                  );
                });
              })()}
            </div>
            {(videoEmbedUrl || videoFileUrl) && (
              <section className="blog-article-video">
                <h2>Відео до статті</h2>
                <div>
                  {videoEmbedUrl ? (
                    <iframe
                      src={videoEmbedUrl}
                      title={post.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      loading="lazy"
                    />
                  ) : (
                    <video
                      src={videoFileUrl ?? undefined}
                      controls
                      playsInline
                      preload="metadata"
                    />
                  )}
                </div>
              </section>
            )}
            <aside className="blog-author-note">
              <ShieldCheck size={24} aria-hidden="true" />
              <div>
                <Link href="/authors/partson" rel="author">
                  Редакція PartsON
                </Link>
                <p>
                  Команда фахівців із підбору автозапчастин, перевірки OEM-кодів
                  і сумісності за VIN у Львові.
                </p>
                <Link href="/editorial-policy" className="blog-policy-link">
                  Як ми готуємо матеріали{" "}
                  <ArrowUpRight size={14} aria-hidden="true" />
                </Link>
              </div>
            </aside>
            <div className="blog-article-next">
              <Link href="/blog">
                <ArrowLeft size={18} aria-hidden="true" />
                Усі статті блогу
              </Link>
              <Link href="/katalog">
                До каталогу запчастин{" "}
                <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
            </div>
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
