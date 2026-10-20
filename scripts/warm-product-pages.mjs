#!/usr/bin/env node
// Every release starts with an empty ISR cache, so the first request for each
// product page renders from scratch: 1-2.4 s to the first byte on production
// against ~0.2 s for a cached one, and the hero photo (/product-image, fetched
// from 1C on a miss) adds another ~1.2 s to LCP. Googlebot is usually that
// first visitor. This walks the product sitemaps after a deploy and requests
// each page and its sitemap image once, so crawlers and buyers get cache hits.
//
//   node scripts/warm-product-pages.mjs [--base=https://partson.shop]
//     [--concurrency=3] [--limit=0] [--no-images]
//
// Concurrency stays low on purpose: each miss queries 1C, which is slower and
// less stable under parallel load than the site itself.

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=");
    return [key, value];
  })
);

const base = (args.base || process.env.SITE_URL || "https://partson.shop").replace(/\/+$/, "");
const concurrency = Math.max(1, Number(args.concurrency) || 3);
const limit = Math.max(0, Number(args.limit) || 0);
const warmImages = args["no-images"] !== "true";
const REQUEST_TIMEOUT_MS = 20000;
const headers = { "user-agent": "PartsON-cache-warmer/1.0", accept: "text/html,*/*" };

const decodeXml = (value) =>
  value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');

const fetchText = async (url) => {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
};

// Each product <url> carries its page and, when it has one, the photo URL the
// page itself renders as the hero image.
const readProductEntries = async () => {
  const index = await fetchText(`${base}/sitemap.xml`);
  const sitemapUrls = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => decodeXml(match[1]))
    .filter((url) => /\/product\/sitemap\/\d+\.xml$/.test(url));

  const entries = [];
  for (const sitemapUrl of sitemapUrls) {
    const xml = await fetchText(sitemapUrl);
    for (const block of xml.split("<url>").slice(1)) {
      const page = block.match(/<loc>([^<]+)<\/loc>/);
      const image = block.match(/<image:loc>([^<]+)<\/image:loc>/);
      if (page) entries.push({ page: decodeXml(page[1]), image: image ? decodeXml(image[1]) : "" });
    }
  }
  return limit > 0 ? entries.slice(0, limit) : entries;
};

const RETRY_DELAY_MS = 2500;

// A cold /product-image or page can answer 503 while 1C is slow under load;
// one delayed retry usually lands it in the cache.
const warm = async (url) => {
  const first = await warmOnce(url);
  if (first.status !== 0 && first.status < 500) return first;
  await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  return { ...(await warmOnce(url)), retried: true };
};

const warmOnce = async (url) => {
  const startedAt = performance.now();
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    const ttfb = performance.now() - startedAt;
    await response.arrayBuffer();
    return { status: response.status, cache: response.headers.get("x-nextjs-cache") || "-", ttfb };
  } catch (error) {
    return { status: 0, cache: "ERR", ttfb: performance.now() - startedAt, error: String(error?.message || error) };
  }
};

const percentile = (values, p) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

const main = async () => {
  const entries = await readProductEntries();
  console.log(`Warming ${entries.length} product pages on ${base} (concurrency ${concurrency}${warmImages ? ", with images" : ""})`);

  const pageResults = [];
  const imageResults = [];
  const failures = [];
  let next = 0;
  let done = 0;

  const worker = async () => {
    while (next < entries.length) {
      const entry = entries[next++];
      const page = await warm(entry.page);
      pageResults.push(page);
      if (page.status !== 200) failures.push(`${page.status || page.error} ${entry.page}`);
      if (warmImages && entry.image) {
        const image = await warm(entry.image);
        imageResults.push(image);
        if (image.status !== 200 && image.status !== 404) failures.push(`image ${image.status || image.error} ${entry.image}`);
      }
      done += 1;
      if (done % 100 === 0 || done === entries.length) {
        console.log(`  ${done}/${entries.length}`);
      }
    }
  };

  const startedAt = performance.now();
  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, worker));

  const byCache = pageResults.reduce((counts, result) => {
    counts[result.cache] = (counts[result.cache] || 0) + 1;
    return counts;
  }, {});
  const ttfbs = pageResults.map((result) => result.ttfb);
  console.log(`Done in ${Math.round((performance.now() - startedAt) / 1000)} s`);
  const retried = [...pageResults, ...imageResults].filter((result) => result.retried).length;
  if (retried > 0) console.log(`Retried after 5xx/timeout: ${retried}`);
  console.log(`Pages: ${JSON.stringify(byCache)} · TTFB p50 ${Math.round(percentile(ttfbs, 50))} ms, p90 ${Math.round(percentile(ttfbs, 90))} ms`);
  if (warmImages) {
    const imageTimes = imageResults.map((result) => result.ttfb);
    console.log(`Images: ${imageResults.length} · TTFB p50 ${Math.round(percentile(imageTimes, 50))} ms, p90 ${Math.round(percentile(imageTimes, 90))} ms`);
  }
  if (failures.length > 0) {
    console.log(`Failures (${failures.length}):`);
    for (const failure of failures.slice(0, 30)) console.log(`  ${failure}`);
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
