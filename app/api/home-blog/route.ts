import { NextResponse } from 'next/server';
import { getPublishedBlogPosts } from 'app/lib/blog';
import { isStorageMediaUrl } from 'app/lib/blog-media';
import { getHomeBlogHighlights } from 'app/lib/home-blog-preview-cache';

export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get('view') === 'all') {
    const items = await getHomeBlogHighlights().catch(() => []);
    return NextResponse.json({ items }, { headers: { 'Cache-Control': items.length ? 'public, max-age=60, s-maxage=600, stale-while-revalidate=3600' : 'no-store' } });
  }
  const posts = await getPublishedBlogPosts().catch(() => []);
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
