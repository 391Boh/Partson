// Read-only lab measurements. Run against next start, not the dev compiler.
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "./test-browser.mjs";
const origin = process.env.TEST_ORIGIN || "http://localhost:3100";
const output = process.env.PERF_OUTPUT || "output/performance/navigation.json";
const widths = (process.env.PERF_WIDTHS || "390,1440").split(",").map(Number);
const paths = (process.env.PERF_PATHS || "/,/groups,/manufacturers/bosch-2wkr2o,/katalog,/product/filtr-povitryanyy-megane-02-af1912").split(",");
const report = { origin, checkedAt: new Date().toISOString(), pages: [], transitions: [] };
const browser = await chromium.launch({ headless: true });
try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    await context.addCookies(["partson_analytics_consent", "partson_advertising_consent"].map(name => ({ name, value: "denied", url: origin })));
    await context.addInitScript(() => {
      window.performanceProbe = { marker: Math.random(), lcp: 0, cls: 0, longTasks: [] };
      for (const type of ["largest-contentful-paint", "layout-shift", "longtask"]) {
        new PerformanceObserver(list => list.getEntries().forEach(entry => {
          if (type === "largest-contentful-paint") window.performanceProbe.lcp = entry.startTime;
          if (type === "layout-shift" && !entry.hadRecentInput) window.performanceProbe.cls += entry.value;
          if (type === "longtask") window.performanceProbe.longTasks.push(entry.duration);
        })).observe({ type, buffered: true });
      }
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
      if (message.type() === "error" && /hydration|hydrated|server rendered/i.test(message.text())) errors.push(message.text().slice(0, 300));
    });
    for (const path of paths) {
      const start = Date.now();
      const previousErrors = errors.length;
      try {
        const response = await page.goto(origin + path, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.locator("h1:visible").first().waitFor({ timeout: 30000 });
        const contentMs = Date.now() - start;
        await page.waitForFunction(() => document.documentElement.hasAttribute("data-consent-hydrated"), { timeout: 30000 });
        await page.waitForTimeout(1200);
        const metrics = await page.evaluate(() => {
          const nav = performance.getEntriesByType("navigation")[0];
          const resources = performance.getEntriesByType("resource");
          return {
            ttfbMs: Math.round(nav.responseStart), domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
            lcpMs: Math.round(window.performanceProbe.lcp), cls: Number(window.performanceProbe.cls.toFixed(5)),
            longTasks: window.performanceProbe.longTasks.map(Math.round),
            transferBytes: resources.reduce((total, resource) => total + resource.transferSize, nav.transferSize),
            requests: resources.length, h1: document.querySelector("h1")?.textContent.trim(),
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
          };
        });
        const result = { width, path, status: response.status(), contentMs, ...metrics, errors: errors.slice(previousErrors) };
        report.pages.push(result);
        console.log(JSON.stringify(result));
      } catch (error) {
        report.pages.push({ width, path, error: error.message, elapsedMs: Date.now() - start });
        console.log("ERROR", width, path, error.message);
      }
    }
    await page.goto(origin + "/groups", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.hasAttribute("data-consent-hydrated"));
    const category = page.locator('a.group-category-card__link[href="/groups/inshe"]').first();
    if (await category.count()) {
      await category.scrollIntoViewIfNeeded();
      const marker = await page.evaluate(() => window.performanceProbe.marker);
      const start = Date.now();
      await category.click();
      await page.waitForURL("**/groups/inshe");
      await page.locator("h1:visible").first().waitFor();
      report.transitions.push({ width, from: "/groups", to: "/groups/inshe", contentMs: Date.now() - start,
        documentReloaded: await page.evaluate(() => window.performanceProbe.marker) !== marker });
      console.log("TRANSITION", JSON.stringify(report.transitions.at(-1)));
    }
    await context.close();
  }
} finally {
  writeFileSync((mkdirSync(output.slice(0, output.lastIndexOf("/")), { recursive: true }), output), JSON.stringify(report, null, 2) + "\n");
  await browser.close();
}
