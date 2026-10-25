import assert from "node:assert/strict";

const { chromium } = await import(process.argv[2] || "playwright");
const origin = process.argv[3] || "http://127.0.0.1:3102";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    // Test eager mounting and geometry independently of Google's network.
    await page.route("**/maps/embed?**", route => route.fulfill({
      contentType: "text/html", body: "<!doctype html><title>Map fixture</title>",
    }));
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    const card = page.locator(".home-story-map");
    const frame = card.locator("iframe");
    assert.equal(await frame.count(), 1, "The official map is present immediately, before scrolling");
    assert.equal(await frame.getAttribute("loading"), "eager");
    assert.equal(new URL(await frame.getAttribute("src")).hostname, "www.google.com");
    assert.equal(await frame.locator("xpath=ancestor::a").count(), 0, "Map controls must remain interactive");
    const before = await card.evaluate(el => el.offsetHeight);
    await page.getByRole("button", { name: "Лише необхідні", exact: true }).click({ timeout: 2000 }).catch(() => {});
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    assert.equal(await card.evaluate(el => el.offsetHeight), before, "Map does not shift layout");
    assert.match(await card.locator(".home-store-route").getAttribute("href"), /google\.com\/maps\/place/);
    assert.equal(await page.locator(".home-popular-nav").count(), 0);
    assert.equal(await page.locator(".home-store-directories a").count(), 3);
    const photos = page.locator(".home-store-gallery img");
    for (const photo of await photos.all()) {
      assert(await photo.evaluate(el => el.complete && el.naturalWidth > 0), "Original shop photo loads");
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.locator(".home-seo-story-section").screenshot({ path: `/tmp/home-store-${width}.png` });
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}px: eager official map, stable layout, shop photographs and directory links`);
    await page.close();
  }
} finally {
  await browser.close();
}
