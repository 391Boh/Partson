// Prints the canonical URLs whose sitemap <lastmod> is newer than --hours
// (default 26), read from the live sitemaps, one per line — input for
// `npm run indexnow:submit -- --file`. Reading the published sitemaps keeps
// the list identical to what the site itself declares as canonical.
const args = process.argv.slice(2);
const hoursIndex = args.indexOf("--hours");
const hours = hoursIndex >= 0 ? Number(args[hoursIndex + 1]) : 26;
if (!Number.isFinite(hours) || hours <= 0) throw new Error("--hours must be a positive number");
const site = (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://partson.shop").replace(/\/+$/, "");
const since = Date.now() - hours * 3600_000;

const fetchText = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000), headers: { "user-agent": "PartsON-IndexNow/1.0" } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
};
const blocks = (xml, tag) => [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"))].map((match) => match[1]);
const field = (block, tag) => (block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`)) || [])[1]?.trim() || "";
const decode = (value) => value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");

const index = await fetchText(`${site}/sitemap.xml`);
const urls = new Set();
for (const sitemap of blocks(index, "sitemap")) {
  const loc = decode(field(sitemap, "loc"));
  const lastmod = Date.parse(field(sitemap, "lastmod"));
  // The index lastmod is the newest change inside a sitemap: skip unchanged ones.
  if (!loc || (Number.isFinite(lastmod) && lastmod < since)) continue;
  for (const url of blocks(await fetchText(loc), "url")) {
    const changed = Date.parse(field(url, "lastmod"));
    if (Number.isFinite(changed) && changed >= since) urls.add(decode(field(url, "loc")));
  }
}
process.stdout.write([...urls].join("\n") + (urls.size ? "\n" : ""));
console.error(`${urls.size} URL(s) changed in the last ${hours} h`);
