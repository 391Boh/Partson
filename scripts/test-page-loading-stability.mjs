import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(process.argv[2] || "./test-browser.mjs");
const origin = process.env.TEST_ORIGIN;
assert(origin, "Set TEST_ORIGIN to a chosen production preview.");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = [];
const failures = [];
try {
  for (const width of [390, 1440]) {
    for (const path of ["/", "/groups", "/inform/delivery", "/inform/location", "/partnership", "/katalog", process.env.TEST_PRODUCT_PATH || "/product/filtr-povitryanyy-megane-02-af1912"]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.addInitScript(() => {
        document.cookie = "partson_analytics_consent=denied; Path=/";
        document.cookie = "partson_advertising_consent=denied; Path=/";
        window.loadingShifts = [];
        new PerformanceObserver(list => list.getEntries().forEach(entry => {
          if (!entry.hadRecentInput) window.loadingShifts.push({ value: entry.value, time: entry.startTime });
        })).observe({ type: "layout-shift", buffered: true });
      });
      // Fonts and photos arrive after the first paint. Their reserved boxes
      // and font-display strategy must keep the already readable page still.
      await page.route("**/*", async route => {
        if (["font", "image"].includes(route.request().resourceType())) await new Promise(resolve => setTimeout(resolve, 800));
        await route.continue().catch(() => {});
      });
      const response = await page.goto(origin + path, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(3500);
      const metrics = await page.evaluate(() => ({
        cls: window.loadingShifts.reduce((sum, entry) => sum + entry.value, 0),
        shifts: window.loadingShifts,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
      }));
      report.push({ width, path, status: response.status(), ...metrics, errors });
      if (response.status() !== 200) failures.push(`${width}/${path}: HTTP ${response.status()}`);
      // Tiny movement within a price label when its number arrives is allowed;
      // article rewraps, appearing actions and moving sections are not.
      if (metrics.cls > 0.001) failures.push(`${width}/${path}: CLS ${metrics.cls}`);
      if (metrics.overflow || errors.length) failures.push(`${width}/${path}: overflow or JavaScript errors ${errors.join(", ")}`);
      console.log(`CHECK ${width}px ${path}: CLS ${metrics.cls.toFixed(6)}`);
      await page.close();
    }
  }
  assert.deepEqual(failures, []);
  console.log("PASS public page loading: delayed fonts/photos, stable content, no overflow or JavaScript errors on phone and desktop.");
} finally {
  await mkdir("output/loading-audit", { recursive: true });
  await writeFile("output/loading-audit/page-loading-regression.json", JSON.stringify(report, null, 2));
  await browser.close();
}
