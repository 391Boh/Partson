// Shared between the blog upload route and the post create/update routes so
// both accept the same two media shapes: a legacy inline data URI (already
// published articles, still stored inline in Firestore) and a Storage file
// URL produced by /api/blog/upload (see app/lib/firebase-admin.ts).
export const LEGACY_IMAGE_DATA_URI_REGEX =
  /^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/i;

const STORAGE_HOST_PATTERN =
  /^https:\/\/(?:storage\.googleapis\.com|firebasestorage\.googleapis\.com)\//i;

export const isStorageMediaUrl = (value: string) => STORAGE_HOST_PATTERN.test(value);

export const isBlogImageValue = (value: string) =>
  LEGACY_IMAGE_DATA_URI_REGEX.test(value) || isStorageMediaUrl(value);

const YOUTUBE_VIMEO_URL_REGEX =
  /^https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/|vimeo\.com\/)[\w?=&%-]{1,100}$/i;

export const isBlogVideoValue = (value: string) =>
  YOUTUBE_VIMEO_URL_REGEX.test(value) || isStorageMediaUrl(value);

export const MAX_BLOG_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_BLOG_VIDEO_BYTES = 200 * 1024 * 1024;
export const MAX_BLOG_MEDIA_URL_LENGTH = 500;

export const ALLOWED_BLOG_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export const ALLOWED_BLOG_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
]);

// Legacy inline data-URI images are served through /api/blog/og-image so the
// article HTML carries a short URL instead of megabytes of base64 (each image
// was otherwise inlined into the markup, the RSC payload and the admin
// editor's props). `i` selects an extraImages slot (omitted = cover); `v`
// busts HTTP caches after an edit.
const LEGACY_BLOG_IMAGE_PATH_PREFIX = "/api/blog/og-image/";

export const buildLegacyBlogImagePath = (slug: string, index: number | null, version?: string) => {
  const params = new URLSearchParams();
  if (index !== null) params.set("i", String(index));
  if (version) params.set("v", version);
  const query = params.toString();
  return `${LEGACY_BLOG_IMAGE_PATH_PREFIX}${encodeURIComponent(slug)}${query ? `?${query}` : ""}`;
};

// Inverse of buildLegacyBlogImagePath for this post: null when `value` isn't
// one of its proxy paths, otherwise the slot it points at (null index = cover).
export const parseLegacyBlogImagePath = (value: string, slug: string): { index: number | null } | null => {
  const prefix = `${LEGACY_BLOG_IMAGE_PATH_PREFIX}${encodeURIComponent(slug)}`;
  if (value !== prefix && !value.startsWith(`${prefix}?`)) return null;
  const raw = new URLSearchParams(value.slice(prefix.length + 1)).get("i");
  if (raw === null) return { index: null };
  const index = Number(raw);
  return Number.isInteger(index) && index >= 0 ? { index } : null;
};

export const toPublicBlogImageSrc = (
  value: string | undefined,
  slug: string,
  index: number | null,
  version?: string
) => {
  if (!value) return value;
  return value.startsWith("data:image/") ? buildLegacyBlogImagePath(slug, index, version) : value;
};

// Aspect-ratio crops of a post's cover served by /api/blog/og-image?ar=…
// (Google asks for 16:9, 4:3 and 1:1 article images).
export const BLOG_IMAGE_ASPECT_RATIOS = {
  "16x9": [16, 9],
  "4x3": [4, 3],
  "1x1": [1, 1],
} as const;

export type BlogImageAspectRatio = keyof typeof BLOG_IMAGE_ASPECT_RATIOS;

export const buildBlogCoverCropPath = (slug: string, ratio: BlogImageAspectRatio, version?: string) => {
  const params = new URLSearchParams({ ar: ratio });
  if (version) params.set("v", version);
  return `${LEGACY_BLOG_IMAGE_PATH_PREFIX}${encodeURIComponent(slug)}?${params.toString()}`;
};
