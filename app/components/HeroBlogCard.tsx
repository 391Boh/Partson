import Image from 'next/image';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { getPublishedBlogPosts } from 'app/lib/blog';
import { isStorageMediaUrl } from 'app/lib/blog-media';

export function HeroBlogCardFallback() {
  return (
    <Link href="/blog" prefetch={false} className="home-feature-card home-blog-card">
      <div className="home-feature-image home-feature-image-blog" aria-hidden="true" />
      <div className="home-feature-copy">
        <span className="home-feature-label">Блог · Поради для водіїв</span>
        <h2>Поради з вибору автозапчастин</h2>
        <span className="home-feature-action">Читати блог <ChevronRight size={14} aria-hidden="true" /></span>
      </div>
    </Link>
  );
}

export default async function HeroBlogCard() {
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
        <Link href={blogHref} prefetch={false} className="home-feature-card home-blog-card" title={blogTitle}>
          <div className="home-feature-image home-feature-image-blog">
            <Image
              src={blogImage}
              alt={blogAlt}
              fill
              unoptimized={Boolean(coverImage && !isInlineCover && !isStorageMediaUrl(coverImage))}
              quality={90}
              sizes="(max-width: 479px) 96px, 120px"
              className="object-contain"
            />
          </div>
          <div className="home-feature-copy">
            <span className="home-feature-label">Блог · Поради для водіїв</span>
            <h2>{blogTitle}</h2>
            <span className="home-feature-action">Читати статтю <ChevronRight size={14} aria-hidden="true" /></span>
          </div>
        </Link>
  );
}
