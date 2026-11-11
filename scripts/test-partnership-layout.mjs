import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { build, stop } from "esbuild";
const { chromium } = await import(process.argv[2] || "./test-browser.mjs");
const bundle = await build({
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React from 'react';import{createRoot}from'react-dom/client';
    import Cta from './app/partnership/PartnershipCtaClient';
    createRoot(document.getElementById('root')).render(<main className="partner-page"><div className="partner-hero-actions"><Cta/><a className="partner-how-link">Як це працює</a></div><p id="following">Наступний блок</p></main>);
  ` },
  bundle: true, write: false, platform: "browser", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "controlled-auth", setup(builder) {
    builder.onResolve({ filter: /^(next\/link|app\/lib\/firebase-auth-state)$/ }, args => ({ path: args.path, namespace: "mock" }));
    builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({ loader: "tsx", resolveDir: process.cwd(), contents: path === "next/link"
      ? "import React from 'react';export default props=><a {...props}/>;"
      : "import{useState}from'react';export function useFirebaseAuthState(){const[state,setState]=useState({ready:false,user:null});window.setAuth=setState;return state;}"
    }));
  } }],
});
const server = http.createServer((request, response) => {
  if (request.url === "/bundle.js") { response.setHeader("content-type", "text/javascript"); response.end(bundle.outputFiles[0].contents); return; }
  if (request.url === "/style.css") { response.setHeader("content-type", "text/css"); response.end(readFileSync("public/styles/dev-site.css")); return; }
  response.setHeader("content-type", "text/html");
  response.end('<!doctype html><html lang="uk"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script></html>');
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const width of [320, 390, 640, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const register = page.getByRole("button", { name: "Зареєструватись", exact: true });
    await register.waitFor();
    assert(await register.isDisabled(), "Pending auth keeps the full controls reserved");
    const geometry = () => page.evaluate(() => ({ top: document.querySelector("#following").getBoundingClientRect().top, frame: document.querySelector(".partner-cta-frame").getBoundingClientRect().height }));
    const initial = await geometry();
    for (const user of [null, { uid: "partner" }, null]) {
      await page.evaluate(user => window.setAuth({ ready: true, user }), user);
      await page.waitForTimeout(100);
      assert.deepEqual(await geometry(), initial, `${width}px: auth restoration keeps following content in place`);
      if (user) {
        assert(await page.getByRole("link", { name: "Перейти до каталогу", exact: true }).isVisible());
        assert.equal(await page.getByRole("button").count(), 0, "Hidden guest actions stay out of the accessibility tree");
      } else assert(await register.isEnabled());
    }
    await page.evaluate(() => { window.authEvents = []; addEventListener("openAuthModal", event => window.authEvents.push(event.detail.initialMode)); });
    await register.click();
    await page.getByRole("button", { name: "Увійти", exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.authEvents), ["register", "login"]);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.close();
  }
  console.log("PASS partnership CTA: pending, guest, restored member and logout keep identical geometry at four widths; both auth actions work.");
} finally {
  await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); stop();
}
