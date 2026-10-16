import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzeNowOpportunity as baseline} from './fixtures/sentinel-video-production-now-engine.mjs';
import {analyzeNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {causalPatternDirection} from '../sentinel-trading-lab/agent/src/core/causal-pattern-direction.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {compareRows} from '../scripts/sentinel-video-consistency-compare.mjs';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/sentinel-user-video-20261016.json',import.meta.url)));
const rows=fixture.quoteHistory;
function at(time,overrides={}){
 const ts=Date.parse('2026-10-16T'+time+'-03:00'),q=rows.find(x=>x.ts===ts);
 assert.ok(q,'observed video frame exists');
 return {quoteHistory:rows.filter(x=>x.ts<=ts),price:q.price,quoteAt:ts,now:ts,
  durationMs:30000,engineId:'fibonacci_retest',qualityPolicy:'adaptive-market-v17',...overrides};
}
test('video fixture retains actual missing observations and rounded-price limitations',()=>{
 assert.equal(rows.length,542);
 assert.equal(fixture.priceResolution,.00001);
 assert.match(fixture.limitations.join(' '),/not raw broker ticks/);
 assert.ok(rows.every((x,i)=>x.ts===x.receivedAt&&x.price>0&&(!i||x.ts>rows[i-1].ts)));
 assert.ok(rows.some((x,i)=>i&&x.ts-rows[i-1].ts>10000),'do not interpolate the scrolled-off quote');
});
test('reproduces the two wrong historical overrides in the video and declines incomparable analogues',()=>{
 for(const [time,oldSide] of [['13:55:53','PUT'],['13:57:29','CALL']]){
  const input=at(time),old=baseline(input),next=analyzeNowOpportunity(input);
  assert.equal(old.side,oldSide);assert.equal(old.reason,'causal-expiry-analogue');
  const end=rows.find(q=>q.ts===input.now+30000);
  assert.ok(end);assert.notEqual(end.price,input.price);
  assert.notEqual(end.price>input.price?'CALL':'PUT',oldSide);
  assert.equal(causalPatternDirection(input).reason,'no-comparable-current-trajectory');
  assert.equal(next.ready,false);assert.equal(next.side,null);
 }
});
test('the retained analogue base preserves favorable PUT evidence before the 13.9.24 expiry projection',()=>{
 for(const time of ['13:53:20','13:54:52']){
  // This checks the unchanged 13.9.23 learner. The final v17 direction now
  // uses the separately tested 30s projection and can override this evidence.
  const input=at(time),a=analyzeNowOpportunity({...input,qualityPolicy:'adaptive-market-v1'});
  assert.equal(a.side,'PUT');assert.equal(a.ready,true);
  assert.equal(a.observedAt,input.quoteAt);assert.equal(a.entryPrice,input.price);
  assert.ok(rows.find(q=>q.ts===input.now+30000).price<input.price);
 }
});
test('the historical learner cannot authorize an expired or mismatched live quote',()=>{
 const input=at('13:54:52');
 assert.equal(causalPatternDirection({...input,now:input.now+3000}).ready,false);
 assert.equal(analyzeNowOpportunity({...input,now:input.now+3000}).ready,false);
 assert.equal(causalPatternDirection({...input,price:input.price+.001}).ready,false);
 assert.equal(causalPatternDirection({...input,quoteAt:input.now+1000}).ready,false);
});
test('unseen future observations and future arrivals never influence the current decision',()=>{
 for(const time of ['13:53:20','13:54:52','13:55:53','13:57:29']){
  const input=at(time),expected=analyzeNowOpportunity(input);
  const contaminated=[...input.quoteHistory,...rows.filter(q=>q.ts>input.now),
   {ts:input.now-500,receivedAt:input.now+1000,price:100}];
  assert.deepEqual(analyzeNowOpportunity({...input,quoteHistory:contaminated}),expected);
 }
});
test('the common decision remains scale-invariant and symmetric for upward/downward charts',()=>{
 for(const time of ['13:53:20','13:54:52','13:55:53','13:57:29']){
  const input=at(time),original=analyzeNowOpportunity(input);
  for(const transform of [p=>p*1000,p=>1/p]){
   const q=input.quoteHistory.map(q=>({...q,price:transform(q.price)}));
   const r=analyzeNowOpportunity({...input,quoteHistory:q,price:q.at(-1).price});
   assert.equal(r.ready,original.ready);
   if(original.side)assert.equal(r.side,transform(2)>transform(1)?original.side:
    original.side==='CALL'?'PUT':'CALL');
  }
 }
});
test('5s, 10s, 15s and 60s policies remain identical to the pinned production module',()=>{
 for(const durationMs of [5000,10000,15000,60000]){
  for(const time of ['13:53:20','13:54:52','13:55:53','13:57:29']){
   const input=at(time,{durationMs});
   assert.deepEqual(analyzeNowOpportunity(input),baseline(input));
  }
 }
});
test('every visible strategy receives the same corrected common base',()=>{
 for(const time of ['13:54:52','13:55:53','13:57:29']){
  const input=at(time),common=analyzeNowOpportunity(input);
  for(const engineId of ['automatic','trend','fibonacci_retest','support_resistance','smart_confluence']){
   const result=analyzeNowOpportunity({...input,engineId});
   assert.equal(result.ready,common.ready);assert.equal(result.side,common.side);
  }
 }
});
test('runtime emits exactly the replayed entries and preserves one signal throughout each 30s expiry',()=>{
 const runtime=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
 const settings={...runtime.settings,engine:'fibonacci_retest',asset:'EUR/GBP OTC',orderDurationMs:30000};
 const actual=[];
 for(let i=0;i<rows.length;i++){
  const q=rows[i],history=rows.slice(0,i+1);
  const snap={provider:'iq_option',quoteHistory:history,quoteTs:q.ts,price:q.price,
   brokerExpirationDurationMs:null,brokerExpirationConfidence:0};
  const v=runtime._signalValidationGate({analysis:{asset:settings.asset},snap,settings,now:q.ts}).analysis.vnext;
  if(v.futureEntryAnchor?.entryReadyNow)actual.push({at:q.ts,side:v.futureEntryAnchor.side});
  if(actual.length>1)assert.ok(actual.at(-1).at>=actual.at(-2).at+30000);
 }
 const expected=compareRows(rows).candidate.entries.map(({at,side})=>({at,side}));
 assert.deepEqual(actual,expected);
});
