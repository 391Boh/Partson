import { NextResponse } from 'next/server';
import { getPublishedBlogPosts } from 'app/lib/blog';
import { isStorageMediaUrl } from 'app/lib/blog-media';
import { blogReadingMinutes } from 'app/lib/blog-presentation';
import type { HomeHighlight } from 'app/lib/home-highlights';

export async function GET(request: Request) {
  // getPublishedBlogPosts previously ran inside HeroBlogCard's own server
  // component render with a `.catch(() => [])` guard — a Firestore hiccup
  // degraded to the generic fallback instead of failing the whole hero. Now
  // that the fetch happens client-side against this route, the same guard
  // has to live here, or a transient read error surfaces as a 500 instead of
  // the empty/fallback state the client already knows how to handle.
  const posts = await getPublishedBlogPosts().catch(() => []);
  if (new URL(request.url).searchParams.get('view') === 'all') {
    const items: HomeHighlight[] = posts.slice(0, 12).map((item) => {
      const cover = item.imageDataUrl;
      const version = item.updatedAt || item.publishedAt || item.createdAt;
      const image = cover?.startsWith('data:image/')
        ? `/api/blog/og-image/${encodeURIComponent(item.slug)}${version ? `?v=${encodeURIComponent(version)}` : ''}`
        : cover || '/Car-parts-fullwidth.webp';
      return {
        id: `article-${item.slug}`, kind: 'article', title: item.title,
        description: item.excerpt, href: `/blog/${encodeURIComponent(item.slug)}`,
        image, imageAlt: item.imageAlt || item.title,
        meta: `${blogReadingMinutes(item.content)} хв читання`, action: 'Читати статтю',
      };
    });
    return NextResponse.json({ items }, { headers: { 'Cache-Control': items.length ? 'public, max-age=60, s-maxage=600, stale-while-revalidate=3600' : 'no-store' } });
  }
  const post = posts.find(item => item.imageDataUrl?.trim()) ?? posts[0];
  if (!post) return NextResponse.json(null, { headers: { 'Cache-Control': 'no-store' } });
  const cover = post.imageDataUrl;
  const inline = cover?.startsWith('data:image/');
  const version = post.updatedAt || post.publishedAt || post.createdAt;
  return NextResponse.json({
    title: post.title, href: `/blog/${encodeURIComponent(post.slug)}`,
    alt: post.imageAlt || post.title,
    image: inline ? `/api/blog/og-image/${encodeURIComponent(post.slug)}${version ? `?v=${encodeURIComponent(version)}` : ''}` : cover || '/Car-parts-fullwidth.webp',
    unoptimized: Boolean(cover && !inline && !isStorageMediaUrl(cover)),
  }, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=600, stale-while-revalidate=3600' } });
}
