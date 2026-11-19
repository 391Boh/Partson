import assert from "node:assert/strict";
import http from "node:http";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { build, stop } from "esbuild";
const { chromium } = await import(process.argv[2] || "./test-browser.mjs");

const bundle = await build({
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React from 'react';import{createRoot}from'react-dom/client';
    import Map from './app/components/StoreLocationMap';import Tour from './app/components/StoreVirtualTour';
    import{STORE_TOUR_EMBED_URL,STORE_TOUR_URL}from'./app/lib/store-virtual-tour';
    createRoot(document.getElementById('root')).render(<main className="home-static"><img src="/pending.png" width="1" height="1" alt=""/><div style={{height:2400}}/><section className="home-store-editorial"><Map src="https://www.google.com/maps/embed?fixture=map"/><div style={{height:1500}}/><Tour embedUrl={STORE_TOUR_EMBED_URL} tourUrl={STORE_TOUR_URL}/></section><div style={{height:900}}/></main>);
  ` },
  bundle: true, write: false, platform: "browser", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
});
const server = http.createServer((request, response) => {
  if (request.url === "/pending.png") return; // window.load stays pending.
  if (request.url === "/bundle.js") { response.setHeader("content-type", "text/javascript"); response.end(bundle.outputFiles[0].contents); return; }
  if (request.url === "/style.css") { response.setHeader("content-type", "text/css"); response.end(readFileSync("public/styles/dev-site.css")); return; }
  const asset = path.join(process.cwd(), "public", new URL(request.url, "http://fixture").pathname);
  if (existsSync(asset) && /\.(webp|woff2)$/.test(asset)) { response.setHeader("content-type", asset.endsWith("woff2") ? "font/woff2" : "image/webp"); response.end(readFileSync(asset)); return; }
  response.setHeader("content-type", "text/html"); response.end('<!doctype html><html lang="uk"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script></html>');
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = [];
async function setup(width, options = {}) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce", hasTouch: Boolean(options.touch), isMobile: Boolean(options.touch) });
  if (options.clock) await page.clock.install();
  await page.addInitScript(({ saveData, noObserver }) => {
    if (saveData) Object.defineProperty(navigator, "connection", { configurable: true, value: { saveData: true, effectiveType: "4g" } });
    if (noObserver) delete window.IntersectionObserver;
  }, options);
  const requests = [];
  const held = [];
  await page.route("https://www.google.com/maps/embed?**", route => {
    const type = route.request().url().includes("fixture=map") ? "map" : "tour";
    requests.push({ type, time: Date.now(), url: route.request().url() });
    if (options.holdFirst && requests.filter(request => request.type === type).length === 1) { held.push(route); return; }
    return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="uk"><body style="margin:0;background:#d9eadd">Google iframe fixture</body></html>' });
  });
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Показати карту", exact: true }).waitFor();
  return { page, requests, held, count: type => requests.filter(request => request.type === type).length };
}
const scrollBefore = (locator, distance) => locator.evaluate((element, distance) => scrollTo({ top: element.getBoundingClientRect().top + scrollY - innerHeight - distance, behavior: "instant" }), distance);
const height = locator => locator.evaluate(element => element.getBoundingClientRect().height);
try {
  for (const width of [320, 390, 1440]) {
    const { page, requests, count } = await setup(width);
    const map = page.locator(".home-store-map-frame");
    const tour = page.locator(".home-store-tour-frame");
    await page.waitForTimeout(300);
    assert.equal(requests.length, 0, "Distant embeds do not load at startup");
    assert.equal(await page.locator('link[rel="preconnect"][href*="google"]').count(), 0, "Distant connections do not compete with startup");
    await scrollBefore(map, 600);
    await page.waitForFunction(() => document.querySelector('link[rel="preconnect"][href="https://www.google.com"]'));
    for (const host of ["www.google.com", "maps.gstatic.com", "maps.googleapis.com"]) assert.equal(await page.locator(`link[rel="preconnect"][href="https://${host}"]`).count(), 1, `Warm ${host} once`);
    assert.equal(count("map"), 0, "Connections warm before the iframe starts");
    const mapHeight = await height(map);
    await page.evaluate(() => document.documentElement.classList.add("is-scrolling"));
    const started = Date.now();
    await scrollBefore(map, 180);
    await page.locator(".is-map-loaded").waitFor({ timeout: 1500 });
    const mapDelay = requests.find(request => request.type === "map").time - started;
    assert.equal(count("map"), 1, "Map starts during continuous scrolling before it enters the viewport");
    assert.equal(await page.evaluate(() => document.readyState), "interactive", "A stalled image never holds the map");
    assert.equal(await height(map), mapHeight);
    await page.evaluate(() => document.documentElement.classList.remove("is-scrolling"));
    await tour.scrollIntoViewIfNeeded();
    await page.waitForTimeout(350);
    assert.equal(count("tour"), 0, "Merely viewing the tour never loads its scripts");
    const start = page.getByRole("button", { name: "Розпочати тур 360°", exact: true });
    await start.focus();
    await start.hover();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    assert.equal(count("tour"), 0, "Passing pointers and keyboard focus do not start a panorama");
    await start.hover();
    await page.waitForFunction(() => document.querySelector(".home-store-tour.is-tour-loaded"), null, { timeout: 2000 });
    await page.mouse.move(0, 0);
    assert.equal(count("tour"), 1, "Sustained intent prepares exactly one iframe");
    const tourHeight = await height(tour);
    await start.click();
    await page.waitForFunction(() => document.activeElement?.tagName === "IFRAME");
    assert.equal(await tour.locator("iframe").getAttribute("tabindex"), "0");
    assert.equal(count("tour"), 1, "Activation reuses the prepared iframe");
    assert.equal(await height(tour), tourHeight);
    assert((await tour.locator("iframe").getAttribute("src")).includes("CAoSHENJQUJJaERweU82YUFqUGxzLVlzYjl1U2lUTm0%3D"), "Preserve the owner's full panorama identifier");
    await page.getByRole("button", { name: "Завершити огляд", exact: true }).click();
    assert.equal(await tour.locator("iframe").count(), 0, "Finishing releases the Google document and its running scripts");
    await page.waitForTimeout(350);
    assert.equal(count("tour"), 1, "Restoring focus after finishing does not reload the panorama");
    assert.equal(await height(tour), tourHeight);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    report.push({ width, mapDelayMs: mapDelay, mapHeight, tourHeight, idleTourRequests: 0 });
    console.log(`CHECK ${width}px: early map, deliberate tour intent, stable frames and released panorama`);
    await page.close();
  }

  const slow = await setup(390, { saveData: true, touch: true });
  const slowMap = slow.page.locator(".home-store-map-frame");
  await scrollBefore(slowMap, 180); await slow.page.waitForTimeout(200);
  assert.equal(slow.requests.length, 0, "Save-Data prevents offscreen loading");
  await slowMap.scrollIntoViewIfNeeded(); await slow.page.locator(".is-map-loaded").waitFor();
  await slow.page.locator(".home-store-tour-frame").scrollIntoViewIfNeeded();
  const slowStart = slow.page.getByRole("button", { name: "Розпочати тур 360°", exact: true });
  await slowStart.hover(); await slow.page.waitForTimeout(350);
  assert.equal(slow.count("tour"), 0, "Save-Data disables speculative hover loading");
  await slowStart.tap(); await slow.page.locator(".is-tour-loaded").waitFor();
  assert.equal(slow.count("tour"), 1, "Explicit activation still works on a constrained connection");
  await slow.page.close();

  const failed = await setup(390, { holdFirst: true, clock: true });
  const failedMap = failed.page.locator(".home-store-map-frame");
  await failedMap.scrollIntoViewIfNeeded(); await failedMap.locator("iframe").waitFor();
  await failed.page.clock.fastForward(16_000);
  await failedMap.getByText("Не вдалося завантажити карту.", { exact: true }).waitFor();
  assert.equal(await failedMap.getAttribute("aria-busy"), "false");
  await failedMap.getByRole("button", { name: "Спробувати ще раз", exact: true }).click();
  await failed.page.locator(".is-map-loaded").waitFor();
  await failed.page.locator(".home-store-tour-frame").scrollIntoViewIfNeeded();
  await failed.page.getByRole("button", { name: "Розпочати тур 360°", exact: true }).click();
  await failed.page.locator(".home-store-tour iframe").waitFor();
  await failed.page.clock.fastForward(16_000);
  await failed.page.getByText("Не вдалося завантажити тур 360°.", { exact: true }).waitFor();
  await failed.page.locator(".home-store-tour").getByRole("button", { name: "Спробувати ще раз", exact: true }).click();
  await failed.page.locator(".is-tour-loaded").waitFor();
  assert.equal(failed.count("map"), 2); assert.equal(failed.count("tour"), 2);
  for (const route of failed.held) await route.abort().catch(() => {});
  await failed.page.close();

  const fallback = await setup(390, { noObserver: true });
  await fallback.page.waitForTimeout(200); assert.equal(fallback.requests.length, 0);
  await scrollBefore(fallback.page.locator(".home-store-map-frame"), 180);
  await fallback.page.locator(".is-map-loaded").waitFor();
  await fallback.page.close();
  console.log(JSON.stringify(report));
  console.log("PASS store embeds: early map during scroll/load, intent-only panorama, warm connections, stable frames, Save-Data, release, timeout/retry and observer fallback.");
} finally {
  await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); stop();
}
