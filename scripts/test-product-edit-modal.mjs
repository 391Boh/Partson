import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
const { chromium } = await import(process.argv[2] || 'playwright');
const requests = [];
let failProduct = false;
const result = await build({
  stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Modal from './app/components/ProductFullEditModal'; import {useProductDescription} from './app/lib/use-product-description'; function Description(){const {description}=useProductDescription('TEST','OLD',true); return <output data-testid="saved-description" hidden>{description}</output>;} createRoot(document.getElementById('root')).render(<><Description/><Modal isOpen onClose={()=>{window.closed=true}} code="TEST" article="OLD" name="Тестовий товар" producer="Bosch" category="Запчастини" group="Гальма" subGroup="Диски" priceEuro={10} costPriceEuro={5} quantity={7} description="Початковий опис"/></>);`, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: {'process.env.NODE_ENV':'"production"'},
  plugins: [{ name: 'offline-auth-router', setup(build) {
    build.onResolve({filter:/^(next\/navigation|app\/lib\/get-admin-token)$/}, args => ({path:args.path,namespace:'mock'}));
    build.onLoad({filter:/.*/,namespace:'mock'}, args => ({contents:args.path==='next/navigation' ? 'export const useRouter = () => ({refresh:()=>{window.refreshCalls=(window.refreshCalls||0)+1}});' : 'export const getAdminIdToken = async () => "offline-token";'}));
  }}],
});
const bundle = result.outputFiles[0].text;
const css = readFileSync('public/styles/dev.css');
const server = http.createServer(async (request,response) => {
  if(request.url==='/bundle.js'){response.setHeader('Content-Type','text/javascript');response.end(bundle);return;}
  if(request.url==='/style.css'){response.setHeader('Content-Type','text/css');response.end(css);return;}
  if(request.url.startsWith('/api/')){
    let raw='';for await(const chunk of request) raw+=chunk;
    const body=raw?JSON.parse(raw):{};
    response.setHeader('Content-Type','application/json');
    if(request.url.startsWith('/api/product-description')){setTimeout(()=>response.end(JSON.stringify({description:'Застарілий опис'})),1500);return;}
    if(request.method==='POST') requests.push({url:request.url,body});
    if(request.url==='/api/product-update' && failProduct){response.statusCode=502;response.end(JSON.stringify({ok:false,error:'1С тимчасово недоступна'}));return;}
    response.end(JSON.stringify(request.method==='POST'?{ok:true,code:'TEST',priceEuro:body.ЦінаПрод,costPriceEuro:body.ЦінаЗакуп,quantity:body.Кількість}:{suggestions:[]}));return;
  }
  response.setHeader('Content-Type','text/html');response.end('<html lang="uk"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script></html>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  for(const width of [390,1440]) {
    requests.length=0;failProduct=false;
    const page=await browser.newPage({viewport:{width,height:900}});
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const modal=page.getByRole('dialog');await modal.waitFor();
    await modal.getByLabel('Ціна продажу €').fill('12,50');
    await modal.getByLabel('Поточний залишок, шт.').fill('0');
    await modal.getByRole('tab',{name:'Опис',exact:true}).click();
    await modal.getByLabel('Опис товару').fill('Новий опис\nХарактеристики товару');
    await modal.getByRole('button',{name:'Зберегти',exact:true}).click();
    await modal.getByRole('status').waitFor();
    assert.equal(requests.length,2);
    assert.equal(requests[0].body.description,'Новий опис\nХарактеристики товару');
    assert.equal(requests[1].body.ЦінаПрод,12.5);
    assert.equal(requests[1].body.Кількість,0);
    assert.equal(await page.evaluate(()=>window.refreshCalls),1);
    assert.equal(await page.getByTestId('saved-description').textContent(),'Новий опис\nХарактеристики товару');
    await page.waitForTimeout(1600);
    assert.equal(await page.getByTestId('saved-description').textContent(),'Новий опис\nХарактеристики товару','Late description fetch must not overwrite the saved text');
    await modal.getByRole('button',{name:'Зберегти',exact:true}).click();
    await page.waitForTimeout(150);assert.equal(requests.length,2,'An unchanged save must not repeat writes');
    await modal.getByRole('tab',{name:'Основне',exact:true}).click();
    assert.equal(await modal.getByLabel('Поточний залишок, шт.').inputValue(),'0');
    await modal.getByLabel('Ціна продажу €').fill('abc');
    await modal.getByRole('button',{name:'Зберегти',exact:true}).click();
    await modal.getByRole('alert').waitFor();assert.equal(requests.length,2,'Invalid prices must not reach 1C');
    await modal.getByLabel('Ціна продажу €').fill('13');
    await modal.getByRole('tab',{name:'Опис',exact:true}).click();
    await modal.getByLabel('Опис товару').fill('Ще один опис');
    failProduct=true;
    await modal.getByRole('button',{name:'Зберегти',exact:true}).click();
    await modal.getByRole('alert').waitFor();
    assert.equal(await modal.getByLabel('Опис товару').inputValue(),'Ще один опис','Failure must preserve the draft');
    const before=requests.length;failProduct=false;
    await modal.getByRole('button',{name:'Зберегти',exact:true}).click();
    await modal.getByRole('status').waitFor();
    assert.equal(requests.length,before+1,'Retry must not resend a description already saved');
    assert.equal(requests.at(-1).url,'/api/product-update');
    assert.equal(requests.at(-1).body.Кількість,undefined,'Price edit must not reset stock');
    await modal.getByRole('tab',{name:'Основне',exact:true}).click();
    assert.equal(await modal.getByLabel('Ціна продажу €').inputValue(),'13');
    const rect=await modal.boundingBox();assert(rect.x>=0 && rect.x+rect.width<=width+1);
    await page.screenshot({path:`/tmp/partson-product-edit-${width}.png`});
    await page.close();
    console.log(`Product edit ${width}px passed: description, comma price, zero stock, validation, partial failure, retry and stable baseline.`);
  }
} finally {await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
