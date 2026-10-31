import assert from 'node:assert/strict';
// Use next start to exercise prefetch; set TEST_SKIP_PREFETCH=1 for next dev.
const { chromium } = await import(process.argv[2] || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://localhost:3000';
const browser = await chromium.launch({ channel: 'chrome' });

async function openPage(width, reducedMotion = 'no-preference') {
  const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion, isMobile: width < 640, hasTouch: width < 640 });
  page.setDefaultTimeout(20_000);
  page.setDefaultNavigationTimeout(60_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.navigationProbe = { marker: Math.random(), arrivals: [], nativeTransitions: 0 };
    const startViewTransition = document.startViewTransition;
    if (startViewTransition) document.startViewTransition = function (...args) {
      window.navigationProbe.nativeTransitions++;
      return startViewTransition.apply(this, args);
    };
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      if (this.classList.contains('route-transition-shell')) {
        window.navigationProbe.arrivals.push({ frames, duration: options.duration, path: location.pathname });
      }
      return animate.call(this, frames, options);
    };
    document.cookie = 'partson_analytics_consent=denied; Path=/';
    document.cookie = 'partson_advertising_consent=denied; Path=/';
  });
  await page.goto(`${origin}/inform/delivery`, { waitUntil: 'domcontentloaded' });
  await page.locator('main h1').waitFor();
  // The appearance hook marks hydration after its deferred styles settle.
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-consent-hydrated'));
  await page.evaluate(() => Promise.race([window.__partsonCssReady, new Promise(resolve => setTimeout(resolve, 3000))]));
  return { page, errors };
}

async function probe(page, name, events, attributes = {}) {
  await page.evaluate(({ name, events, attributes }) => {
    let anchor = document.getElementById('navigation-intent-probe');
    if (!anchor) {
      anchor = document.createElement('a');
      anchor.id = 'navigation-intent-probe';
      anchor.textContent = 'Navigation intent probe';
      anchor.style.cssText = 'position:fixed;left:4px;bottom:4px;z-index:10000';
      document.body.append(anchor);
    }
    anchor.href = `/privacy-policy?nav-probe=${name}`;
    for (const key of ['data-prefetch-intent', 'data-prefetch-touch', 'download', 'target']) anchor.removeAttribute(key);
    for (const [key, value] of Object.entries(attributes)) anchor.setAttribute(key, value);
    for (const event of events) {
      if (event === 'scroll') {
        window.dispatchEvent(new Event('scroll'));
        window.dispatchEvent(new Event('scrollend'));
        continue;
      }
      if (event === 'focusin') { anchor.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); continue; }
      const [type, pointerType = 'mouse', modifier] = event.split(':');
      anchor.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType, isPrimary: true, button: 0, ctrlKey: modifier === 'ctrl' }));
    }
  }, { name, events, attributes });
}

