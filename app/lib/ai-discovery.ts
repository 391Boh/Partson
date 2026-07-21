import "server-only";

import { getSiteUrl } from "app/lib/site-url";

const normalizeSiteUrl = () => getSiteUrl().replace(/\/+$/, "");

export const getAiDiscoverySiteUrl = normalizeSiteUrl;

export const createAiTextResponse = (content: string) =>
  new Response(`${content.trim()}\n`, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
    },
  });
