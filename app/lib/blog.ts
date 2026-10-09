import "server-only";

import { cache } from "react";
import type { DocumentData } from "firebase-admin/firestore";
import { unstable_cache } from "next/cache";

import { getFirebaseAdminDb } from "app/lib/firebase-admin";

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  imageDataUrl?: string;
  imageAlt?: string;
  extraImages?: string[];
  videoUrl?: string;
  publishedAt?: string;
  updatedAt?: string;
  createdAt?: string;
  authorEmail?: string;
};

const BLOG_REVALIDATE_SECONDS = 60 * 10;
// A temporarily unreachable Firestore endpoint must not hold an entire page
// render (or a production build worker) until gRPC's ~60s transport timeout.
// Failed requests are not stored in unstable_cache, so the next request can
// retry normally instead of caching an empty blog after a transient outage.
// Measured from a fresh process: the first Firestore query takes ~2.1-2.3 s
// (gRPC channel + auth) and a warm one ~1.1-1.3 s, so 4.5 s left too little
// headroom on a busy server/dev machine and live articles intermittently
// vanished. 8 s still bounds a build worker well below gRPC's own timeout.
const BLOG_QUERY_TIMEOUT_MS = 8_000;

const withBlogQueryTimeout = async <T>(promise: Promise<T>, label: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`Blog ${label} timed out after ${BLOG_QUERY_TIMEOUT_MS}ms`)),
      BLOG_QUERY_TIMEOUT_MS
    );
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
};

const toIsoString = (value: unknown): string | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return undefined;
};

const readString = (value: unknown, fallback = "") =>
  typeof value === "string" ? value.trim() : fallback;

const snapshotToBlogPost = (id: string, data: DocumentData): BlogPost => ({
  id,
  slug: readString(data.slug, id),
  title: readString(data.title, "Стаття PartsON"),
  excerpt: readString(data.excerpt),
  content: readString(data.content),
  imageDataUrl: readString(data.imageDataUrl) || undefined,
  imageAlt: readString(data.imageAlt) || readString(data.title) || undefined,
  extraImages: Array.isArray(data.extraImages)
    ? (data.extraImages as unknown[]).filter((v): v is string => typeof v === "string")
    : undefined,
  videoUrl: readString(data.videoUrl) || undefined,
  publishedAt: toIsoString(data.publishedAt),
  updatedAt: toIsoString(data.updatedAt),
  createdAt: toIsoString(data.createdAt),
  authorEmail: readString(data.authorEmail) || undefined,
});

const fetchPublishedBlogPosts = async (): Promise<BlogPost[]> => {
  const snapshot = await withBlogQueryTimeout(
    getFirebaseAdminDb()
      .collection("blogPosts")
      .where("status", "==", "published")
      .limit(100)
      .get(),
    "posts query"
  );

  return snapshot.docs
    .map((doc) => snapshotToBlogPost(doc.id, doc.data()))
    .sort((a, b) => {
      const aTime = new Date(a.publishedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.publishedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });
};

const fetchPublishedBlogPostBySlug = async (slug: string): Promise<BlogPost | null> => {
  const normalizedSlug = slug.trim();
  if (!normalizedSlug) return null;

  const doc = await withBlogQueryTimeout(
    getFirebaseAdminDb().collection("blogPosts").doc(normalizedSlug).get(),
    `post query (${normalizedSlug})`
  );
  if (!doc.exists) return null;

  const data = doc.data() ?? {};
  if (data.status !== "published") return null;
  return snapshotToBlogPost(doc.id, data);
};

const getPublishedBlogPostsCached = unstable_cache(
  fetchPublishedBlogPosts,
  ["blog-posts-v1"],
  {
    revalidate: BLOG_REVALIDATE_SECONDS,
    tags: ["blog-posts"],
  }
);

// Per-post twin of the list cache: the article page, its metadata and the
// blog image route each used to hit Firestore on every request. Same tag, so
// admin edits (revalidateTag("blog-posts")) refresh it; throws aren't cached.
const getPublishedBlogPostBySlugCached = unstable_cache(
  fetchPublishedBlogPostBySlug,
  ["blog-post-by-slug-v1"],
  {
    revalidate: BLOG_REVALIDATE_SECONDS,
    tags: ["blog-posts"],
  }
);

export const getPublishedBlogPosts = cache(async () => {
  try {
    return await getPublishedBlogPostsCached();
  } catch (error) {
    console.error("Failed to load blog posts", error);
    return [];
  }
});

// For pages cached with ISR (/blog, blog sitemap): rethrow instead of
// returning [] so a Firestore timeout during revalidation keeps serving the
// last good render. The lenient getPublishedBlogPosts() above turned one
// timeout into an empty blog cached for the whole revalidate window.
export const getPublishedBlogPostsOrThrow = cache(async () => {
  try {
    return await getPublishedBlogPostsCached();
  } catch (error) {
    console.error("Failed to load blog posts", error);
    throw error;
  }
});

// Unlike getPublishedBlogPosts(), a failed lookup is rethrown rather than mapped to
// null: callers treat null as "no such post" and answer 404, so a Firestore
// timeout used to turn a live article into a 404 (and, under ISR, replace the
// cached page with it). Throwing lets ISR keep serving the last good render.
export const getPublishedBlogPostBySlug = cache(async (slug: string) => {
  try {
    return await getPublishedBlogPostBySlugCached(slug);
  } catch (error) {
    console.error(`Failed to load blog post "${slug}"`, error);
    throw error;
  }
});
