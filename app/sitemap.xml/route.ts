import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { buildCatalogCategoryPath, buildCatalogProducerPath, toAbsoluteSitePath } from "app/lib/catalog-links";
import { getCatalogSeoFacets } from "app/lib/catalog-seo";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 3600;

type SitemapEntry = {
  url: string;
  lastModified?: Date;
  changeFrequency?:
    | "always"
    | "hourly"
    | "daily"
    | "weekly"
    | "monthly"
    | "yearly"
    | "never";
  priority?: number;
};

const parsePositiveInt = (value: string | undefined, fallbackValue: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallbackValue;
  return Math.floor(numeric);
};

const parseSitemapDate = (value: string | null | undefined, fallbackValue: Date) => {
  if (!value) return fallbackValue;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallbackValue : parsed;
};

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");

const toIsoDate = (value: Date | undefined) => (value ? value.toISOString() : undefined);

const entryToXml = (entry: SitemapEntry) => {
  const lines = ["  <url>", `    <loc>${escapeXml(entry.url)}</loc>`];

  const lastModified = toIsoDate(entry.lastModified);
  if (lastModified) lines.push(`    <lastmod>${lastModified}</lastmod>`);
  if (entry.changeFrequency) lines.push(`    <changefreq>${entry.changeFrequency}</changefreq>`);
  if (typeof entry.priority === "number") lines.push(`    <priority>${entry.priority.toFixed(2)}</priority>`);

  lines.push("  </url>");
  return lines.join("\n");
};

const buildStaticPages = (siteUrl: string, lastModified: Date): SitemapEntry[] => [
  {
    url: toAbsoluteSitePath(siteUrl, "/"),
    lastModified,
    changeFrequency: "daily",
    priority: 1,
  },
  {
    url: toAbsoluteSitePath(siteUrl, "/katalog"),
    lastModified,
    changeFrequency: "daily",
    priority: 0.95,
  },
  {
    url: toAbsoluteSitePath(siteUrl, buildCatalogCategoryPath(null)),
    lastModified,
    changeFrequency: "daily",
    priority: 0.9,
  },
  {
    url: toAbsoluteSitePath(siteUrl, buildCatalogProducerPath(null)),
    lastModified,
    changeFrequency: "daily",
    priority: 0.9,
  },
  {
    url: toAbsoluteSitePath(siteUrl, "/groups"),
    lastModified,
    changeFrequency: "weekly",
    priority: 0.72,
  },
  {
    url: toAbsoluteSitePath(siteUrl, "/manufacturers"),
    lastModified,
    changeFrequency: "weekly",
    priority: 0.72,
  },
  {
    url: toAbsoluteSitePath(siteUrl, "/inform"),
    lastModified,
    changeFrequency: "weekly",
    priority: 0.7,
  },
];

const pushUniqueEntry = (target: SitemapEntry[], seen: Set<string>, entry: SitemapEntry) => {
  if (seen.has(entry.url)) return false;
  seen.add(entry.url);
  target.push(entry);
  return true;
};

export async function GET() {
  const requestHeaders = await headers();
  const siteUrl = getSiteUrl({ headers: requestHeaders });
  const now = new Date();

  const maxGroupPages = parsePositiveInt(process.env.SITEMAP_MAX_GROUP_PAGES, 6000);
  const maxSubgroupPages = parsePositiveInt(process.env.SITEMAP_MAX_SUBGROUP_PAGES, 30000);
  const maxManufacturerPages = parsePositiveInt(
    process.env.SITEMAP_MAX_MANUFACTURER_PAGES,
    6000
  );

  const entries: SitemapEntry[] = [...buildStaticPages(siteUrl, now)];
  const seenUrls = new Set(entries.map((item) => item.url));

  try {
    const facets = await getCatalogSeoFacets();
    const facetLastModified = parseSitemapDate(facets.generatedAt, now);

    for (const group of facets.groups.slice(0, maxGroupPages)) {
      pushUniqueEntry(entries, seenUrls, {
        url: toAbsoluteSitePath(siteUrl, buildCatalogCategoryPath(group.label)),
        lastModified: facetLastModified,
        changeFrequency: "weekly",
        priority: 0.82,
      });
    }

    let subgroupCount = 0;
    for (const group of facets.groups) {
      if (subgroupCount >= maxSubgroupPages) break;

      for (const subgroup of group.subgroups) {
        if (subgroupCount >= maxSubgroupPages) break;

        const added = pushUniqueEntry(entries, seenUrls, {
          url: toAbsoluteSitePath(siteUrl, buildCatalogCategoryPath(group.label, subgroup.label)),
          lastModified: facetLastModified,
          changeFrequency: "weekly",
          priority: 0.78,
        });

        if (added) subgroupCount += 1;
      }
    }

    for (const producer of facets.producers.slice(0, maxManufacturerPages)) {
      pushUniqueEntry(entries, seenUrls, {
        url: toAbsoluteSitePath(siteUrl, buildCatalogProducerPath(producer.label)),
        lastModified: facetLastModified,
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }
  } catch {
    // keep static entries only
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map(entryToXml),
    "</urlset>",
  ].join("\n");

  return new NextResponse(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
