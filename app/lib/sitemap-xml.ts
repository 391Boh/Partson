import { NextResponse } from "next/server";

import { toAbsoluteSitePath } from "app/lib/catalog-links";
import type { SitemapChangeFrequency } from "app/lib/sitemap-sections";

interface SitemapXmlPathEntry {
  path: string;
  lastModified?: string | Date;
  changeFrequency?: SitemapChangeFrequency;
  priority?: number;
  images?: Array<{
    loc: string;
    title?: string;
    caption?: string;
  }>;
}

interface SitemapXmlIndexEntry {
  path: string;
  lastModified?: string | Date;
}

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");

const toIsoDate = (value: string | Date | undefined) => {
  if (!value) return undefined;
  const resolved = value instanceof Date ? value : new Date(value);
  return Number.isNaN(resolved.getTime()) ? undefined : resolved.toISOString();
};

export const buildUrlSetXml = (siteUrl: string, entries: SitemapXmlPathEntry[]) => {
  const hasImages = entries.some((entry) => (entry.images ?? []).length > 0);
  const xmlEntries = entries.map((entry) => {
    const lines = [
      "  <url>",
      `    <loc>${escapeXml(toAbsoluteSitePath(siteUrl, entry.path))}</loc>`,
    ];

    const lastModified = toIsoDate(entry.lastModified);
    if (lastModified) lines.push(`    <lastmod>${lastModified}</lastmod>`);
    if (entry.changeFrequency) {
      lines.push(`    <changefreq>${entry.changeFrequency}</changefreq>`);
    }
    if (typeof entry.priority === "number") {
      lines.push(`    <priority>${entry.priority.toFixed(2)}</priority>`);
    }
    for (const image of entry.images ?? []) {
      if (!image.loc) continue;
      lines.push("    <image:image>");
      lines.push(`      <image:loc>${escapeXml(toAbsoluteSitePath(siteUrl, image.loc))}</image:loc>`);
      if (image.title) {
        lines.push(`      <image:title>${escapeXml(image.title)}</image:title>`);
      }
      if (image.caption) {
        lines.push(`      <image:caption>${escapeXml(image.caption)}</image:caption>`);
      }
      lines.push("    </image:image>");
    }

    lines.push("  </url>");
    return lines.join("\n");
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    hasImages
      ? '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">'
      : '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...xmlEntries,
    "</urlset>",
  ].join("\n");
};

export const buildSitemapIndexXml = (siteUrl: string, entries: SitemapXmlIndexEntry[]) => {
  const xmlEntries = entries.map((entry) => {
    const lines = [
      "  <sitemap>",
      `    <loc>${escapeXml(toAbsoluteSitePath(siteUrl, entry.path))}</loc>`,
    ];

    const lastModified = toIsoDate(entry.lastModified);
    if (lastModified) lines.push(`    <lastmod>${lastModified}</lastmod>`);

    lines.push("  </sitemap>");
    return lines.join("\n");
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...xmlEntries,
    "</sitemapindex>",
  ].join("\n");
};

export const createSitemapXmlResponse = (xml: string) =>
  new NextResponse(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
