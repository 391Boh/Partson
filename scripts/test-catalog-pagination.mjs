// Local browser regression: PLAYWRIGHT_MODULE=... node scripts/test-catalog-pagination.mjs
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || process.argv[2] || "playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const count = 157;
let requests = 0;
let failPage = false;
await page.route("**/api/catalog-page", async (route) => {
  requests++;
  const body = route.request().postDataJSON();
  if (body.directPage) {
    await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ directPageUnsupported: true }) });
    return;
  }
  const start = Number(body.cursor) || (body.page - 1) * body.limit;
  if (failPage && start === 48) {
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ serviceUnavailable: true, message: "Тестова помилка сторінки" }) });
    return;
  }
  const end = Math.min(count, start + body.limit);
  await route.fulfill({ contentType: "application/json", body: JSON.stringify({
    items: Array.from({ length: end - start }, (_, i) => ({
      code: `PAGE-${String(start + i + 1).padStart(4, "0")}`,
      article: `TEST-${start + i + 1}`, name: `Тест пагінації ${start + i + 1}`,
      producer: "TEST", quantity: 3, priceEuro: 10, hasPhoto: false,
    })),
    totalCount: count, hasMore: end < count, nextCursor: end < count ? String(end) : "",
  }) });
});
await page.route("**/api/catalog-search-count?**", (route) => route.fulfill({
  contentType: "application/json", body: JSON.stringify({ totalCount: count, exact: true }),
}));
try {
  const base = process.env.SEARCH_TEST_URL || "http://localhost:3000";
  await page.goto(`${base}/katalog?search=pagination-regression&reset=search`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const pager = page.getByRole("group", { name: "Перемикання сторінок каталогу" });
  await pager.locator('button[data-page="10"]').waitFor({ timeout: 45_000 });
  // Let the normal two-page prefetch populate the cache: this reproduces the
  // fast continuation that the old 45ms cooldown silently rejected.
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    window.__pagerDisappeared = false;
    const nav = document.querySelector('[aria-label="Перемикання сторінок каталогу"]');
    new MutationObserver(() => {
      if (!nav.querySelector("button[data-page]")) window.__pagerDisappeared = true;
    }).observe(nav, { subtree: true, childList: true });
  });
  await pager.locator('button[data-page="10"]').click();
  await pager.locator('button[data-page="10"][aria-current="page"]').waitFor({ timeout: 30_000 });
  await page.getByText("Тест пагінації 157", { exact: true }).first().waitFor();
  assert.equal(await page.evaluate(() => window.__pagerDisappeared), false, "Page numbers blinked away during loading");
  assert.equal(new URL(page.url()).searchParams.get("page"), "10");
  const beforeBack = requests;
  await pager.getByRole("button", { name: "Попередня сторінка" }).click();
  await pager.locator('button[data-page="9"][aria-current="page"]').waitFor();
  await page.getByText("Тест пагінації 129", { exact: true }).first().waitFor();
  assert.equal(requests, beforeBack, "A cached previous page was fetched again");

  // A larger display page starts with only 16 items loaded after a new query.
  // The final page must wait for enough actual products, not a guessed number
  // of requests based on ceil(loaded / displayPageSize).
  await page.getByLabel("На сторінці").selectOption("48");
  await page.goto(`${base}/katalog?search=pagination-regression-two`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByLabel("На сторінці").selectOption("48");
  await pager.locator('button[data-page="4"]').waitFor();
  await pager.locator('button[data-page="4"]').click();
  await pager.locator('button[data-page="4"][aria-current="page"]').waitFor({ timeout: 30_000 });
  await page.getByText("Тест пагінації 157", { exact: true }).first().waitFor();
  await page.screenshot({ path: "/tmp/partson-last-page.png" });
  failPage = true;
  await page.goto(`${base}/katalog?search=pagination-retry&reset=search`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByLabel("На сторінці").selectOption("16");
  await pager.locator('button[data-page="10"]').waitFor();
  await pager.locator('button[data-page="10"]').click();
  await page.getByText("Тестова помилка сторінки", { exact: true }).waitFor({ timeout: 30_000 });
  failPage = false;
  await pager.locator('button[data-page="10"]').click();
  await pager.locator('button[data-page="10"][aria-current="page"]').waitFor({ timeout: 30_000 });
  await page.getByText("Тест пагінації 157", { exact: true }).first().waitFor();
  console.log("Pagination browser checks passed: cached jump to last page, stable buttons, back navigation 48-item pages and recovery after a server error.");
} finally {
  await browser.close();
}
