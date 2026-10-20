import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzeNowOpportunity as before} from './fixtures/sentinel-13923-now-engine.mjs';
import {analyzeNowOpportunity as after,advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {CompletedExpiryDirection} from '../sentinel-trading-lab/agent/src/core/completed-expiry-direction.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const fixture=file=>JSON.parse(readFileSync(new URL('./fixtures/'+file,import.meta.url))).quoteHistory;
const fine=fixture('sentinel-user-video-broker-6dp-20261016.json');
const coarse=fixture('sentinel-user-video-20261016.json');
const inputFor=(rows,i,overrides={})=>({quoteHistory:rows.slice(0,i+1),price:rows[i].price,quoteAt:rows[i].ts,
 now:rows[i].ts,durationMs:30000,engineId:'automatic',qualityPolicy:'adaptive-market-v17',...overrides});
function replay(rows,analyze,{selector=null}={}){
 let state=null;const entries=[];
 for(let i=0;i<rows.length;i++){
  const input=inputFor(rows,i);
  if(selector){input.expiryDirectionSelector=selector;input.expiryDirectionContext='iq_option|EUR/GBP OTC|30000';}
  const choice=analyze(input);
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
test('13.9.59 only admits decisions from actually observed quotes; an old unqualified setup stays unqualified',()=>{
 for(const rows of [fine,coarse])for(let i=0;i<rows.length;i++){
  const input=inputFor(rows,i),old=before(input),next=after(input);
  if(!old.ready)assert.equal(next.ready,false);
  if(next.ready){
   assert.equal(next.observedAt,input.quoteAt);
   assert.equal(next.entryPrice,input.price);
   assert.ok(['CALL','PUT'].includes(next.side));
  }
 }
});
test('candidate A/B replay reports confirmed 30s outcomes without forcing identical old entry timestamps',()=>{
 for(const [name,rows] of [['fine',fine],['coarse',coarse]]){
  const old=replay(rows,before),next=replay(rows,after);
  const counts=es=>Object.fromEntries(['wins','losses','unknown','ties'].map(o=>[o,es.filter(e=>e.outcome===o).length]));
  console.log('sentinel-13959-reference-replay',JSON.stringify({name,old:counts(old),candidate:counts(next)}));
  assert.ok(next.length>0);
  for(let i=1;i<next.length;i++)assert.ok(next[i].at-next[i-1].at>=30000);
  assert.ok(next.every(e=>['CALL','PUT'].includes(e.side)&&['wins','losses','unknown','ties'].includes(e.outcome)));
 }
});
test('the candidate reports the earlier known adverse entry honestly, including a decision to WAIT',()=>{
 const t=Date.parse('2026-10-16T13:53:20-03:00'),i=coarse.findIndex(q=>q.ts===t);
 const input=inputFor(coarse,i),exit=coarse.find(q=>q.ts===t+30000);
 assert.equal(before(input).side,'PUT');
 assert.ok(exit.price<input.price);
 const current=after(input);
 console.log('sentinel-13959-known-adverse-setup',JSON.stringify({old:'PUT',candidate:current.side,ready:current.ready,reason:current.reason,actual:'PUT'}));
 if(current.ready)assert.equal(current.entryPrice,input.price);
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
test('selected 30s specialists have their own evidence; do not force the automatic side',()=>{
 for(const i of [200,400,650,950]){
  const input=inputFor(fine,i);
  for(const engineId of ['trend','fibonacci_retest','support_resistance','smart_confluence']){
   const chosen=after({...input,engineId});
   assert.equal(chosen.contextStrategy,engineId);
   assert.equal(chosen.signalOwner,'selected-specialist');
   if(chosen.ready)assert.ok(['CALL','PUT'].includes(chosen.side));
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
 const selected=replay(fine,after,{selector:new CompletedExpiryDirection()});
 console.log('sentinel-13959-real-runtime-replay',JSON.stringify({entries:selected.length,
  wins:selected.filter(e=>e.outcome==='wins').length,
  losses:selected.filter(e=>e.outcome==='losses').length,
  unknown:selected.filter(e=>e.outcome==='unknown').length}));
 assert.deepEqual(entries,selected.map(({at,side})=>({at,side})));
});
