import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { build, stop } from "esbuild";
import sharp from "sharp";
const { chromium } = await import(process.argv[2] || "./test-browser.mjs");

const bundle = await build({
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React from 'react';import{createRoot}from'react-dom/client';
    import Search from './app/components/Search';import Banner from './app/components/HomeNewArrivalsBanner';
    createRoot(document.getElementById('root')).render(<>
      <header style={{padding:20,maxWidth:900,margin:'auto'}}><Search onSearch={()=>{}}/></header>
      <div style={{height:1800}}/><Banner/>
    </>);
  ` },
  bundle: true, write: false, platform: "browser", jsx: "automatic",
  define: { "process.env": '{"NODE_ENV":"production"}' },
  plugins: [{ name: "next-browser-fixture", setup(builder) {
    builder.onResolve({ filter: /^next\/(navigation|link|image)$/ }, args => ({ path: args.path, namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ loader: "tsx", resolveDir: process.cwd(), contents:
      path === "next/navigation" ? "const router={push(href){window.navigated=href}};export const useRouter=()=>router;" :
      path === "next/link" ? `import{forwardRef}from'react';export default forwardRef(({prefetch,prefetchOnIntent,prefetchOnViewport,prefetchOnTouch,...props},ref)=><a ref={ref} {...props}/>);` :
      `export default function Image({fill,sizes,unoptimized,src,...props}){return <img {...props} src={unoptimized?src:'/_next/image?url='+encodeURIComponent(src)} style={fill?{position:'absolute',inset:0,width:'100%',height:'100%'}:undefined}/>}`,
    }));
  } }],
});
const pixel = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#087783" } }).webp().toBuffer();
const requests = [], imageRequests = [], staticRequests = [];
let rateRequests = 0, failMore = false;
const baseProduct = { code: "RECOVERY", article: "PHOTO-1", name: "Фільтр для перевірки", producer: "TEST", priceEuro: 9, quantity: 3, hasPhoto: true };
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, "http://fixture");
  if (url.pathname === "/bundle.js") { response.setHeader("content-type", "text/javascript"); response.end(bundle.outputFiles[0].contents); return; }
  if (url.pathname === "/style.css") { response.setHeader("content-type", "text/css"); response.end(readFileSync("public/styles/dev-site.css")); return; }
  if (url.pathname.startsWith("/images/home/arrivals/")) {
    staticRequests.push(url.pathname); response.setHeader("content-type", "image/webp"); response.end(readFileSync(`public${url.pathname}`)); return;
  }
  if (url.pathname.startsWith("/product-image/")) {
    imageRequests.push(url.pathname + url.search);
    if (url.pathname.endsWith("RECOVERY") && !url.searchParams.has("retry")) { response.writeHead(404); response.end(); return; }
    response.setHeader("content-type", "image/webp"); response.end(pixel); return;
  }
  if (url.pathname === "/api/proxy") {
    rateRequests++; response.setHeader("content-type", "application/json"); response.end('{"rate":42}'); return;
  }
  if (url.pathname === "/api/catalog-page") {
    let input = ""; for await (const chunk of request) input += chunk;
    const body = JSON.parse(input); requests.push(body);
    if (body.searchQuery === "slow") await new Promise(resolve => setTimeout(resolve, 400));
    if (body.searchQuery === "failure" || (body.cursor && failMore)) {
      response.writeHead(503, { "content-type": "application/json" }); response.end('{"serviceUnavailable":true}'); return;
    }
    const offset = Number(body.cursor) || 0;
    const items = body.searchQuery === "paged"
      ? Array.from({ length: 18 }, (_, index) => ({ ...baseProduct, code: `PAGE-${index}`, hasPhoto: false })).slice(offset, offset + body.limit)
      : [{ ...baseProduct, ...(body.searchQuery === "slow" ? { name: "OUTDATED" } : {}),
        ...(body.searchQuery === "renamed" ? { article: "PHOTO-2" } : {}) },
        { ...baseProduct, code: "NO-PHOTO", hasPhoto: false }];
    const hasMore = body.searchQuery === "paged" && offset === 0;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ items, prices: {}, images: {}, totalCount: body.searchQuery === "paged" ? 18 : 2, hasMore, nextCursor: hasMore ? "16" : "" })); return;
  }
  response.setHeader("content-type", "text/html");
  response.end('<!doctype html><html lang="uk"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script></html>');
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    const ratesBefore = rateRequests, staticBefore = staticRequests.length;
    await page.goto(origin);
    const input = page.getByRole("combobox", { name: "Пошук товарів" });
    await input.waitFor().catch(error => { throw new Error(`${error.message}; browser errors: ${errors.join("; ")}`); });
    await page.waitForTimeout(100);
    assert.equal(rateRequests, ratesBefore, "Unused search makes no rate request");
    await Promise.all([
      page.waitForRequest(request => request.postDataJSON()?.searchQuery === "slow"),
      input.fill("slow"),
    ]);
    await input.fill("current");
    const photo = page.getByRole("option").first().locator("img");
    await page.waitForFunction(() => {
      const image = document.querySelector('[role="option"] img');
      return image?.complete && image.naturalWidth > 0 && new URL(image.src).searchParams.has("retry");
    });
    assert((await photo.getAttribute("src")).startsWith("/product-image/"), "No second image optimizer");
    assert((await page.getByRole("option").first().innerText()).includes("378"), "Uses the real shared exchange rate");
    assert.equal(await page.getByRole("option").nth(1).locator("img").count(), 0, "Confirmed missing photos make no requests");
    await page.waitForTimeout(450);
    assert.equal(await page.getByText("OUTDATED", { exact: true }).count(), 0);
    const beforeCached = requests.length;
    await input.press("Escape"); await input.blur(); await input.focus();
    await page.getByRole("option").first().waitFor();
    assert.equal(requests.length, beforeCached, "Reopening reuses the successful suggestions");
    await input.fill("renamed");
    await page.waitForFunction(() => {
      const image = document.querySelector('[role="option"] img');
      return image?.complete && image.naturalWidth > 0 && new URL(image.src).searchParams.get("article") === "PHOTO-2";
    });
    await input.fill("paged"); await page.getByRole("option").nth(15).waitFor();
    failMore = true;
    await page.getByRole("button", { name: "Показати ще товари", exact: true }).click();
    await page.getByRole("button", { name: "Повторити завантаження", exact: true }).waitFor();
    assert.equal(await page.getByRole("option").count(), 16);
    failMore = false;
    await page.getByRole("button", { name: "Повторити завантаження", exact: true }).click();
    await page.getByRole("option").nth(17).waitFor();
    await input.fill("failure");
    await page.getByRole("button", { name: "Повторити пошук", exact: true }).waitFor();
    assert.equal(await page.getByText("Товарів за цим запитом немає", { exact: true }).count(), 0);
    await input.fill("current"); await page.getByRole("option").first().waitFor();
    await Promise.all([
      page.waitForRequest(request => request.postDataJSON()?.searchQuery === "current"),
      page.evaluate(() => window.dispatchEvent(new Event("partson:catalog-invalidated"))),
    ]);
    await page.getByRole("option").first().waitFor();
    const bounds = await page.getByRole("listbox").boundingBox();
    assert(bounds.x >= 0 && bounds.x + bounds.width <= width);
    await input.press("Enter");
    await page.waitForFunction(() => window.navigated?.startsWith("/katalog?search=current"));
    await page.waitForFunction(() => Object.keys(sessionStorage).some(key => key.includes('"q":"current"')));
    assert(requests.some(body => body.searchQuery === "current" && !body.purpose), "Submit warms the real catalog order");
    await page.locator('[aria-labelledby="home-arrivals-title"]').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => [...document.querySelectorAll('[aria-label="Групи нового надходження"] img')].slice(0, 2).every(image => image.complete && image.naturalWidth > 1));
    const decorative = staticRequests.slice(staticBefore).filter(src => ["00002367", "00002841", "00004074", "00005556", "00002256", "00003979"].some(code => src.includes(code)));
    if (width < 1024) assert.equal(decorative.length, 0, "Phones never download desktop decorations");
    else assert.equal(decorative.length, 6);
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}px: recovered photos, correct identity/rate, cache/invalidation, stale response protection, pagination/retry, catalog prefetch, static arrivals and responsive images.`);
    await page.close();
  }
  assert(imageRequests.every(src => !src.includes("NO-PHOTO")));
} finally {
  await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); stop();
}
