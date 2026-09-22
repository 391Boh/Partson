// Requires Playwright (or PLAYWRIGHT_MODULE pointing to its installed entry).
// Run against a local dev server: node scripts/test-header-search.mjs
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const base = process.env.SEARCH_TEST_URL || "http://localhost:3000";
const requests = [];
let unavailable = false;
const items = [{ code: "SEARCH-TEST-001", article: "OC90", name: "Фільтр OC90 тест пошуку", producer: "KNECHT", quantity: 5, priceEuro: 10 }];
await page.route("**/api/catalog-page", async (route) => {
  const body = route.request().postDataJSON();
  requests.push(body);
  if (body.searchQuery === "slow-query") await new Promise((resolve) => setTimeout(resolve, 900));
  await route.fulfill({ status: unavailable ? 503 : 200, contentType: "application/json", body: JSON.stringify(
    unavailable ? { serviceUnavailable: true } : {
      items: body.searchQuery === "slow-query" ? [{ ...items[0], name: "STALE RESULT" }] : items,
      totalCount: 1, hasMore: false, nextCursor: "",
      ...(body.searchQuery === "щс90" ? { correctedQuery: "oc90" } : {}),
    }
  ) }).catch(() => {});
});
try {
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const input = page.getByRole("combobox", { name: "Пошук товарів" });
  await input.waitFor({ timeout: 45_000 });
  await input.fill("slow-query");
  await page.waitForRequest((r) => r.url().includes("/api/catalog-page") && r.postDataJSON()?.searchQuery === "slow-query");
  await input.fill("OC90");
  await page.getByRole("option").filter({ hasText: "Фільтр OC90" }).waitFor();
  await page.waitForTimeout(1000);
  assert.equal(await page.getByText("STALE RESULT").count(), 0);
  await input.press("ArrowDown");
  assert.equal(await page.getByRole("option").first().getAttribute("aria-selected"), "true");
  await input.press("Escape");
  assert.equal(await input.getAttribute("aria-expanded"), "false");

  await page.getByRole("button", { name: "Фільтр пошуку", exact: true }).click();
  await page.getByRole("button", { name: "Артикул", exact: true }).click();
  await page.getByRole("option").waitFor();
  assert.equal(requests.at(-1).searchFilter, "article");

  unavailable = true;
  await input.fill("temporary-failure");
  await page.getByRole("button", { name: "Повторити пошук" }).waitFor();
  assert.equal(await page.getByText("Товарів за цим запитом немає", { exact: true }).count(), 0);
  unavailable = false;
  await page.getByRole("button", { name: "Повторити пошук" }).click();
  await page.getByRole("option").waitFor();

  await input.fill("щс90");
  await page.getByText("Пошук за запитом:").waitFor();
  await page.getByRole("button", { name: /Показати всі результати/ }).click();
  await page.waitForURL((url) => url.pathname === "/katalog" && url.searchParams.get("search") === "щс90", { timeout: 60_000 });
  assert.equal(new URL(page.url()).searchParams.get("filter"), "article");
  await page.getByText("Фільтр OC90 тест пошуку", { exact: true }).first().waitFor({ timeout: 45_000 });
  await page.getByRole("status").filter({ hasText: "Показуємо результати для «oc90»" }).waitFor();
  await page.screenshot({ path: "/tmp/partson-search-catalog.png", fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByRole("button", { name: "Пошук", exact: true }).click();
  const mobileInput = page.getByRole("combobox", { name: "Пошук товарів" });
  await mobileInput.fill("щс90");
  await page.getByRole("option").waitFor();
  const bounds = await page.getByRole("listbox").boundingBox();
  assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390, "Mobile suggestions overflow the screen");
  await page.screenshot({ path: "/tmp/partson-search-mobile.png" });
  console.log("Desktop and mobile header browser checks passed: stale responses, keyboard, article filter, service errors/retry, corrected query and catalog navigation.");
} finally {
  await browser.close();
}
