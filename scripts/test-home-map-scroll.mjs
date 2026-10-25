import assert from "node:assert/strict";

const { chromium } = await import(process.argv[2] || "playwright");
const origin = process.argv[3] || "http://127.0.0.1:3102";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    // Exercise the real mounting policy without depending on Google's network.
    await page.route("**/maps/embed?**", route => route.fulfill({
      contentType: "text/html", body: "<!doctype html><title>Map fixture</title>",
    }));
    await page.addInitScript(() => {
      window.mapScrollCheck = { lastScroll: 0, mounts: [] };
      window.addEventListener("scroll", () => {
        window.mapScrollCheck.lastScroll = performance.now();
      }, { passive: true });
      new MutationObserver(records => {
        for (const record of records) for (const node of record.addedNodes) {
          if (node instanceof HTMLIFrameElement && node.src.includes("/maps/embed?")) {
            window.mapScrollCheck.mounts.push({
              quietMs: performance.now() - window.mapScrollCheck.lastScroll,
              scrolling: document.documentElement.classList.contains("is-scrolling"),
            });
          }
        }
      }).observe(document, { childList: true, subtree: true });
    });
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
    assert.equal(await page.locator(".reveal-adv-map iframe").count(), 0,
      "The map must not load with the top of the homepage");
    const card = page.locator(".reveal-adv-map");
    // Measure layout geometry, excluding the existing entrance scale.
    const before = await card.evaluate(el => el.offsetHeight);
    const start = await card.evaluate(el => el.getBoundingClientRect().top + scrollY - 1600);
    await page.evaluate(y => scrollTo(0, y), start);
    const session = await page.context().newCDPSession(page);
    await session.send("Input.synthesizeScrollGesture", {
      x: width - 20, y: 450, yDistance: -1500, speed: 650, gestureSourceType: "mouse",
    });
    await card.locator("iframe").waitFor({ state: "attached" });
    const photos = page.locator(".home-seo-story-section .home-seo-photo");
    await photos.first().waitFor({ state: "attached" });
    assert.equal(await photos.count(), 3, "The SEO photo scene should remain a small static set");
    const photoTransformsBefore = await photos.evaluateAll(elements =>
      elements.map(el => getComputedStyle(el).transform)
    );
    assert.equal(await photos.evaluateAll(elements =>
      elements.filter(el => el.hasAttribute("data-plx-drift")).length
    ), 0, "SEO photos must not register scroll-linked motion");
    const after = await card.evaluate(el => el.offsetHeight);
    assert.equal(after, before, "Map loading must not resize the card");
    assert.equal(await card.locator("iframe").getAttribute("tabindex"), "-1");
    assert.match(await card.locator('a[target="_blank"]').first().getAttribute("href"), /google\.com\/maps\/place/);
    await page.evaluate(() => scrollBy(0, 100));
    await page.waitForTimeout(500);
    assert.deepEqual(await photos.evaluateAll(elements =>
      elements.map(el => getComputedStyle(el).transform)
    ), photoTransformsBefore, "SEO background photos must stay still while scrolling");
    const { mounts } = await page.evaluate(() => window.mapScrollCheck);
    assert.equal(mounts.length, 1, "Later gestures must keep the already loaded map");
    assert(mounts[0].quietMs >= 300, JSON.stringify(mounts));
    assert.equal(mounts[0].scrolling, false, "Google must not start during an active scroll gesture");
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}px: map mounts once after ${Math.round(mounts[0].quietMs)}ms quiet; stable geometry and route link`);
    await page.close();
  }
} finally {
  await browser.close();
}
