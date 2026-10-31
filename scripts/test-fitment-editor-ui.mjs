// Offline fixtures: verifies editor persistence payload and customer filtering,
// without writing a product or changing the 1C directory.
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
const { chromium } = await import(process.argv[2] || 'playwright');
const initial='VW PASSAT B3/B4 1.6-2.8 02.88-05.97; AUDI A4 B5 1.8 11.94-\n\nКолір\tчорн';
const bundle=await build({stdin:{contents:`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import Editor from './app/components/ProductFitmentEditor';import Picker from './app/components/CarModifications';function App(){const[value,setValue]=useState(${JSON.stringify(initial)});const[valid,setValid]=useState(true);return location.search.includes('picker')?<Picker selectedBrand="VOLKSWAGEN" selectedModel="TEST" selectedCars={[]} onSelectCar={()=>{}} onConfirmSelection={payload=>{window.confirmed=payload}}/>:<><Editor value={value} onChange={setValue} onValidityChange={setValid}/><button id="save" disabled={!valid}>Зберегти тест</button><textarea aria-label="Серійний опис" value={value} onChange={e=>setValue(e.target.value)}/></>};createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const manifest=JSON.parse(readFileSync('public/styles/manifest.json','utf8'));
const css=readFileSync('public'+manifest.href);
const server=http.createServer((req,res)=>{
 if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');return res.end(bundle.outputFiles[0].text)}
 if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');return res.end(css)}
 if(req.url.startsWith('/api/proxy')){res.setHeader('Content-Type','application/json');const q=JSON.parse(new URL(req.url,'http://fixture').searchParams.get('q'));
 return res.end(JSON.stringify(q['Рік']?[
  {'Обєм':'1598','Об’єм':'1598','Об\u0454м':'1598','Потужність':90,'Коробка':'МКПП','Привід':'FWD','РікПочаток':2020,'РікКінець':2022},
  {'Об\u0454м':'1,6','Потужність':90,'Коробка':'МКПП','Привід':'FWD','РікПочаток':2020,'РікКінець':2022},
  {'Об\u0454м':'2.0','Потужність':150,'Коробка':'АКПП','Привід':'AWD','РікПочаток':2010,'РікКінець':2015}
 ]:[{'РікПочаток':2010,'РікКінець':2015},{'yearStart':2020,'yearEnd':2022},{'РікПочаток':2024,'РікКінець':0},{'Об\u0454м':1998}]))}
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><style>body{margin:0;background:#f8faf9;color:#244b50}#root{max-width:1060px;margin:auto;padding:20px}textarea{display:block;width:100%;height:120px;margin-top:20px}</style><div id="root"></div><script src="/app.js"></script>');
});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'chrome'});
try{
 for(const width of[390,1280]){
 const page=await browser.newPage({viewport:{width,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
 await page.locator('.product-fitment-editor > summary').click();
 assert.equal(await page.getByLabel('Рік від 1',{exact:true}).inputValue(),'1988');
 await page.getByLabel('Об’єм двигуна 1',{exact:true}).fill('1598 см³');await page.waitForFunction(()=>document.querySelector('textarea').value.includes('PASSAT B3/B4 1.6 02.88-05.97'),null,{timeout:5000});
 await page.getByLabel('Рік від 1',{exact:true}).fill('2020');assert(await page.locator('#save').isDisabled());
 await page.getByLabel('Рік до 1',{exact:true}).fill('2022');assert(await page.locator('#save').isEnabled());
 await page.locator('.product-fitment-bulk > summary').click();await page.getByLabel('Спільний рік від',{exact:true}).fill('2000');await page.getByLabel('Спільний рік до',{exact:true}).fill('2010');await page.getByLabel('Спільний об’єм двигуна',{exact:true}).fill('1.8');await page.getByRole('button',{name:'Застосувати до всіх',exact:true}).click();
 for(const i of[1,2]){assert.equal(await page.getByLabel(`Рік від ${i}`,{exact:true}).inputValue(),'2000');assert.equal(await page.getByLabel(`Рік до ${i}`,{exact:true}).inputValue(),'2010');assert.equal(await page.getByLabel(`Об’єм двигуна ${i}`,{exact:true}).inputValue(),'1.8')}
 assert((await page.getByLabel('Серійний опис').inputValue()).endsWith('\n\nКолір\tчорн'));
 await page.getByRole('button',{name:'Додати модель',exact:true}).click();assert(await page.locator('#save').isDisabled());await page.getByLabel('Марка 3',{exact:true}).selectOption('RAM');await page.getByLabel('Модель 3',{exact:true}).fill('1500');await page.getByLabel('Рік від 3',{exact:true}).fill('2019');await page.getByLabel('Рік до 3',{exact:true}).fill('2024');await page.getByLabel('Об’єм двигуна 3',{exact:true}).fill('5.7');assert(await page.locator('#save').isEnabled());
 assert((await page.getByLabel('Серійний опис').inputValue()).includes('RAM 1500 5.7 01.19-12.24'));
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);await page.screenshot({path:`/tmp/product-fitment-editor-${width}.png`,fullPage:true});
 await page.goto(origin+'/?picker');const select=page.getByLabel('Рік випуску',{exact:true});await select.selectOption('2021');assert.equal(await select.locator('option[value="2017"]').count(),0);assert.equal(await select.locator('option[value="1998"]').count(),0);
 await page.locator('.vehicle-mod-choice').filter({hasText:'1.6'}).first().waitFor();assert.equal(await page.locator('.vehicle-mod-choice').filter({hasText:'2.0'}).count(),0);assert.equal(await page.locator('.vehicle-mod-choice').count(),1);
 for(let step=0;step<4;step++){await page.locator('.vehicle-mod-choice').first().click();}
 await page.getByRole('button',{name:'Підтвердити авто',exact:true}).click();const payload=await page.evaluate(()=>window.confirmed);assert.equal(payload.year,2021);assert.match(payload.details.volume,/^1\.6 /);
 console.log(`PASS ${width}px: per-model editor, bulk fields, invalid ranges blocked, description preserved, year gaps and normalized engine selection`);await page.close();
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
