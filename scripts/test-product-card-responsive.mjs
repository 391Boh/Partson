import assert from 'node:assert/strict';
import http from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import {build,stop} from 'esbuild';
const {chromium}=await import(process.argv[2]||'./test-browser.mjs');
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from 'react';import{createRoot}from'react-dom/client';import Card from './app/components/ProductCard';
 const noop=()=>{},names=['Комплект зчеплення з підшипником для автомобілів Volkswagen Transporter довга назва деталі','Гальмівні колодки передні','Фільтр масляний'];
 createRoot(document.getElementById('root')).render(<main className="page-shell-inline"><div className="catalog-results-grid grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{Array.from({length:12},(_,i)=><Card key={i} item={{code:'TEST'+i,article:'АД-12345678901234567890',name:names[i%3],producer:'VALEO',quantity:i===5?0:12}} productHref="#" qty={1} cartQty={i%4===0?1:0} isAdmin={i%3===0} isGuest={i%3!==0&&i%4!==0} priceUAH={i===5?null:i%2?123456.78:9999} promoPriceUAH={i%2?99999.99:8999} isPartner={i%3===0} priceStatus="ready" priceAccessPending={i%2===1&&i%3===0} hasPromo promoPercent={10} isFlipped={false} onAddToCart={noop} onRequestPrice={noop} onRemoveFromCart={noop} onQtyChange={noop} onFlip={noop} onImageOpen={noop} onAdminEdit={noop}/>)}</div></main>);
 `},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env':'{"NODE_ENV":"production"}'},plugins:[{name:'offline-images-links',setup(b){
  b.onResolve({filter:/^next\/image$|^app\/components\/(SmartLink|ProductCardImage)$/},a=>({path:a.path,namespace:'mock'}));
  b.onLoad({filter:/.*/,namespace:'mock'},({path})=>({loader:'tsx',resolveDir:process.cwd(),contents:
   path.endsWith('ProductCardImage')?`import React from 'react';export default()=> <div style={{height:'100%',display:'grid',placeItems:'center'}}><img src="/test-product.webp" alt="Фото деталі для перевірки картки" style={{width:'100%',height:'100%',objectFit:'contain'}}/></div>;`:
   path.endsWith('SmartLink')?`import React from 'react';export default({href,children,className})=><a href={href} className={className}>{children}</a>;`:
   `import React from 'react';export default({src,alt,className,width,height,onError})=><img src={src} alt={alt} className={className} width={width} height={height} onError={onError}/>;`
  }));
 }}]});
const server=http.createServer((req,res)=>{
 if(req.url==='/test-product.webp'){
  if(process.env.CATALOG_CARD_PHOTO){res.setHeader('content-type','image/webp');res.end(readFileSync(process.env.CATALOG_CARD_PHOTO))}else{res.writeHead(204);res.end()}
 }else if(req.url==='/bundle.js'){res.setHeader('content-type','text/javascript');res.end(bundle.outputFiles[0].contents)}
 else if(req.url==='/style.css'){res.setHeader('content-type','text/css');res.end(readFileSync('public/styles/dev-site.css'))}
 else if(req.url==='/fonts/exo2-ui-v1.woff2'){res.setHeader('content-type','font/woff2');res.end(readFileSync('public/fonts/exo2-ui-v1.woff2'))}
 else{res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="uk"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@font-face{font-family:"Exo 2";src:url("/fonts/exo2-ui-v1.woff2") format("woff2");font-weight:100 900;font-display:swap}</style><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script></html>')}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const allIssues=[];
 for(const touch of [false,true]){
 const page=await browser.newPage({isMobile:touch,hasTouch:touch});await page.goto('http://127.0.0.1:'+server.address().port);
 await page.locator('.catalog-product-card').first().waitFor();await page.evaluate(()=>document.fonts.ready);
 for(const width of (touch?[320,390,768]:[320,390,768,1024,1280,1440,1800,1920,2400,2560,3840])){
  await page.setViewportSize({width,height:950});await page.waitForTimeout(70);
  const result=await page.evaluate(()=>{
   const cards=[...document.querySelectorAll('.catalog-product-card')];
   const issues=cards.flatMap((c,index)=>{
    const r=c.getBoundingClientRect(),p=c.querySelector('.catalog-card-price-row'),pill=c.querySelector('.catalog-card-price-pill'),actions=c.querySelector('.catalog-card-actions');
    if(actions&&actions.getBoundingClientRect().bottom>r.bottom-3)return [index+': clipped actions'];
    if(pill){
     // The price chip sits on the right edge of the content, or just left of the admin pencil.
     {const content=c.querySelector('.catalog-card-hero').getBoundingClientRect(),chip=pill.getBoundingClientRect(),pencil=p.querySelector(':scope > button'),gap=parseFloat(getComputedStyle(p).columnGap)||0,edge=pencil?pencil.getBoundingClientRect().left-gap:content.right;if(Math.abs(chip.right-edge)>1||chip.left<content.left-1)return [index+': price is not aligned with content'];}
     if(pill.scrollWidth>pill.clientWidth+1)return [index+': clipped price'];
     if(c.classList.contains('catalog-product-card--guest')){const content=c.querySelector('.catalog-card-hero').getBoundingClientRect(),value=pill.lastElementChild.getBoundingClientRect(),teaser=c.querySelector('.catalog-card-discount-teaser');const chip=pill.getBoundingClientRect();if(value.right>chip.right||chip.right-value.right>16||Math.abs(chip.right-content.right)>1)return [index+': guest amount not aligned right'];if(teaser){if(teaser.scrollWidth>teaser.clientWidth+1)return [index+': clipped discount'];const badge=teaser.getBoundingClientRect(),price=pill.getBoundingClientRect();if(badge.right>price.left-7)return [index+': discount overlaps price'];if(Math.abs((badge.top+badge.bottom-price.top-price.bottom)/2)>1)return [index+': discount is not beside price'];}}
     if([...pill.querySelectorAll('.catalog-card-price-amount, .catalog-card-price-request, .catalog-card-price-pill > span:last-child > span:last-child')].some(v=>{const b=v.getBoundingClientRect(),p=pill.getBoundingClientRect();return b.bottom>p.bottom+1||b.right>p.right+1}))return [index+': hidden amount/currency'];
    }
    if(p&&p.getBoundingClientRect().right>r.right+1)return [index+': price overflow'];
    return c.scrollWidth>c.clientWidth+1?[index+': card overflow']:[];
   });
   const first=cards[0],face=first.querySelector('.catalog-card-face-front'),name=first.querySelector('.catalog-card-name'),actions=first.querySelector('.catalog-card-actions');
   return{issues,spacing:{padding:getComputedStyle(face).padding,titleSize:getComputedStyle(name).fontSize,titleWeight:getComputedStyle(name).fontWeight,actionsHeight:actions.getBoundingClientRect().height}};
  });
  allIssues.push(...result.issues.map(issue=>`${touch?"touch":"desktop"}/${width}px ${issue}`));
  if(process.env.CATALOG_CARD_SCREENSHOTS==='1'&&[320,390,1024,1440,2560].includes(width)){
   mkdirSync('output/catalog-card',{recursive:true});await page.screenshot({path:`output/catalog-card/cards-${touch?"touch":"desktop"}-${width}.png`});console.log({width,touch,...result});
  }
 }
 await page.close();
 }
 assert.deepEqual(allIssues,[]);
 console.log('PASS actual product cards: long titles/articles/prices, guest/admin controls, discount, cart, backorder at 320–3840px; amounts and actions fit.');
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));stop()}
