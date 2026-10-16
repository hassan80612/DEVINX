import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzeNowOpportunity as before} from './fixtures/sentinel-13923-now-engine.mjs';
import {analyzeNowOpportunity as after,advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const fixture=file=>JSON.parse(readFileSync(new URL('./fixtures/'+file,import.meta.url))).quoteHistory;
const fine=fixture('sentinel-user-video-broker-6dp-20261016.json');
const coarse=fixture('sentinel-user-video-20261016.json');
const inputFor=(rows,i,overrides={})=>({quoteHistory:rows.slice(0,i+1),price:rows[i].price,quoteAt:rows[i].ts,
 now:rows[i].ts,durationMs:30000,engineId:'automatic',qualityPolicy:'adaptive-market-v17',...overrides});
function replay(rows,analyze){
 let state=null;const entries=[];
 for(let i=0;i<rows.length;i++){
  const input=inputFor(rows,i),choice=analyze(input);
  const next=advanceNowOpportunity({previous:state,candidate:choice,now:input.now,quoteAt:input.quoteAt,
   engineId:'automatic',asset:'EUR/GBP OTC',durationMs:30000});
  if(next.phase==='fired'&&next.entryTriggeredAt!==state?.entryTriggeredAt){
   const exit=rows.find(q=>q.ts>=next.exitAt&&q.ts<=next.exitAt+1000);
   const outcome=!exit?'unknown':exit.price===next.entryPrice?'ties':(exit.price>next.entryPrice?'CALL':'PUT')===next.side?'wins':'losses';
   entries.push({at:next.entryAt,side:next.side,outcome});
  }
  state=next;
 }
 return entries;
}
test('13.9.24 preserves every admission and observed entry price from 13.9.23',()=>{
 for(const rows of [fine,coarse])for(let i=0;i<rows.length;i++){
  const input=inputFor(rows,i),old=before(input),next=after(input);
  assert.equal(next.ready,old.ready);
  assert.equal(next.observedAt,old.observedAt);assert.equal(next.entryPrice,old.entryPrice);
 }
});
test('released projection reproduces the preserved advance at the same entry instants',()=>{
 for(const [rows,expectedOld,expectedNew]of [[fine,[9,5,1],[10,4,1]],[coarse,[7,6,1],[10,3,1]]]){
  const old=replay(rows,before),next=replay(rows,after);
  assert.deepEqual(next.map(e=>e.at),old.map(e=>e.at));
  const counts=es=>['wins','losses','unknown'].map(o=>es.filter(e=>e.outcome===o).length);
  assert.deepEqual(counts(old),expectedOld);assert.deepEqual(counts(next),expectedNew);
 }
});
test('the exact candidate also retains its documented adverse alternative entry at 13:53:20',()=>{
 const t=Date.parse('2026-10-16T13:53:20-03:00'),i=coarse.findIndex(q=>q.ts===t);
 const input=inputFor(coarse,i),exit=coarse.find(q=>q.ts===t+30000);
 assert.equal(before(input).side,'PUT');assert.equal(after(input).side,'CALL');
 assert.ok(exit.price<input.price); // A known loss, not hidden by aggregate gains.
});
test('5s, 10s, 15s and 60s decisions remain byte-for-byte identical to 13.9.23',()=>{
 for(const durationMs of [5000,10000,15000,60000])for(const i of [200,400,650,950]){
  const input=inputFor(fine,i,{durationMs});assert.deepEqual(after(input),before(input));
 }
});
test('future prices and observations received after the decision cannot alter it',()=>{
 for(const i of [200,400,650,950]){
  const input=inputFor(fine,i),polluted={...input,quoteHistory:[...fine,{ts:input.now-100,receivedAt:input.now+1000,price:99}]};
  assert.deepEqual(after(input),after(polluted));
 }
});
test('all visible strategies share the same direction and admission at 30s',()=>{
 for(const i of [200,400,650,950]){
  const input=inputFor(fine,i),base=after(input);
  for(const engineId of ['trend','fibonacci_retest','support_resistance','smart_confluence']){
   const next=after({...input,engineId});assert.equal(next.side,base.side);assert.equal(next.ready,base.ready);
  }
 }
});
test('actual runtime ingestion emits the same calls and holds one direction throughout each 30s operation',()=>{
 const runtime=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
 const settings={...runtime.settings,engine:'automatic',asset:'EUR/GBP OTC',orderDurationMs:30000};
 runtime.settings=settings;const entries=[];let prior=null;
 for(let i=0;i<fine.length;i++){
  const q=fine[i];
  runtime.setExternalMarket({provider:'iq_option',symbol:settings.asset,quoteHistory:fine.slice(0,i+1),
   quote:q.price,quoteTs:q.ts,feedValidated:true,quoteFeedValidated:true,analysisFeedValidated:true});
  const snap=runtime._marketSnapshot();
  const r=runtime._signalValidationGate({analysis:{asset:settings.asset},snap,settings,now:q.ts}).analysis.vnext.futureEntryAnchor;
  if(r?.entryReadyNow)entries.push({at:q.ts,side:r.side});
  if(prior?.phase==='fired'&&q.ts<prior.exitAt){assert.equal(r.side,prior.side);assert.equal(r.exitAt,prior.exitAt);}
  prior=r;
 }
 assert.deepEqual(entries,replay(fine,after).map(({at,side})=>({at,side})));
});
