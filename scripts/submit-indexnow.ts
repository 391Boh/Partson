import { readIndexNowUrls } from "./lib/indexnow-input.mjs";

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const MAX_URLS_PER_REQUEST = 10_000;

const normalizeSiteUrl = (raw: string) => {
  const candidate = raw.trim();
  if (!candidate) throw new Error("SITE_URL or NEXT_PUBLIC_SITE_URL is required");
  const value = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
  const parsed = new URL(value);
  return parsed.toString().replace(/\/+$/, "");
};

async function main() {
  const siteUrl = normalizeSiteUrl(
    process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || ""
  );
  const siteOrigin = new URL(siteUrl).origin;
  const key = (process.env.INDEXNOW_KEY || "").trim();

  if (!/^[A-Za-z0-9-]{8,128}$/.test(key)) {
    throw new Error(
      "INDEXNOW_KEY must contain 8–128 letters, numbers, or dashes"
    );
  }

  const urlList = await readIndexNowUrls(process.argv.slice(2), siteUrl);

  if (urlList.length > MAX_URLS_PER_REQUEST) {
    throw new Error(`IndexNow accepts at most ${MAX_URLS_PER_REQUEST} URLs per request`);
  }

  const response = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      host: new URL(siteUrl).host,
      key,
      keyLocation: `${siteUrl}/indexnow-key.txt`,
      urlList,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const details = (await response.text()).trim();
    throw new Error(
      `IndexNow returned ${response.status}${details ? `: ${details}` : ""}`
    );
  }

  console.log(`IndexNow ${response.status}: ${urlList.length} URL(s) submitted for ${siteOrigin}${response.status === 202 ? " (key verification pending)" : ""}. This is not an indexing confirmation.`);
}

main().catch((error) => {
  console.error("❌ IndexNow submit failed:", error);
  process.exit(1);
});
