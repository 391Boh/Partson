import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.argv[2] || './test-browser.mjs');
const origin = process.env.TEST_ORIGIN;
assert(origin, 'Set TEST_ORIGIN to an explicitly chosen local preview.');
const shots = process.env.RESPONSIVE_SCREENSHOTS;
if (shots) await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const issues = [];
let checks = 0;
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const routes = ['/', '/auto', '/auto/audi', '/groups', '/manufacturers', '/katalog', '/product/tros-ruchn-halm-liv-audi-80-barab-ad030213', '/inform/delivery', '/contact', '/blog', '/partnership'];
  const sizes = [[320,740],[360,800],[390,844],[640,960],[768,1024],[820,1180],[1024,768],[1280,800],[1440,1000],[1920,1080],[2560,1440],[3440,1440],[3840,2160],[844,390]];
  for (const route of routes) {
    await page.setViewportSize({width:1440,height:1000});
    const response = await page.goto(origin + route, {waitUntil:'domcontentloaded',timeout:60000});
    assert.equal(response.status(), 200, route);
    await page.locator('header .site-header-row').waitFor();
    await page.waitForTimeout(600);
    const consent = page.getByRole('button', {name:'Лише необхідні',exact:true});
    if (await consent.isVisible()) await consent.click();
    for (const [width,height] of sizes) {
      await page.setViewportSize({width,height});
      await page.evaluate(() => scrollTo(0,0));
      await page.waitForTimeout(120);
      const errors = await page.evaluate(() => {
        const errors=[];
        if(document.documentElement.scrollWidth > innerWidth + 1) errors.push(`page overflow: ${document.documentElement.scrollWidth}`);
        const actions=[...document.querySelectorAll('.site-header-row .nav-action')].filter(e=>e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}));
        for(let i=0;i<actions.length;i++) {
          const a=actions[i].getBoundingClientRect();
          if(a.left < -1 || a.top < -1 || a.right > innerWidth+1 || a.width < 43 || a.height < 43) errors.push(`header target: ${actions[i].getAttribute('aria-label')} ${Math.round(a.width)}×${Math.round(a.height)}`);
          for(const other of actions.slice(i+1)) {
            const b=other.getBoundingClientRect();
            if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1) errors.push(`header overlap: ${actions[i].getAttribute('aria-label')}/${other.getAttribute('aria-label')}`);
          }
        }
        for(const shell of document.querySelectorAll('.page-shell-inline:not(.catalog-hub-stage)')) {
          const r=shell.getBoundingClientRect();
          if(r.width>Math.min(innerWidth,1840)+1 || r.left < -1 || r.right > innerWidth+1) errors.push(`shell: ${Math.round(r.width)}`);
        }
        for(const grid of document.querySelectorAll('.directory-swipe-track')) {
          const columns=getComputedStyle(grid).gridTemplateColumns.split(' ').length;
          if(grid.children.length>columns*3) errors.push(`directory rows: ${grid.children.length}/${columns}`);
          const expected=innerWidth>=1800?6:innerWidth>=1024?4:innerWidth>=768?3:2;
          if(!grid.closest('.directory-swipe--groups')&&columns!==expected) errors.push(`directory columns: ${columns}/${expected}`);
        }
        return errors;
      });
      checks++;
      issues.push(...errors.map(error=>`${route} ${width}×${height}: ${error}`));
      if (shots && ((route==='/' && width===390)||(route==='/auto' && (width===320||width===2560))||(route==='/katalog' && width===768)||(route.startsWith('/product/') && (width===390||width===2560)))) {
        await page.screenshot({path:`${shots}/${route==='/'?'home':route.split('/')[1]}-${width}.png`});
      }
    }
    if(['/auto','/auto/audi','/groups','/manufacturers'].includes(route)) {
      const next = page.getByRole('button',{name:'Наступна сторінка',exact:true});
      if(await next.count() && await next.isEnabled()) {
        const before=await page.locator('.directory-swipe-track').innerText();
        await next.click();
        await page.waitForTimeout(300);
        assert.notEqual(await page.locator('.directory-swipe-track').innerText(),before,`${route}: pagination updates cards`);
      }
    }
    console.log(`Checked ${route}: ${sizes.length} viewports`);
  }
  // Touch input and the short landscape search dialog use the same real page.
  const touch=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const phone=await touch.newPage();
  await phone.goto(origin+'/auto',{waitUntil:'domcontentloaded'});
  await phone.locator('main input').first().waitFor();
  const input=phone.locator('main input').first();
  if(await input.count()) assert((await input.evaluate(e=>parseFloat(getComputedStyle(e).fontSize)))>=16,'Touch inputs avoid focus zoom');
  for(const size of [{width:390,height:844},{width:844,height:390}]) {
    await phone.setViewportSize(size);
    const cookie=phone.getByRole('button',{name:'Лише необхідні',exact:true});if(await cookie.isVisible())await cookie.click();
    await phone.getByRole('button',{name:'Пошук',exact:true}).click();
    const dialog=phone.getByRole('dialog').filter({has:phone.locator('#header-search-modal-title')});
    await dialog.waitFor();
    const r=await dialog.boundingBox();assert(r && r.x>=-1 && r.y>=-1 && r.x+r.width<=size.width+1 && r.y+r.height<=size.height+1,'Search dialog stays in viewport');
    await phone.keyboard.press('Escape');
  }
  await touch.close();
  assert.deepEqual(issues,[]);
  console.log(`PASS responsive public pages: ${checks} viewport checks, navigation, touch inputs and portrait/landscape search`);
} finally {await browser.close();}
