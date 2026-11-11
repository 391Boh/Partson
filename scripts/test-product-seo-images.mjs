import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { build } from 'esbuild';
import sharp from 'sharp';

const modules=new Map();
function load(file){file=path.resolve(file);if(modules.has(file))return modules.get(file);const exports={};modules.set(file,exports);vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,URL,URLSearchParams,require:name=>load((name.startsWith('app/')?path.resolve(name):path.resolve(path.dirname(file),name))+'.ts')});return exports;}
const {buildProductSeoImages:images}=load('app/lib/product-seo-images.ts');
const product={code:'00-00000056',article:'AD030213',name:'Трос гальма AUDI',producer:'Adriauto'};
const options={siteUrl:'https://partson.shop',product,label:'Трос гальма AUDI',hasCatalogPhoto:true};
const result=images({...options,gallery:['/product-gallery/second.webp','/partson-mark-v3.webp','javascript:bad','//other.example/bad','/product-gallery/second.webp']});
const {buildProductPhotoPath:photoPath}=load('app/lib/product-image-variant-path.ts');const {buildProductPath:pagePath}=load('app/lib/product-url.ts');
assert.equal(result.primary,`https://partson.shop${photoPath(product)}`);assert(!/[?&](iv|fallback|retry|catalog)=/.test(result.primary),'No cache or recovery parameters in the stable URL');
assert.equal(photoPath(product).split('/photo/')[1].split('.webp')[0],pagePath(product).split('/').pop(),'Photo is named like its product page');assert.equal(result.images.length,5);assert(result.images.some(url=>url.includes('/1x1/')));assert(result.images.some(url=>url.includes('/4x3/')));assert(result.images.some(url=>url.includes('/16x9/')));assert(result.images.every(url=>url.startsWith('https://partson.shop/')));
assert.equal(images({...options,hasCatalogPhoto:false,gallery:['/product-gallery/only.webp']}).primary,'https://partson.shop/product-gallery/only.webp','A confirmed gallery photo can be the main photo without a 1C primary');
assert.equal(images({...options,hasCatalogPhoto:false,gallery:['/partson-mark-v3.webp','data:image/png;base64,abc']}).images.length,0,'No logos or unsupported embedded images in Product markup');

const source={status:200,buffer:await sharp({create:{width:300,height:600,channels:3,background:'#e33c31'}}).png().toBuffer(),type:'image/png'};
globalThis.productSeoImageFixture=source;
const root=await mkdtemp(path.join(tmpdir(),'partson-image-variant-'));const outfile=path.join(root,'route.cjs');
await build({entryPoints:['app/product-image/[code]/[ratio]/[file]/route.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',outfile,plugins:[{name:'fake-primary-image',setup(b){b.onResolve({filter:/^app\/product-image\/\[code\]\/route$/},()=>({path:'primary',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:`export const GET=async()=>{const t=globalThis.productSeoImageFixture;return new Response(t.status===200?t.buffer:null,{status:t.status,headers:{'content-type':t.type}})};`}))}}]});
// The bundled route lives in /tmp; point its external sharp import at the repository.
const require=createRequire(path.join(process.cwd(),'package.json'));const routeCode=readFileSync(outfile,'utf8').replace('require("sharp")',`require(${JSON.stringify(require.resolve('sharp'))})`);const routeModule={exports:{}};new Function('require','module','exports',routeCode)(require,routeModule,routeModule.exports);const exp=routeModule.exports;
const request=(ratio,headers={})=>new Request(`https://partson.shop/product-image/TEST/${ratio}/test.webp`,{headers});
const context=(ratio,code='TEST')=>({params:Promise.resolve({code,ratio,file:'test.webp'})});
for(const [ratio,aspect] of [['1x1',1],['4x3',4/3],['16x9',16/9]]){
  const [a,b]=await Promise.all([exp.GET(request(ratio),context(ratio)),exp.GET(request(ratio),context(ratio))]);assert.equal(a.status,200);assert.equal(a.headers.get('content-type'),'image/webp');assert.equal(a.headers.get('etag'),b.headers.get('etag'));
  const buffer=Buffer.from(await a.arrayBuffer());const m=await sharp(buffer).metadata();assert(Math.abs(m.width/m.height-aspect)<0.003);assert.equal(m.height,600,'Portrait photo is preserved with surrounding canvas, not cropped');
  assert.equal((await exp.GET(request(ratio,{'If-None-Match':a.headers.get('etag')}),context(ratio))).status,304);
}
const asPhoto=await exp.GET(request('photo'),context('photo'));assert.equal(asPhoto.status,200);assert.equal(asPhoto.headers.get('content-type'),'image/webp');{const m=await sharp(Buffer.from(await asPhoto.arrayBuffer())).metadata();assert.equal(m.width,300);assert.equal(m.height,600,'The photo kind keeps the original shape');}
const webpSource=await sharp({create:{width:320,height:200,channels:3,background:'#2a7'}}).webp().toBuffer();const png=source.buffer;source.buffer=webpSource;source.type='image/webp';
assert.deepEqual(Buffer.from(await (await exp.GET(request('photo'),context('photo'))).arrayBuffer()),webpSource,'A WebP primary photo passes through unchanged');source.buffer=png;source.type='image/png';
const original=await exp.GET(request('1x1'),context('1x1'));const etag=original.headers.get('etag');
source.status=503;const transient=await exp.GET(request('1x1'),context('1x1'));assert.equal(transient.status,503,'A source outage never becomes a cached 404');assert.equal(transient.headers.get('cache-control'),'no-store');
source.status=404;assert.equal((await exp.GET(request('1x1'),context('1x1'))).status,404);
source.status=200;source.buffer=await sharp({create:{width:300,height:600,channels:3,background:'#126db5'}}).png().toBuffer();const changed=await exp.GET(request('1x1',{'If-None-Match':etag}),context('1x1'));assert.equal(changed.status,200);assert.notEqual(changed.headers.get('etag'),etag,'A photo replacement cannot reuse an old variant');
source.buffer=Buffer.from('broken');assert.equal((await exp.GET(request('1x1'),context('1x1'))).status,503);
assert.equal((await exp.GET(request('__proto__'),context('__proto__'))).status,404);assert.equal((await exp.GET(request('1x1'),context('1x1','%ZZ'))).status,404);
console.log('PASS product images: stable named photo URL, real photos, 1:1/4:3/16:9, gallery-only primary, no fake logo, portrait preservation, shared variants, ETag, upload freshness and transient 503 recovery');
