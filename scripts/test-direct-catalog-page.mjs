// Direct navigation regression: node scripts/test-direct-catalog-page.mjs [playwright module]
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || process.argv[2] || "playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const total = 10107;
const requests = [];
let failDirect = false;
await page.route("**/api/catalog-page", async (route) => {
  const body = route.request().postDataJSON();
  requests.push(body);
  if (body.directPage && failDirect) {
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ serviceUnavailable: true }) });
    return;
  }
  const offset = body.directPage ? body.offset : Number(body.cursor) || (body.page - 1) * body.limit;
  const end = Math.min(total, offset + body.limit);
  await route.fulfill({ contentType: "application/json", body: JSON.stringify({
    items: Array.from({ length: end - offset }, (_, i) => ({
      code: `DIRECT-${offset + i + 1}`, article: `TEST-${offset + i + 1}`,
      name: `Пряма сторінка ${offset + i + 1}`, producer: "TEST", priceEuro: 10, quantity: 1, hasPhoto: false,
    })),
    totalCount: total, hasMore: end < total, nextCursor: end < total ? String(end) : "",
    ...(body.directPage ? { directOffset: offset } : {}),
  }) });
});
await page.route("**/api/catalog-search-count?**", (route) => route.fulfill({
  contentType: "application/json", body: JSON.stringify({ totalCount: total, exact: true }),
}));
try {
  await page.goto(`${process.env.SEARCH_TEST_URL || "http://localhost:3000"}/katalog?search=direct-page-test&reset=search`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const pager = page.getByRole("group", { name: "Перемикання сторінок каталогу" });
  await pager.locator('button[data-page="632"]').waitFor({ timeout: 45_000 });
  await page.waitForTimeout(1000);
  const before = requests.length;
  await pager.locator('button[data-page="632"]').click();
  await pager.locator('button[data-page="632"][aria-current="page"]').waitFor();
  await page.getByText("Пряма сторінка 10107", { exact: true }).first().waitFor();
  const jumpRequests = requests.slice(before);
  assert.equal(jumpRequests.length, 1, "Jump loaded intermediate pages");
  assert.equal(jumpRequests[0].offset, 10096);
  assert.equal(jumpRequests[0].limit, 16);
  assert.equal(await page.locator('[data-catalog-card="1"]').count(), 11);

  await pager.getByRole("button", { name: "Попередня сторінка" }).click();
  await pager.locator('button[data-page="631"][aria-current="page"]').waitFor();
  await page.getByText("Пряма сторінка 10081", { exact: true }).first().waitFor();
  assert.equal(requests.at(-1).offset, 10080);
  failDirect = true;
  await pager.locator('button[data-page="632"]').click();
  await page.getByText("Не вдалося відкрити сторінку. Спробуйте ще раз.", { exact: true }).waitFor();
  assert.equal(await pager.locator('[aria-current="page"]').textContent(), "631");
  failDirect = false;
  await pager.locator('button[data-page="632"]').click();
  await page.getByText("Пряма сторінка 10107", { exact: true }).first().waitFor();
  await pager.locator('button[data-page="1"]').click();
  await page.getByText("Пряма сторінка 1", { exact: true }).first().waitFor();
  assert.equal(requests.at(-1).offset, 0);
  await page.getByLabel("На сторінці").selectOption("48");
  await pager.locator('button[data-page="211"]').waitFor();
  await pager.locator('button[data-page="211"]').click();
  await page.getByText("Пряма сторінка 10107", { exact: true }).first().waitFor();
  assert.equal(requests.at(-1).offset, 10080);
  assert.equal(await page.locator('[data-catalog-card="1"]').count(), 27);
  console.log("Direct pagination passed: page 632 in one request, only 11 items, previous/first page, failure retry and 48-item pages.");
} finally {
  await browser.close();
}