try {
  for (const width of [390, 1440]) {
    const { page, errors } = await openPage(width);
    try {
      const marker = await page.evaluate(() => window.navigationProbe.marker);
      assert.equal(await page.evaluate(() => window.navigationProbe.arrivals.length), 0, 'Initial paint has no arrival delay');
      if (width === 1440 && process.env.TEST_SKIP_PREFETCH !== '1') {
        const requests = [];
        page.on('request', request => {
          const url = new URL(request.url());
          if (url.searchParams.has('nav-probe')) requests.push(url.searchParams.get('nav-probe'));
        });
        await page.evaluate(() => document.documentElement.classList.add('is-scrolling'));
        for (let i = 0; i < 4; i++) await probe(page, `scroll-${i}`, ['pointerover', 'pointerout']);
        await page.evaluate(() => document.documentElement.classList.remove('is-scrolling'));
        for (let i = 0; i < 4; i++) await probe(page, `pass-${i}`, ['pointerover', 'pointerout']);
        await probe(page, 'cancel-on-scroll', ['pointerover', 'scroll']);
        await page.waitForTimeout(350);
        assert.deepEqual(requests, [], 'Scrolling and passing pointers cause zero speculative requests');

        const hoverRequest = page.waitForRequest(request => new URL(request.url()).searchParams.get('nav-probe') === 'deliberate-hover');
        await probe(page, 'deliberate-hover', ['pointerover']);
        await hoverRequest;
        await page.waitForTimeout(400);
        const hoverRequests = requests.filter(name => name === 'deliberate-hover').length;
        await probe(page, 'deliberate-hover', ['focusin', 'pointerdown']);
        await page.waitForTimeout(150);
        assert.equal(requests.filter(name => name === 'deliberate-hover').length, hoverRequests, 'Focus and press reuse the route/segment requests already started by hover');
        const touchRequest = page.waitForRequest(request => new URL(request.url()).searchParams.get('nav-probe') === 'touch');
        await probe(page, 'touch', ['pointerdown:touch']);
        await touchRequest;
        const nextHrefRequest = page.waitForRequest(request => new URL(request.url()).searchParams.get('nav-probe') === 'new-href');
        await probe(page, 'new-href', ['focusin']);
        await nextHrefRequest;
        for (const [name, attributes, event] of [
          ['intent-off', { 'data-prefetch-intent': 'false' }, 'focusin'],
          ['touch-off', { 'data-prefetch-touch': 'false' }, 'pointerdown:touch'],
          ['download', { download: '' }, 'focusin'],
          ['new-tab', { target: '_blank' }, 'pointerdown'],
          ['modified', {}, 'pointerdown:mouse:ctrl'],
        ]) await probe(page, name, [event], attributes);
        await page.evaluate(() => Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true, effectiveType: '4g' } }));
        await probe(page, 'save-data', ['focusin', 'pointerdown:touch']);
        await page.waitForTimeout(180);
        assert.deepEqual([...new Set(requests)].sort(), ['deliberate-hover', 'new-href', 'touch']);
        await page.evaluate(() => { delete navigator.connection; document.getElementById('navigation-intent-probe')?.remove(); });
        console.log('PASS intent: zero scroll/drive-by requests; deduplicated hover, keyboard and touch; changed href; opt-outs and Save-Data');
      }

      const payment = page.locator('main a[href="/inform/payment"]').first();
      await payment.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      const started = performance.now();
      if (width < 640) await payment.tap();
      else { await payment.focus(); await page.keyboard.press('Enter'); }
      await page.waitForURL('**/inform/payment');
      await page.locator('main h1').waitFor();
      const infoNavigationMs = Math.round(performance.now() - started);
      assert.equal(await page.evaluate(() => window.navigationProbe.arrivals.length), 0, 'Information tabs keep their named transitions');

      await page.locator('main a[href="/"]').first().click();
      await page.waitForURL(`${origin}/`);
      await page.locator('main h1').waitFor();
      assert.equal(await page.evaluate(() => window.navigationProbe.arrivals.length), 0, 'Native information transitions do not stack a live-DOM fade');

      const nativeBefore = await page.evaluate(() => window.navigationProbe.nativeTransitions);
      await page.getByRole('button', { name: 'Інформація', exact: true }).click();
      await page.locator('header a[href="/blog"]').click();
      await page.waitForURL('**/blog');
      await page.locator('main h1').waitFor();
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.route-transition-shell')).opacity === '1');
      const arrivals = await page.evaluate(() => window.navigationProbe.arrivals);
      const nativeAfter = await page.evaluate(() => window.navigationProbe.nativeTransitions);
      assert(arrivals.length === 1 || nativeAfter > nativeBefore, 'A page change has a live-DOM or native arrival');
      for (const arrival of arrivals) assert.equal(arrival.duration, 180);
      const geometry = await page.locator('.route-transition-shell').evaluate(el => ({ transform: getComputedStyle(el).transform, opacity: getComputedStyle(el).opacity }));
      assert.deepEqual(geometry, { transform: 'none', opacity: '1' }, 'Content stays visible and keeps sticky/fixed containing blocks');
      assert.equal(await page.evaluate(() => window.navigationProbe.marker), marker, 'Navigation preserves the document');

      await page.evaluate(() => history.replaceState(null, '', '?navigation-check=1'));
      await page.waitForTimeout(160);
      assert.equal(await page.evaluate(() => window.navigationProbe.arrivals.length), arrivals.length, 'Query updates do not animate or remount the page');
      await page.goBack({ waitUntil: 'domcontentloaded' });
      await page.waitForURL(`${origin}/`);
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.route-transition-shell')).opacity === '1');
      const arrivalsAfterBack = await page.evaluate(() => window.navigationProbe.arrivals.length);
      assert(arrivalsAfterBack > arrivals.length || await page.evaluate(() => window.navigationProbe.nativeTransitions) > nativeAfter, 'Back navigation also has an arrival');
      assert.equal(await page.evaluate(() => window.navigationProbe.marker), marker);
      assert.equal(await page.locator('.nav-progress-bar').evaluate(el => getComputedStyle(el).visibility), 'hidden', 'Progress settles after navigation');
      await page.evaluate(() => history.pushState(null, '', '#navigation-check'));
      await page.waitForTimeout(160);
      assert.equal(await page.locator('.nav-progress-bar').evaluate(el => getComputedStyle(el).visibility), 'hidden', 'Hash navigation does not flash the loading bar');
      assert.equal(await page.evaluate(() => window.navigationProbe.arrivals.length), arrivalsAfterBack, 'Hash navigation does not animate the page');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `/tmp/partson-nav-after-${width}.png` });
      console.log(JSON.stringify({ width, infoNavigationMs, arrivalDurationMs: 180, documentReloads: 0, errors }));
    } finally { await page.close(); }
  }

  const { page, errors } = await openPage(390, 'reduce');
  try {
    await page.locator('main a[href="/"]').first().click();
    await page.waitForURL(`${origin}/`);
    await page.locator('main h1').waitFor();
    assert.equal(await page.evaluate(() => window.navigationProbe.arrivals.length), 0, 'Reduced motion skips decorative arrival animation');
    assert.deepEqual(errors, []);
    console.log('PASS reduced motion: visible content, navigation works, no decorative arrival animation');
  } finally { await page.close(); }
} finally { await browser.close(); }
