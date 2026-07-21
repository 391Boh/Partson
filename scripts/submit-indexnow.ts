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

  const requestedValues = process.argv.slice(2).map((value) => value.trim()).filter(Boolean);
  if (requestedValues.length === 0) {
    throw new Error(
      "Pass at least one canonical path or URL, for example: npm run indexnow:submit -- / /katalog"
    );
  }

  const urlList = Array.from(
    new Set(
      requestedValues.map((value) => {
        const url = new URL(value, `${siteUrl}/`);
        if (url.origin !== siteOrigin) {
          throw new Error(`IndexNow URL must belong to ${siteOrigin}: ${value}`);
        }
        url.hash = "";
        return url.toString();
      })
    )
  );

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
  });

  if (!response.ok) {
    const details = (await response.text()).trim();
    throw new Error(
      `IndexNow returned ${response.status}${details ? `: ${details}` : ""}`
    );
  }

  console.log(`IndexNow accepted ${urlList.length} URL(s) for ${siteOrigin}`);
}

main().catch((error) => {
  console.error("❌ IndexNow submit failed:", error);
  process.exit(1);
});
