import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import ts from "typescript";
const { chromium } = await import(process.argv[2] || "./test-browser.mjs");

const css = readFileSync("app/globals.css", "utf8").replace(/^@import[^\n]+\n/, "");
const reveal = ts.transpileModule(readFileSync("app/lib/home-image-reveal.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const server = http.createServer((request, response) => {
  if (request.url === "/style.css") {
    response.setHeader("content-type", "text/css"); response.end(css); return;
  }
  if (request.url.startsWith("/photo.svg")) {
    setTimeout(() => {
      response.setHeader("content-type", "image/svg+xml");
      response.end('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><path fill="#087781" d="M0 0h160v90H0z"/></svg>');
    }, 180);
    return;
  }
  response.setHeader("content-type", "text/html");
  response.end(`<!doctype html><html lang="uk"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><style>body{margin:0}.test-content{height:220px;padding:24px}.test-following{height:80px}.test-photo{width:160px;height:90px}</style><div class="home-static"><section class="home-section-stage home-slot-auto"><div class="home-deferred-content"><div class="test-content">Підбір запчастин</div></div></section><div class="test-following">Наступний блок</div></div><script>{const exports={};${reveal};window.revealHomeImage=exports.revealHomeImage;}</script></html>`);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(origin);
    await page.evaluate(() => document.querySelector(".home-deferred-content").classList.add("is-ready"));
    await page.waitForTimeout(500);
    const sampled = await page.evaluate(async () => {
      const content = document.querySelector(".home-deferred-content");
      const following = document.querySelector(".test-following");
      const top = following.getBoundingClientRect().top;
      const samples = [];
      for (let cycle = 0; cycle < 3; cycle++) {
        document.documentElement.classList.add("is-scrolling");
        // Resolve the scrolling style before removing it on the next frame.
        getComputedStyle(content).getPropertyValue("opacity");
        await new Promise(resolve => requestAnimationFrame(resolve));
        document.documentElement.classList.remove("is-scrolling");
        for (let frame = 0; frame < 32; frame++) {
          await new Promise(resolve => requestAnimationFrame(resolve));
          samples.push({ opacity: Number(getComputedStyle(content).opacity), top: following.getBoundingClientRect().top });
        }
      }
      return { top, samples };
    });
    assert(sampled.samples.every(sample => sample.opacity > .999), `${width}px: ready content dimmed after scrolling stopped`);
    assert(sampled.samples.every(sample => sample.top === sampled.top), `${width}px: following section moved`);

    const images = await page.evaluate(async () => {
      const cached = new Image(); cached.className = "test-photo"; cached.src = "/photo.svg?cached"; document.body.append(cached);
      await cached.decode();
      window.revealHomeImage(cached, performance.now());
      const cachedAnimations = cached.getAnimations().length;
      const fresh = new Image(); fresh.className = "test-photo";
      const hydratedAt = performance.now();
      await new Promise(resolve => { fresh.onload = () => { window.revealHomeImage(fresh, hydratedAt); resolve(); }; fresh.src = "/photo.svg?fresh"; document.body.append(fresh); });
      const freshAnimations = fresh.getAnimations().length;
      window.revealHomeImage(fresh, hydratedAt);
      const duplicateAnimations = fresh.getAnimations().length;
      return { cachedAnimations, freshAnimations, duplicateAnimations };
    });
    assert.equal(images.cachedAnimations, 0, "Cached photos never dim during hydration");
    assert.equal(images.freshAnimations, 1, "A freshly downloaded photo fades once");
    assert.equal(images.duplicateAnimations, 1, "Repeated load notifications do not restart the reveal");
    await page.emulateMedia({ reducedMotion: "reduce" });
    const reduced = await page.evaluate(async () => {
      const img = new Image(); const start = performance.now();
      await new Promise(resolve => { img.onload = resolve; img.src = "/photo.svg?reduced"; document.body.append(img); });
      window.revealHomeImage(img, start);
      return img.getAnimations().length;
    });
    assert.equal(reduced, 0, "Reduced motion keeps a fresh photo still");
    await page.close();
  }
  console.log("PASS home reveals: no re-hide after scroll, stable layout, cached photos stay visible, fresh photo fades once, reduced motion respected.");
} finally {
  await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
