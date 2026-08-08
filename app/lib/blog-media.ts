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
