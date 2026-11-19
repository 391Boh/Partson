// Read-only smoke check against an explicitly selected local/preview server.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
const { chromium } = await import(process.argv[2] || "./test-browser.mjs");
const base = process.env.TEST_ORIGIN || process.env.TEST_BASE_URL || "http://localhost:3000";
const browser = await chromium.launch({ headless: true });
const output = "output/seo/content-layout";
mkdirSync(output, { recursive: true });
const findings = [];
try {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  await context.addCookies(["partson_analytics_consent", "partson_advertising_consent"].map(name => ({ name, value: "denied", url: base })));
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  const routes = [
    ["root", "/groups/inshe"],
    ["fresheners", "/groups/inshe/osvizhuvachi-povitrya"],
    ["tools", "/groups/inshe/ruchnyy-instrument"],
    ["product", "/product/osvizhuvach-povitrya-areon-fresh-wave-ocean-fw06"],
  ];
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    for (const [name, route] of routes) {
      const response = await page.goto(new URL(route, base).href, { waitUntil: "domcontentloaded", timeout: 60000 });
      assert.equal(response.status(), 200, `${route} response`);
      // Streaming can briefly retain hidden copies of a pending boundary.
      const section = page.locator(name === "product" ? ".product-faq-list:visible" : ".directory-guide:visible");
      await section.waitFor();
      await section.scrollIntoViewIfNeeded();
      await page.evaluate(() => document.fonts.ready);
      const data = await page.evaluate(() => {
        const guide = [...document.querySelectorAll(".directory-guide,.product-faq-list")].find(x => x.getClientRects().length);
        return {
          title: document.title,
          h1: [...document.querySelectorAll("h1")].filter(x => x.getClientRects().length).map(x => x.textContent.trim()),
          canonical: document.querySelector('link[rel="canonical"]')?.href,
          robots: document.querySelector('meta[name="robots"]')?.content,
          scrollWidth: document.documentElement.scrollWidth,
          text: guide.textContent.trim(),
          overflow: [guide, ...guide.querySelectorAll("p,h2,h3,a")].filter(x => x.scrollWidth > x.clientWidth + 2).map(x => x.tagName),
          fontSize: getComputedStyle(guide.querySelector("p")).fontSize,
          links: [...guide.querySelectorAll("a")].map(x => ({ href: x.getAttribute("href"), height: x.getBoundingClientRect().height })),
          description: document.querySelector('meta[name="description"]')?.content,
          overviewText: document.querySelector(".product-overview-description")?.textContent,
        };
      });
      assert.equal(data.h1.length, 1);
      assert(data.scrollWidth <= width + 1, `${route} horizontal fit`);
      assert.equal(data.overflow.length, 0, `${route} text fit`);
      assert(Number.parseFloat(data.fontSize) >= 14);
      assert(data.canonical?.endsWith(route));
      assert(!data.robots?.includes("noindex"));
      assert(!data.text.includes("VIN"), `${route} relevant selection advice`);
      if (name === "product") {
        assert(!data.description.includes("VIN"));
        assert(!data.description.includes("для Areon"));
        assert(data.overviewText.includes("комплектацію") && !data.overviewText.includes("VIN"));
        const summary = section.locator("summary").nth(1);
        await summary.focus();
        await page.keyboard.press("Enter");
        assert(await section.locator("details").nth(1).getAttribute("open") !== null, "FAQ works with a keyboard without custom JavaScript");
      } else {
        assert(data.links.every(x => x.height >= 44), "Related links have 44px touch targets");
        await section.locator("a").first().focus();
        assert.notEqual(await section.locator("a").first().evaluate(x => getComputedStyle(x).outlineStyle), "none");
      }
      await section.screenshot({ path: `${output}/${name}-${width}.png` });
      findings.push({ name, route, width, ...data });
      console.log("PASS SEO content layout", name, width);
    }
  }
  writeFileSync(`${output}/measurements.json`, JSON.stringify(findings, null, 2) + "\n");
  await context.close();
} finally {
  await browser.close();
}
