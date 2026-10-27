import { writeFileSync } from 'node:fs';
const { chromium } = await import(process.argv[2] || 'playwright');
const origin = process.argv[3] || 'http://localhost:3104';
const destination = process.argv[4];
const samples = Number(process.env.HOME_PERF_SAMPLES || 3);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const width of [390, 1440]) for (let sample = 0; sample < samples; sample++) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 80, downloadThroughput: 200_000, uploadThroughput: 100_000 });
    await page.addInitScript(() => {
      window.startupMetrics = { lcp: 0, cls: 0, longTasks: [] };
      new PerformanceObserver(list => { window.startupMetrics.lcp = list.getEntries().at(-1).startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.startupMetrics.cls += entry.value; }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver(list => { for (const entry of list.getEntries()) window.startupMetrics.longTasks.push({ start: entry.startTime, duration: entry.duration }); }).observe({ type: 'longtask', buffered: true });
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.getByRole('button', { name: 'Увійти', exact: true }).waitFor();
    await page.waitForTimeout(2000);
    const metrics = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const resources = performance.getEntriesByType('resource').map(e => ({ url: e.name, start: Math.round(e.startTime), ms: Math.round(e.duration), bytes: e.transferSize, type: e.initiatorType }));
      return { ttfb: Math.round(nav.responseStart), domInteractive: Math.round(nav.domInteractive), domLoaded: Math.round(nav.domContentLoadedEventEnd), fcp: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0), ...window.startupMetrics, htmlBytes: nav.encodedBodySize, resources, initialJsBytes: resources.filter(e => e.type === 'script' && e.start < nav.domContentLoadedEventEnd).reduce((sum, e) => sum + e.bytes, 0) };
    });
    results.push({ width, sample, status: response.status(), errors, ...metrics });
    console.log(JSON.stringify({ width, sample, ...Object.fromEntries(Object.entries(metrics).filter(([k]) => !['resources', 'longTasks'].includes(k))), errors }));
    await context.close();
  }
} finally { await browser.close(); }
if (destination) writeFileSync(destination, JSON.stringify({ origin, conditions: { cpu: 4, latencyMs: 80, downloadBytesPerSecond: 200000, freshBrowserCache: true }, results }, null, 2));
