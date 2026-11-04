import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync('app/components/catalog/useCatalogData.ts','utf8');
const ast=ts.createSourceFile('catalog.ts',source,ts.ScriptTarget.Latest,true);
let effect;
function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useEffect'&&node.arguments[0]?.getText(ast).includes('const loadRate = async'))effect=node.arguments[0].getText(ast);ts.forEachChild(node,visit)}visit(ast);
assert(effect);
const compiled=ts.transpileModule('exports.effect='+effect,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve()};
function fixture(rates,initial=null){
 let rate=initial??45,ready=initial!==null,calls=0,cached=null,sequence=0;const timers=new Map(),delays=[];
 const context={exports:{},initialEuroRate:initial,writeCachedEuroRate:v=>cached=v,
  loadSharedEuroRate:async()=>{calls++;return await rates.shift()},
  setEuroRate:update=>rate=update(rate),setEuroRateReady:v=>ready=v,
  window:{setTimeout(fn,delay){delays.push(delay);timers.set(++sequence,fn);return sequence},clearTimeout(id){timers.delete(id)}}};
 vm.runInNewContext(compiled,context);const cleanup=context.exports.effect();
 return{cleanup,timers,delays,get rate(){return rate},get ready(){return ready},get calls(){return calls},get cached(){return cached}};
}
const retry=fixture([null,47.5]);await tick();
assert.equal(retry.ready,false,'A failed rate must not expose the placeholder conversion');
assert.equal(retry.delays[0],1500);
const [id,run]=retry.timers.entries().next().value;retry.timers.delete(id);run();await tick();
assert.equal(retry.ready,true);assert.equal(retry.rate,47.5);assert.equal(retry.calls,2);retry.cleanup();
const server=fixture([],46);assert.equal(server.cached,46);assert.equal(server.calls,0,'Confirmed SSR rate avoids another network request');server.cleanup?.();
let finish;const pending=new Promise(resolve=>finish=resolve);const cancelled=fixture([pending]);cancelled.cleanup();finish(48);await tick();assert.equal(cancelled.ready,false,'Late rate after unmount cannot update cards');assert.equal(cancelled.timers.size,0);
const failed=fixture([null]);await tick();assert.equal(failed.timers.size,1);failed.cleanup();assert.equal(failed.timers.size,0,'Unmount cancels currency retries');
console.log('PASS catalog currency: confirmed SSR/cached rate, retry after failure, no fabricated conversion, unmount cleanup');
