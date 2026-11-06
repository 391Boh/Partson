import assert from 'node:assert/strict';
import {build,stop} from 'esbuild';
import{readFileSync}from'node:fs';
const {chromium}=await import(process.argv[2]||'./test-browser.mjs');
const base='http://directory.test';
const fixture=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from 'react';import{createRoot}from'react-dom/client';import Collection from './app/components/DirectoryCollection';
 const labels=Array.from({length:80},(_,i)=>'Розділ '+String(i+1).padStart(2,'0'));
 createRoot(document.getElementById('root')).render(<main className="catalog-directory-page"><section className="page-shell-inline"><div className="directory-panel"><header className="directory-panel-header"><h2>Розділи запчастин</h2></header><Collection labels={labels} className="directory-results directory-results--compact p-4">{labels.map((label,i)=><a key={label} data-entry={i+1} href={'/groups/fixture-'+i} className="directory-entry"><strong>{label}</strong></a>)}</Collection></div></section></main>);
 `},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env':'{"NODE_ENV":"production"}'}});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{for(const width of [320,768,1440,2560]){
 const page=await browser.newPage({viewport:{width,height:950},isMobile:width<768,hasTouch:width<768,reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/styles/dev-site.css',route=>route.fulfill({contentType:'text/css',body:readFileSync('public/styles/dev-site.css','utf8')}));
 await page.route('**/__directory-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="uk"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles/dev-site.css"><div id="root"></div><script src="/__directory-bundle.js"></script></html>'}));
 await page.route('**/__directory-bundle.js',route=>route.fulfill({contentType:'text/javascript',body:fixture.outputFiles[0].text}));
 await page.goto(base+'/__directory-fixture');const rows=page.locator('[data-entry]:visible');assert.equal(await page.locator('[data-entry]').count(),80,'every card stays in the HTML');await rows.first().waitFor();const count=await rows.count();assert(count<=9);
 await page.getByRole('button',{name:'Наступна сторінка',exact:true}).click();assert.equal(await rows.first().getAttribute('data-entry'),String(count+1));
 await page.getByRole('spinbutton',{name:'Номер сторінки'}).fill('4');await page.getByRole('button',{name:'Перейти',exact:true}).click();assert.equal(await rows.first().getAttribute('data-entry'),String(count*3+1));
 await page.getByRole('combobox',{name:'Кількість записів на сторінці'}).selectOption(String(count*2));assert.equal(await rows.count(),count*2);assert.equal(await rows.first().getAttribute('data-entry'),'1');
 const search=page.getByRole('searchbox');await search.fill('Розділ 79');await page.waitForFunction(()=>document.querySelectorAll('[data-entry]:not([hidden])').length===1);assert.equal(await rows.first().getAttribute('data-entry'),'79');
 await page.getByRole('button',{name:'Очистити пошук у списку'}).click();await page.waitForFunction(()=>document.querySelector('[data-entry]:not([hidden])')?.getAttribute('data-entry')==='1');
 await search.fill('Немає такого розділу');await page.locator('.directory-collection-empty').waitFor();assert.equal(await rows.count(),0);await page.getByRole('button',{name:'Показати всі розділи'}).click();await rows.first().waitFor();assert.equal(await rows.first().getAttribute('data-entry'),'1');
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}px horizontal overflow`);assert.deepEqual(errors,[]);console.log(`PASS directory collection ${width}px: search, clear, empty state, pagination, page jump, page size and fit`);await page.close();
}}finally{await browser.close();stop()}
