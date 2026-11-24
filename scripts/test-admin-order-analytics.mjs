import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const NOW=Date.parse('2026-11-24T10:00:00Z');
class Clock extends Date { constructor(...args){super(...(args.length?args:[NOW]));} static now(){return NOW;} }
const records=[];const loads=[];let allowed=true;let fail=false;
const cache=new Map();
function compile(path){
  if(cache.has(path))return cache.get(path);
  const exports={};cache.set(path,exports);
  const source=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(source,{exports,Date:Clock,Intl,URL,URLSearchParams,console,Object,require: name=>{
    if(name==='server-only')return {};
    if(name==='next/server')return {NextResponse:{json:(data,options)=>({data,status:options?.status||200,headers:options?.headers})}};
    if(name==='app/api/_lib/admin-auth')return {verifyAdminRequest:async request=>request.admin?{uid:'admin'}:null};
    if(name==='app/api/_lib/rateLimit')return {checkRateLimit:()=>({ok:allowed})};
    if(name==='firebase-admin/firestore')return {Timestamp:{fromMillis:value=>value}};
    if(name==='app/lib/firebase-admin'){
      const countQuery=count=>({count:()=>({get:async()=>({data:()=>({count})})})});
      const calls={...countQuery(3),where:()=>countQuery(1)};
      return {getFirebaseAdminDb:()=>({collection:()=>calls})};
    }
    if(name==='app/lib/admin-orders-query'){
      const actual=compile('app/lib/admin-orders-query.ts');return {...actual,loadOrdersInRange:async(from,to,max)=>{
        loads.push({from,to,max});if(fail)throw new Error('Offline');return records.filter(o=>o.createdAtMs>=from&&o.createdAtMs<to).sort((a,b)=>b.createdAtMs-a.createdAtMs).slice(0,max);
      }};
    }
    if(name.startsWith('app/'))return compile(name+'.ts');
    if(name==='./order-status')return compile('app/lib/order-status.ts');
    throw new Error('Unexpected import '+name);
  }},{filename:path});return exports;
}
const analytics=compile('app/lib/admin-order-analytics.ts');
const days=compile('app/lib/admin-orders-query.ts');
assert.equal(analytics.validAnalyticsDay('2026-02-30'),false);
assert.equal(analytics.validAnalyticsDay('2024-02-29'),true);
assert.equal(analytics.shiftAnalyticsDay('2026-03-01',-1),'2026-02-28');
assert.equal(analytics.analyticsDaysBetween('2026-10-24','2026-10-26'),3);
assert.equal(days.kyivDayStartMs('2026-10-26')-days.kyivDayStartMs('2026-10-25'),25*3600000,'Kyiv DST end is a 25-hour calendar day');
const row=(id,day,extra={})=>({id,createdAtMs:days.kyivDayStartMs(day)+3600000,totalAmount:100,name:'Олена',phone:'+380671234567',status:'new',cartItems:[{code:'p1',name:'Фільтр',quantity:2,price:50}],...extra});
records.push(row('a','2026-11-24',{paymentStatus:'paid',totalAmount:200}),row('b','2026-11-24',{status:'cancelled',totalAmount:900}),row('c','2026-11-24',{status:'completed',totalAmount:300,paymentStatus:'pending'}),row('previous','2026-11-23',{totalAmount:50}));
const totals=analytics.summarizeOrderValues(records.slice(0,3));
assert.equal(totals.revenue,500);assert.equal(totals.orders,2);assert.equal(totals.avg,250);assert.equal(totals.cancelled,1);assert.equal(totals.paidRevenue,200);assert.equal(totals.completed,1);
assert.equal(analytics.matchesOrderAnalysis(records[0],{phone:'0671234567'}),true);
assert.equal(analytics.matchesOrderAnalysis(records[0],{product:'p'}),false);
assert.equal(analytics.matchesOrderAnalysis(records[1],{payment:'cod'}),false);
const api=compile('app/api/admin/orders/analysis/route.ts');
const get=(query,admin=true)=>api.GET({admin,nextUrl:new URL('http://offline?'+query)});
assert.equal((await get('from=2026-11-24&to=2026-11-24',false)).status,403);assert.equal(loads.length,0);
for(const query of ['from=2026-02-30&to=2026-11-24','from=2026-11-25&to=2026-11-24','from=2026-01-01&to=2026-11-24','from=2026-11-24&to=2026-11-24&payment=__proto__','from=2026-11-24&to=2026-11-24&offset=-1','from=2026-11-24&to=2026-11-24&status=bad'])assert.equal((await get(query)).status,400,query);
allowed=false;assert.equal((await get('from=2026-11-24&to=2026-11-24')).status,429);allowed=true;
const result=await get('from=2026-11-24&to=2026-11-24');
assert.equal(result.status,200);assert.equal(result.headers['Cache-Control'],'private, no-store');
assert.equal(result.data.total,3);assert.equal(result.data.totals.revenue,500);assert.equal(result.data.previous.totals.revenue,50);
assert.equal(result.data.previous.from,'2026-11-23');assert.equal(result.data.rows[0].phone,'+380671234567');assert.equal(result.data.statusCounts.cancelled,1);
const paid=await get('from=2026-11-24&to=2026-11-24&payment=paid');assert.equal(paid.data.total,1);assert.equal(paid.data.rows[0].id,'a');assert.equal(paid.data.previous.totals.orders,0);
const product=await get('from=2026-11-24&to=2026-11-24&product=p1');assert.equal(product.data.total,2,'Product total excludes cancellations, like top products');
for(let i=0;i<33;i++)records.push(row('page-'+i,'2026-11-24'));
const first=await get('from=2026-11-24&to=2026-11-24');assert.equal(first.data.rows.length,30);assert.equal(first.data.hasMore,true);
const second=await get('from=2026-11-24&to=2026-11-24&offset=30');assert.equal(second.data.rows.length,6);assert.equal(second.data.hasMore,false);assert(!second.data.rows.some(row=>first.data.rows.some(before=>before.id===row.id)));
const summary=compile('app/api/admin/orders/summary/route.ts');
const report=await summary.GET({admin:true,nextUrl:new URL('http://offline?refresh=1')});
assert.equal(report.data.series.length,30);assert.equal(report.data.previous.today.revenue,50);assert.equal(report.data.periods.today.cancelled,1);
assert.equal(report.data.openCalls,2);assert.equal(report.data.series.at(-1).day,'2026-11-24');
fail=true;const oldError=console.error;console.error=()=>{};try{assert.equal((await get('from=2026-11-24&to=2026-11-24')).status,503);}finally{console.error=oldError;}
console.log('Admin analytics passed: authorization, validation, private responses, true totals, cancellations, payment/product/phone filters, previous periods, pagination, Kyiv DST, 30-day chart and failure handling.');
