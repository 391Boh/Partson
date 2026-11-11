import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(process.argv[2] || "./test-browser.mjs");
const origin = process.env.TEST_ORIGIN;
assert(origin, "Set TEST_ORIGIN to a local preview.");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = [];
const failures = [];
try {
  for (const width of (process.env.TEST_WIDTHS || "320,390,640,767,1440").split(",").map(Number)) {
    const page = await browser.newPage({ viewport: { width, height: 950 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/proxy?**", route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("endpoint") !== "getprod") return route.continue();
      return route.fulfill({ json: Array.from({ length: 16 }, (_, index) => ({
        name: `Категорія деталей ${index + 1}`,
        children: [{ name: `Підгрупа деталей ${index + 1}`, children: [] }],
      })) });
    });
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Лише необхідні", exact: true }).click({ timeout: 1500 }).catch(() => {});
    await page.evaluate(async () => { await document.fonts.ready; });
    for (const [kind, label, query] of [
      ["auto", "Пошук марки", "BMW"],
      ["product", "Пошук категорії", "Категорія деталей 16"],
      ["brands", "Пошук виробника", "4MAX"],
    ]) {
      const slot = page.locator(`.home-slot-${kind}`);
      await slot.scrollIntoViewIfNeeded();
      await slot.locator(".home-deferred-content.is-ready").waitFor();
      await slot.locator(".home-picker-track-shell").first().waitFor();
      await slot.evaluate(async element => {
        const entrances = element.getAnimations({ subtree: true }).filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity);
        await Promise.race([Promise.allSettled(entrances.map(animation => animation.finished)), new Promise(resolve => setTimeout(resolve, 2200))]);
      });
      await page.waitForTimeout(100);
      const geometry = () => slot.evaluate(element => {
        const shell = element.querySelector(".home-picker-track-shell");
        const search = element.querySelector(".home-picker-search-slot");
        const bounds = shell.getBoundingClientRect();
        return { top: bounds.top + scrollY, height: bounds.height, searchHeight: search.getBoundingClientRect().height };
      });
      const initial = await geometry();
      // Sample every animation frame: checking only the final geometry misses
      // the zero-height gap between an exiting button and the incoming field.
      await slot.evaluate(element => {
        window.pickerSamples = [];
        window.pickerSampling = true;
        const sample = () => {
          if (!window.pickerSampling) return;
          const shell = element.querySelector(".home-picker-track-shell");
          const rect = shell?.getBoundingClientRect();
          window.pickerSamples.push(rect ? { top: rect.top + scrollY, height: rect.height } : null);
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      await slot.getByRole("button", { name: label, exact: true }).click();
      const input = slot.getByRole("textbox").first();
      await input.waitFor();
      assert(await input.evaluate(element => document.activeElement === element), `${kind}: immediate input focus`);
      await page.waitForTimeout(600);
      const opened = await geometry();
      await input.fill(query);
      await page.waitForTimeout(650);
      const short = await geometry();
      await input.fill("zzzz-no-matching-result");
      await slot.locator(".home-picker-track-shell").getByText(kind === "auto" ? "За цим запитом марок не знайдено." : kind === "brands" ? "За цим запитом виробників не знайдено." : "Нічого не знайдено", { exact: true }).waitFor();
      await page.waitForTimeout(600);
      assert(await input.isVisible(), `${kind}: empty results keep the input mounted`);
      assert.equal(await input.inputValue(), "zzzz-no-matching-result");
      const empty = await geometry();
      await input.fill("");
      await page.waitForTimeout(600);
      const restored = await geometry();
      const samples = await page.evaluate(() => { window.pickerSampling = false; return window.pickerSamples; });
      report.push({ width, kind, initial, opened, short, empty, restored, samples: samples.length });
      for (const [state, actual] of Object.entries({ opened, short, empty, restored })) {
        if (Math.abs(initial.top - actual.top) > 1) failures.push(`${width}/${kind}/${state}: list top moved ${actual.top - initial.top}px`);
        if (Math.abs(initial.height - actual.height) > 1) failures.push(`${width}/${kind}/${state}: list height changed ${actual.height - initial.height}px`);
        if (Math.abs(initial.searchHeight - actual.searchHeight) > 1) failures.push(`${width}/${kind}/${state}: search height changed`);
      }
      if (!samples.every(sample => sample && Math.abs(sample.top - initial.top) <= 1 && Math.abs(sample.height - initial.height) <= 1)) failures.push(`${width}/${kind}: transient layout shift`);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}/${kind}: page overflow`);
      console.log(`CHECK ${width}px ${kind}: search, short/empty lists and recovery`);
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  assert.deepEqual(failures, []);
  console.log("PASS picker layout: frame-by-frame search, short/empty lists and recovery.");
} finally {
  await mkdir("output/loading-audit", { recursive: true });
  await writeFile("output/loading-audit/picker-layout.json", JSON.stringify(report, null, 2));
  await browser.close();
}
