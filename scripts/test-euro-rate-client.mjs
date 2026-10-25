import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const makeStorage=()=>{const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key),clear:()=>data.clear()}};
const sessionStorage=makeStorage(),localStorage=makeStorage();
const exports={};let requests=0,finish;
const browserWindow={sessionStorage,localStorage};
vm.runInNewContext(ts.transpileModule(readFileSync('app/lib/euro-rate-client.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
 exports,window:browserWindow,fetch:()=>{requests++;return new Promise(resolve=>{finish=resolve})},
});
const first=exports.loadEuroRate(),second=exports.loadEuroRate();
assert.equal(requests,1,'Concurrent price consumers share a single currency request');
assert.equal(first,second);
finish({ok:true,json:async()=>({rate:51.25})});
assert.equal(await first,51.25);assert.equal(await second,51.25);
assert.equal(await exports.loadEuroRate(),51.25);assert.equal(requests,1,'Warm rate uses cache');
sessionStorage.clear();assert.equal(await exports.loadEuroRate(),51.25,'Local cache survives a fresh session');
localStorage.clear();
const invalid=exports.loadEuroRate();finish({ok:true,json:async()=>({rate:0})});assert.equal(await invalid,null,'Never accept a zero conversion rate');
const retry=exports.loadEuroRate();assert.equal(requests,3,'A failed result can retry');finish({ok:true,json:async()=>({rate:52})});assert.equal(await retry,52);
for(const storage of [sessionStorage,localStorage])storage.setItem('partson:v1:euro-rate',JSON.stringify({rate:1,t:Date.now()-31*60*1000}));
assert.equal(exports.readCachedEuroRate(),null,'Expired currency must not be reused');
Object.defineProperty(browserWindow,'sessionStorage',{get(){throw new Error('Storage blocked')}});
Object.defineProperty(browserWindow,'localStorage',{get(){throw new Error('Storage blocked')}});
const privateMode=exports.loadEuroRate();finish({ok:true,json:async()=>({rate:53})});assert.equal(await privateMode,53,'Blocked storage cannot prevent prices loading');
console.log('Currency loading passed: shared request, warm cache, session fallback, invalid rate, retry and expiry.');
