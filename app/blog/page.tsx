import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Clock,
  Wrench,
  ShieldCheck,
  Gauge,
} from "lucide-react";
import { blogReadingMinutes, formatBlogDate } from "app/lib/blog-presentation";
import { toPublicBlogImageSrc } from "app/lib/blog-media";

import BlogAdminComposer from "app/blog/BlogAdminComposer";
import { getPublishedBlogPostsOrThrow } from "app/lib/blog";
import { appendSeoContact, buildPageMetadata } from "app/lib/seo-metadata";
import { safeJsonLd } from "app/lib/safe-json-ld";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 3600;

export const metadata: Metadata = buildPageMetadata({
  title: "Блог — статті про автозапчастини та ТО",
  description: appendSeoContact(
    "Як вибрати запчастини під своє авто, які бренди надійніші, як розпізнати несправність і що перевірити при обслуговуванні — статті від фахівців PartsON у Львові.",
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
  openGraphTitle:
    "Блог PartsON — корисні статті про запчастини та обслуговування авто",
});

export default async function BlogPage() {
  const posts = await getPublishedBlogPostsOrThrow();
  const featured = posts[0];
  const rest = posts.slice(1);

  const siteUrl = getSiteUrl();
  const blogJsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Блог PartsON — автозапчастини",
    url: `${siteUrl.replace(/\/$/, "")}/blog`,
    description:
      "Корисні статті про підбір автозапчастин, надійні бренди та технічне обслуговування авто від фахівців PartsON у Львові.",
    publisher: {
      "@type": "Organization",
      name: "PartsON",
      logo: {
        "@type": "ImageObject",
        url: `${siteUrl.replace(/\/$/, "")}/google-logo-partson-v3.png`,
      },
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

  const coverSrc = (post: (typeof posts)[number]) =>
    toPublicBlogImageSrc(
      post.imageDataUrl,
      post.slug,
      null,
      String(
        new Date(
          post.updatedAt || post.publishedAt || post.createdAt || 0,
        ).getTime(),
      ),
    );

  return (
    <main className="blog-page font-ui">
      <BlogAdminComposer />
      <header className="blog-masthead">
        <div className="page-shell-inline">
          <nav className="blog-breadcrumb" aria-label="Навігація сторінки">
            <Link href="/">Головна</Link>
            <span aria-hidden="true">/</span>
            <span>Блог PartsON</span>
          </nav>
          <div className="blog-masthead-layout">
            <h1 className="font-display">
              Менше здогадок.
              <br />
              <span>Більше знань про авто.</span>
            </h1>
            <p>
              Як вибрати запчастини, розібратися в брендах і вчасно подбати про
              автомобіль. Практичні статті від команди PartsON у Львові.
            </p>
          </div>
        </div>
      </header>
      <section
        className="page-shell-inline blog-posts"
        aria-label="Статті про автозапчастини та обслуговування авто"
      >
        {featured ? (
          <>
            <Link href={`/blog/${featured.slug}`} className="blog-feature">
              <div className="blog-feature-image">
                {coverSrc(featured) ? (
                  <Image
                    src={coverSrc(featured)!}
                    alt={featured.imageAlt || featured.title}
                    fill
                    unoptimized
                    loading="eager"
                    fetchPriority="high"
                    sizes="(max-width: 767px) 100vw, 60vw"
                  />
                ) : (
                  <BookOpen size={64} strokeWidth={1} aria-hidden="true" />
                )}
              </div>
              <div className="blog-feature-copy">
                <div className="blog-post-meta">
                  <time dateTime={featured.publishedAt || featured.createdAt}>
                    {formatBlogDate(featured.publishedAt || featured.createdAt)}
                  </time>
                  <span>
                    <Clock size={14} aria-hidden="true" />
                    {blogReadingMinutes(featured.content)} хв читання
                  </span>
                </div>
                <h2 className="font-display">{featured.title}</h2>
                <p>{featured.excerpt}</p>
                <span className="blog-read-link">
                  Читати статтю <ArrowUpRight size={22} aria-hidden="true" />
                </span>
              </div>
            </Link>
            {rest.length > 0 && (
              <div className="blog-more-posts">
                <h2 className="font-display">Ще більше корисного</h2>
                <div className="blog-card-grid">
                  {rest.map((post) => (
                    <Link
                      key={post.slug}
                      href={`/blog/${post.slug}`}
                      className="blog-story-card"
                    >
                      <div className="blog-story-image">
                        {coverSrc(post) ? (
                          <Image
                            src={coverSrc(post)!}
                            alt={post.imageAlt || post.title}
                            fill
                            unoptimized
                            loading="lazy"
                            sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw"
                          />
                        ) : (
                          <BookOpen
                            size={40}
                            strokeWidth={1.2}
                            aria-hidden="true"
                          />
                        )}
                      </div>
                      <div className="blog-story-copy">
                        <div className="blog-post-meta">
                          <time dateTime={post.publishedAt || post.createdAt}>
                            {formatBlogDate(post.publishedAt || post.createdAt)}
                          </time>
                          <span>
                            {blogReadingMinutes(post.content)} хв читання
                          </span>
                        </div>
                        <h3>{post.title}</h3>
                        <p>{post.excerpt}</p>
                        <span className="blog-read-link">
                          Читати <ArrowUpRight size={18} aria-hidden="true" />
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="blog-empty">
            <BookOpen size={44} strokeWidth={1.5} aria-hidden="true" />
            <h2>Готуємо корисні матеріали</h2>
            <p>
              Статті про вибір запчастин та догляд за авто незабаром зʼявляться
              тут.
            </p>
            <Link href="/katalog">
              Переглянути каталог <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
        )}
      </section>
      <section className="page-shell-inline blog-about">
        <div className="blog-about-heading">
          <h2 className="font-display">Розбираємося в деталях</h2>
          <p>
            Поради для власників авто та механіків — зрозумілою мовою, з увагою
            до сумісності й надійності.
          </p>
        </div>
        <div className="blog-topic-grid">
          <div>
            <Wrench size={24} aria-hidden="true" />
            <h3>Підбір запчастин</h3>
            <p>
              VIN, артикул та OEM-код. Як перевіряти сумісність і вибирати між
              оригіналом та аналогом.
            </p>
          </div>
          <div>
            <ShieldCheck size={24} aria-hidden="true" />
            <h3>Виробники та якість</h3>
            <p>
              Bosch, SKF, Febi, Sachs та інші бренди. На що звертати увагу при
              виборі деталей.
            </p>
          </div>
          <div>
            <Gauge size={24} aria-hidden="true" />
            <h3>Обслуговування авто</h3>
            <p>
              Олива, фільтри, гальма й ремінь ГРМ. Ознаки зносу та поради з
              догляду за автомобілем.
            </p>
          </div>
        </div>
        <div className="blog-catalog-bridge">
          <p>Вже знаєте, яка деталь потрібна?</p>
          <Link href="/katalog">
            Знайти в каталозі <ArrowRight size={20} aria-hidden="true" />
          </Link>
        </div>
      </section>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(blogJsonLd) }}
      />
    </main>
  );
}
