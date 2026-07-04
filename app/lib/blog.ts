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
  try {
    const snapshot = await getFirebaseAdminDb()
      .collection("blogPosts")
      .where("status", "==", "published")
      .limit(100)
      .get();

    return snapshot.docs
      .map((doc) => snapshotToBlogPost(doc.id, doc.data()))
      .sort((a, b) => {
        const aTime = new Date(a.publishedAt || a.createdAt || 0).getTime();
        const bTime = new Date(b.publishedAt || b.createdAt || 0).getTime();
        return bTime - aTime;
      });
  } catch (error) {
    console.error("Failed to load blog posts", error);
    return [];
  }
};

const fetchPublishedBlogPostBySlug = async (slug: string): Promise<BlogPost | null> => {
  const normalizedSlug = slug.trim();
  if (!normalizedSlug) return null;

  try {
    const doc = await getFirebaseAdminDb().collection("blogPosts").doc(normalizedSlug).get();
    if (!doc.exists) return null;

    const data = doc.data() ?? {};
    if (data.status !== "published") return null;
    return snapshotToBlogPost(doc.id, data);
  } catch (error) {
    console.error(`Failed to load blog post "${normalizedSlug}"`, error);
    return null;
  }
};

const getPublishedBlogPostsCached = unstable_cache(
  fetchPublishedBlogPosts,
  ["blog-posts-v1"],
  {
    revalidate: BLOG_REVALIDATE_SECONDS,
    tags: ["blog-posts"],
  }
);

export const getPublishedBlogPosts = cache(async () => getPublishedBlogPostsCached());

export const getPublishedBlogPostBySlug = cache(async (slug: string) =>
  fetchPublishedBlogPostBySlug(slug)
);
