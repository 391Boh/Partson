import type { MetadataRoute } from "next";

export const revalidate = 3600;

export async function generateSitemaps() {
  return [];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return [];
}
