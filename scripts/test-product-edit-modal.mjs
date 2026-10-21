import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import sharp from 'sharp';
const photo=await sharp({create:{width:300,height:150,channels:3,background:'#e03131'}}).jpeg().toBuffer();
const { chromium } = await import(process.argv[2] || 'playwright');
const requests = [];
let failProduct = false;
let failImage = false;
const result = await build({
  stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Modal from './app/components/ProductFullEditModal'; import {useProductDescription} from './app/lib/use-product-description'; import {useProductImageUpdate} from './app/lib/product-image-updates'; function ConfirmedImage(){const update=useProductImageUpdate('TEST','OLD');return <output hidden data-testid="confirmed-image">{update.previewSrc}</output>}; function Description(){const {description}=useProductDescription('TEST','OLD',true); return <output data-testid="saved-description" hidden>{description}</output>;} createRoot(document.getElementById('root')).render(<><Description/><ConfirmedImage/><Modal isOpen onClose={()=>{window.closed=true}} code="TEST" article="OLD" name="Тестовий товар" producer="Bosch" category="Запчастини" group="Гальма" subGroup="Диски" priceEuro={10} costPriceEuro={5} promoPriceEuro={new URLSearchParams(location.search).has("late-promo")?undefined:8} quantity={7} description="Початковий опис"/></>);`, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: {'process.env.NODE_ENV':'"production"'},
  plugins: [{ name: 'offline-auth-router', setup(build) {
    build.onResolve({filter:/^app\/lib\/product-image-upload-client$/},()=>({path:'slow-image-preparation',namespace:'slow-image'}));
    build.onLoad({filter:/.*/,namespace:'slow-image'},()=>({contents:`export * from ${JSON.stringify(process.cwd()+'/app/lib/product-image-upload-client.ts')};import{prepareProductImage as prepare}from ${JSON.stringify(process.cwd()+'/app/lib/product-image-upload-client.ts')};export const prepareProductImage=async(file)=>{await new Promise(r=>setTimeout(r,1800));return prepare(file)};`,loader:'ts',resolveDir:process.cwd()}));
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
    if(request.url.startsWith('/api/product-price')){setTimeout(()=>response.end(JSON.stringify({promoPriceEuro:8})),500);return;}
    if(request.url.startsWith('/api/product-description')){setTimeout(()=>response.end(JSON.stringify({description:'Застарілий опис'})),1500);return;}
    if(request.method==='POST') requests.push({url:request.url,body});
    if(request.url==='/api/product-upload-image' && failImage){response.statusCode=503;response.end(JSON.stringify({ok:false,error:'Тестова помилка фото'}));return;}
    if(request.url==='/api/product-update' && failProduct){response.statusCode=502;response.end(JSON.stringify({ok:false,error:'1С тимчасово недоступна'}));return;}
    response.end(JSON.stringify(request.method==='POST'?{ok:true,code:'TEST',priceEuro:body.ЦінаПрод,costPriceEuro:body.ЦінаЗакуп,promoPriceEuro:body.Акція,quantity:body.Кількість}:{suggestions:[]}));return;
  }
  response.setHeader('Content-Type','text/html');response.end('<html lang="uk"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script></html>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  for(const width of [390,1440]) {
    requests.length=0;failProduct=false;failImage=false;
    const page=await browser.newPage({viewport:{width,height:900}});
    await page.addInitScript(()=>{window.revokedPreviewURLs=[];const revoke=URL.revokeObjectURL.bind(URL);URL.revokeObjectURL=(src)=>{window.revokedPreviewURLs.push(src);revoke(src)}});
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const modal=page.getByRole('dialog');await modal.waitFor();
    await modal.getByLabel('Ціна продажу €').fill('12,50');
    assert.equal(await modal.getByLabel('Акційна ціна €').inputValue(),'8');
    await modal.getByLabel('Акційна ціна €').fill('9,25');
    await modal.getByLabel('Поточний залишок, шт.').fill('0');
    await modal.getByRole('tab',{name:'Опис',exact:true}).click();
    await modal.getByLabel('Опис товару').fill('Новий опис\nХарактеристики товару');
    await modal.getByRole('button',{name:'Зберегти',exact:true}).click();
    await modal.getByRole('status').waitFor();
    assert.equal(requests.length,2);
    assert.equal(requests[0].body.description,'Новий опис\nХарактеристики товару');
    assert.equal(requests[1].body.ЦінаПрод,12.5);
    assert.equal(requests[1].body.Акція,9.25);
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
    const refreshBeforePhoto=await page.evaluate(()=>window.refreshCalls);
    await modal.getByPlaceholder('Назва товару').fill('Незбережена назва');
    await modal.getByRole('tab',{name:'Фото',exact:true}).click();
    await modal.getByLabel('Основне фото товару').setInputFiles({name:'product.jpg',mimeType:'image/jpeg',buffer:photo});
    const quickPreview=modal.getByAltText('Попередній перегляд').first();
    await quickPreview.waitFor();
    const quickSrc=await quickPreview.getAttribute('src');
    assert(quickSrc.startsWith('blob:'),'Original-file preview must appear before image preparation finishes');
    assert(await modal.getByRole('button',{name:'Зберегти фото',exact:true}).isDisabled(),'Unprepared original must never be uploaded');
    await page.waitForFunction(()=>document.querySelector('img[alt="Попередній перегляд"]').naturalWidth>0);
    assert(await modal.getByRole('button',{name:'Зберегти фото',exact:true}).isDisabled(),'Preview must decode while processing is still running');
    await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Зберегти фото'&&!b.disabled));
    assert(await page.evaluate(src=>window.revokedPreviewURLs.includes(src),quickSrc),'Temporary preview URL must be released when preparation completes');
    failImage=true;
    await modal.getByRole('button',{name:'Зберегти фото',exact:true}).click();
    await modal.getByText('Тестова помилка фото',{exact:true}).waitFor();
    assert.equal(await page.getByTestId('confirmed-image').textContent(),'','A rejected upload must not publish the preview');
    failImage=false;
    await modal.getByRole('button',{name:'Зберегти фото',exact:true}).click();
    await modal.getByText('Завантажено',{exact:true}).waitFor();
    assert.equal(await page.getByTestId('confirmed-image').textContent(),'data:image/jpeg;base64,'+photo.toString('base64'));
    assert.equal(await page.evaluate(()=>window.refreshCalls),refreshBeforePhoto,'Photo updates must not reload the page');
    await modal.getByRole('tab',{name:'Основне',exact:true}).click();
    assert.equal(await modal.getByPlaceholder('Назва товару').inputValue(),'Незбережена назва','Photo upload must preserve unsaved fields');
    await modal.getByPlaceholder('Назва товару').fill('Тестовий товар');
    await modal.getByLabel('Акційна ціна €').fill('0');
    await modal.getByRole('button',{name:'Зберегти',exact:true}).click();
    await modal.getByRole('status').waitFor();
    assert.equal(requests.at(-1).body.Акція,0,'Zero removes the promotion');
    assert.equal(requests.at(-1).body.ЦінаПрод,undefined,'Promo-only edits preserve the regular price');
    assert.equal(requests.at(-1).body.ЦінаЗакуп,undefined,'Promo-only edits preserve cost');
    assert.equal(requests.at(-1).body.Кількість,undefined,'Promo-only edits preserve stock');
    const removedCount=requests.length;
    await modal.getByRole('button',{name:'Зберегти',exact:true}).click();
    await page.waitForTimeout(100);
    assert.equal(requests.length,removedCount,'Confirmed zero is retained in the baseline');
    await modal.getByLabel('Акційна ціна €').fill('-1');
    await modal.getByRole('button',{name:'Зберегти',exact:true}).click();
    await modal.getByRole('alert').waitFor();
    assert.equal(requests.length,removedCount,'Invalid promo prices are not sent');
    await modal.getByLabel('Акційна ціна €').fill('6,75');
    await modal.getByRole('button',{name:'Зберегти',exact:true}).click();
    await modal.getByRole('status').waitFor();
    assert.equal(requests.at(-1).body.Акція,6.75,'A new promotion can be added after removal');
    const rect=await modal.boundingBox();assert(rect.x>=0 && rect.x+rect.width<=width+1);
    await page.screenshot({path:`/tmp/partson-product-edit-${width}.png`});
    await page.close();
    console.log(`Product edit ${width}px passed: description, comma price, zero stock, validation, partial failure, retry and stable baseline.`);
  }
  const late=await browser.newPage();
  await late.goto(`http://127.0.0.1:${server.address().port}/?late-promo`);
  await late.getByLabel('Акційна ціна €').fill('4,50');
  await late.waitForTimeout(700);
  assert.equal(await late.getByLabel('Акційна ціна €').inputValue(),'4,50','Late promo lookup must not overwrite an edited draft');
  await late.close();
  console.log('Promo form passed: current value, add/edit/remove, decimal comma, validation and delayed-read race.');
} finally {await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
