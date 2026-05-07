import {
  getInformationSitemapEntries,
  getOtherPagesSitemapEntries,
} from "app/lib/sitemap-sections";
import { buildUrlSetXml, createSitemapXmlResponse } from "app/lib/sitemap-xml";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 3600;
export const dynamic = "force-static";

export async function GET() {
  const siteUrl = getSiteUrl();
  const entries = [
    ...(await getOtherPagesSitemapEntries()),
    ...(await getInformationSitemapEntries()),
  ];

  return createSitemapXmlResponse(buildUrlSetXml(siteUrl, entries));
}
