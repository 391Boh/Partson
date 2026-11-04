// Real batch client, controlled network: a slow chunk must not delay ready photos.
import assert from 'node:assert/strict';
import {build,stop} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
const directory=await mkdtemp(path.join(process.cwd(),'.cache/image-progress-'));
const previousWindow=globalThis.window,previousFetch=globalThis.fetch;
const storage=()=>{const data=new Map();return{get length(){return data.size},key:i=>[...data.keys()][i],getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}};
const timers=new Set();
globalThis.window={setTimeout:(fn,ms)=>{const id=setTimeout(fn,ms);timers.add(id);return id},clearTimeout:(id)=>{timers.delete(id);clearTimeout(id)},sessionStorage:storage(),localStorage:storage()};
const tick=()=>new Promise(r=>setImmediate(r));
const waitUntil=async predicate=>{for(let n=0;n<200;n++){if(predicate())return;await tick()}assert(predicate(),'Controlled operation did not settle')};
const items=(prefix,count)=>Array.from({length:count},(_,i)=>({code:prefix+i,article:'A'+i,hasPhoto:true}));
const ready=item=>({...item,key:`${item.code.toLowerCase()}::${item.article.toLowerCase()}`,status:'ready',src:`/product-image/${item.code}?catalog=1`});
const pending=[],calls=[];let active=0,maxActive=0;
globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);active++;maxActive=Math.max(maxActive,active);calls.push(body);return new Promise((resolve,reject)=>pending.push({body,finish:(status=200)=>{active--;resolve({ok:status===200,status,json:async()=>({items:body.items.map(ready)})})},reject}));};
const drain=async()=>{for(let n=0;n<30;n++){pending.splice(0).forEach(p=>p.finish());await tick();if(!pending.length&&active===0)return}assert.fail('Queue did not drain')};
try{
 const outfile=path.join(directory,'batch.cjs');await build({entryPoints:['app/lib/product-image-batch-client.ts'],bundle:true,platform:'node',format:'cjs',outfile});
 const api=createRequire(import.meta.url)(outfile),all=items('PROGRESS-',12),progress=[];
 let settled=false;const initial=api.fetchCatalogImageBatch(all,{onProgress:r=>progress.push(...r)}).then(r=>{settled=true;return r});
 await waitUntil(()=>pending.length===3);assert(calls.every(c=>c.items.length<=4));
 const slow=pending.splice(1,1)[0];pending.splice(0).forEach(p=>p.finish());
 await waitUntil(()=>progress.length===8);assert.equal(settled,false,'Ready photos arrive before the slow chunk');
 const abort=new AbortController(),joinedProgress=[];
 const joined=api.fetchCatalogImageBatch(all,{signal:abort.signal,onProgress:r=>joinedProgress.push(...r)});
 await waitUntil(()=>joinedProgress.length===8);assert.equal(calls.length,3,'Overlapping callers share cached and pending work');
 abort.abort();slow.finish();assert.equal((await initial).length,12);assert.equal((await joined).length,12);assert.equal(joinedProgress.length,8,'Aborted subscriber stops receiving updates without cancelling shared work');
 const repeat=[];assert.equal((await api.fetchCatalogImageBatch(all,{onProgress:r=>repeat.push(...r)})).length,12);assert.equal(repeat.length,12);assert.equal(calls.length,3,'Ready images are cached immediately');
 const queuedA=api.fetchCatalogImageBatch(items('QUEUE-A-',24));const queuedB=api.fetchCatalogImageBatch(items('QUEUE-B-',24));
 await waitUntil(()=>pending.length===3);await drain();assert.equal((await queuedA).length,24);assert.equal((await queuedB).length,24);assert.equal(maxActive,3,'Global concurrency limit applies across callers');
 const retryItems=items('RETRY-',8),partial=api.fetchCatalogImageBatch(retryItems);
 await waitUntil(()=>pending.length===2);pending.shift().finish();pending.shift().finish(503);
 assert.equal((await partial).length,4,'A failed chunk preserves successful siblings');
 const beforeRetry=calls.length;const retried=api.fetchCatalogImageBatch(retryItems);await waitUntil(()=>pending.length===1);assert.equal(calls.length,beforeRetry+1);assert(calls.at(-1).items.every(i=>Number(i.code.split('-').at(-1))>=4),'Only failed items are retried');pending.shift().finish();assert.equal((await retried).length,8);
 console.log('PASS image progress: 8/12 photos resolve before slow chunk; overlap, cache, subscriber abort, global concurrency 3, partial failure and retry.');
}finally{for(const id of timers)clearTimeout(id);globalThis.window=previousWindow;globalThis.fetch=previousFetch;await rm(directory,{recursive:true,force:true});stop()}
