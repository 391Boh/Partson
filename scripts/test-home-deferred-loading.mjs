import assert from "node:assert/strict";
import http from "node:http";
import { build, stop } from "esbuild";
const { chromium } = await import(process.argv[2] || "./test-browser.mjs");

const bundle = await build({
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React from 'react';import{createRoot}from'react-dom/client';
    import Stack from './app/components/HomeDeferredStack';
    window.prepared={};window.manufacturerRequests=0;
    createRoot(document.getElementById('root')).render(<><div style={{height:1900}}>Перший екран</div><Stack/></>);
  ` },
  bundle: true, write: false, platform: "browser", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "controlled-sections", setup(builder) {
    builder.onResolve({ filter: /^next\/dynamic$/ }, args => ({ path: args.path, namespace: "dynamic" }));
    builder.onLoad({ filter: /.*/, namespace: "dynamic" }, () => ({ loader: "tsx", resolveDir: process.cwd(), contents: `
      import React,{lazy,Suspense}from'react';export default load=>{const Component=lazy(load);return props=><Suspense fallback={null}><Component {...props}/></Suspense>};
    ` }));
    builder.onResolve({ filter: /^\.\/(Auto|tovar|Brands)$/ }, args => ({ path: args.path.slice(2), namespace: "section" }));
    builder.onLoad({ filter: /.*/, namespace: "section" }, ({ path }) => ({ loader: "tsx", resolveDir: process.cwd(), contents: `
      import React,{useEffect}from'react';const kind=${JSON.stringify(path)};window.prepared[kind]=true;
      export default function Section({onReady}){useEffect(()=>onReady?.(),[onReady]);if(window.failKind===kind)throw new Error('controlled section failure');return <button>Готовий модуль {kind}</button>}
    ` }));
    builder.onResolve({ filter: /app\/lib\/manufacturer-counts-client$/ }, args => ({ path: args.path, namespace: "counts" }));
    builder.onLoad({ filter: /.*/, namespace: "counts" }, () => ({ contents: "export function prefetchManufacturerCounts(){window.manufacturerRequests++;return Promise.resolve(null)}" }));
  } }],
});
const server = http.createServer((request, response) => {
  if (request.url === "/bundle.js") {
    response.setHeader("content-type", "text/javascript"); response.end(bundle.outputFiles[0].contents); return;
  }
  response.setHeader("content-type", "text/html");
  response.end(`<!doctype html><html lang="uk"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    body{margin:0}.home-section-stage{height:600px;position:relative}.home-deferred-content{opacity:0}.home-deferred-content.is-ready{opacity:1}.home-section-skeleton{position:absolute;inset:0;background:#eef6f4}.home-section-skeleton.is-ready{display:none}
  </style><div id="root"></div><script src="/bundle.js"></script></html>`);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const origin = `http://127.0.0.1:${server.address().port}`;
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await page.goto(origin);
  await page.waitForTimeout(5000);
  assert.equal(await page.locator(".home-deferred-content").count(), 0, "Distant sections stay unmounted after idle timers expire");
  assert.equal(await page.evaluate(() => Object.keys(window.prepared).length), 0, "Distant chunks are not evaluated speculatively");
  assert.equal(await page.evaluate(() => window.manufacturerRequests), 0);
  await page.evaluate(() => document.documentElement.classList.add("is-scrolling"));
  await page.locator(".home-slot-auto").scrollIntoViewIfNeeded();
  await page.locator(".home-slot-auto .home-deferred-content.is-ready").waitFor({ timeout: 1800 });
  assert(await page.getByRole("button", { name: "Готовий модуль Auto", exact: true }).isVisible());
  await page.close();

  const failed = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await failed.addInitScript(() => { window.failKind = "Brands"; });
  await failed.goto(origin);
  await failed.locator(".home-slot-brands").scrollIntoViewIfNeeded();
  await failed.getByText("Модуль брендів тимчасово недоступний", { exact: true }).waitFor({ timeout: 1800 });
  assert.equal(await failed.locator(".home-slot-brands").getAttribute("aria-busy"), "false", "An error is revealed immediately, without the eight-second safety timer");
  await failed.close();
  const missingCss = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await missingCss.addInitScript(() => {
    window.__partsonCssReady = Promise.reject(new Error("controlled CSS failure"));
    window.__partsonCssReady.catch(() => {});
  });
  await missingCss.goto(origin);
  await missingCss.locator(".home-slot-auto").scrollIntoViewIfNeeded();
  await missingCss.getByText("Модуль підбору авто тимчасово недоступний", { exact: true }).waitFor({ timeout: 1800 });
  assert.equal(await missingCss.getByRole("button", { name: "Готовий модуль Auto", exact: true }).count(), 0, "Unavailable styles reveal an error, not unstyled controls");
  await missingCss.close();
  console.log("PASS deferred loading: no distant work after five seconds, bounded mounting during scroll, immediate visible error recovery.");
} finally {
  await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); stop();
}
