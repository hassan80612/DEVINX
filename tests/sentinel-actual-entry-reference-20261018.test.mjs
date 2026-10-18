import test from 'node:test';
import assert from 'node:assert/strict';
import {thirtySecondCycleForecast as released} from '../sentinel-trading-lab/agent/src/core/thirty-second-expiry-direction.mjs';
import {actualEntryReferenceRuntime} from '../experiments/actual-entry-reference-runtime-20261018.mjs';
import {readFileSync} from 'node:fs';
import {DemoTradingRuntime as BaseRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const candidate=await actualEntryReferenceRuntime();
test.after(()=>candidate.cleanup());
const T=1792364400000;
function history(sign=1,shock=.001){
 return Array.from({length:181},(_,i)=>({ts:T+(i-180)*1000,receivedAt:T+(i-180)*1000,
  price:100*Math.exp(sign*(i*.00001+(i===180?shock:0)))}));
}
const input=rows=>({quoteHistory:rows,quoteAt:T,price:rows.at(-1).price,now:T,durationMs:30000});
test('an upward end residual is compared with the actual entry instead of added to the forecast',()=>{
 const xs=history(),args=input(xs),old=released(args),next=candidate.thirtySecondCycleForecast(args);
 assert.equal(old.side,'CALL');assert.equal(next.side,'PUT');
 assert.ok(next.predictedPrice<args.price);assert.ok(old.predictedPrice>args.price);
 assert.equal(next.horizonMs,30000);assert.equal(next.observedPoints,old.observedPoints);
 assert.equal(next.fitSelectionCriterion,old.fitSelectionCriterion);
});
test('the mirrored downward residual has the symmetric endpoint comparison',()=>{
 const args=input(history(-1));assert.equal(released(args).side,'PUT');
 assert.equal(candidate.thirtySecondCycleForecast(args).side,'CALL');
});
test('the existing insufficient-variation guard still rejects an exactly straight path',()=>{
 for(const s of [-1,1]){
  const args=input(history(s,0)),old=released(args),next=candidate.thirtySecondCycleForecast(args);
  assert.equal(old.ready,false);assert.deepEqual(next,old);
 }
});
test('future observations and late received prices cannot change the fitted endpoint',()=>{
 const args=input(history()),base=candidate.thirtySecondCycleForecast(args);
 const contaminated={...args,quoteHistory:[...args.quoteHistory,{ts:T+1,receivedAt:T+1,price:1},
  {ts:T-1,receivedAt:T+1,price:99999}]};
 assert.deepEqual(candidate.thirtySecondCycleForecast(contaminated),base);
});
test('explicit expiry uses the supplied deadline and both searches use actual entry',()=>{
 const args=input(history());
 for(const periodSearch of ['baseline','wide']){
  const x=candidate.thirtySecondCycleForecast({...args,periodSearch,projectionTargetAt:T+27000});
  assert.equal(x.horizonMs,27000);assert.equal(x.projectionTargetAt,T+27000);
  assert.equal(x.side,'PUT');assert.ok(x.predictedPrice<args.price);
 }
});
test('unsupported holding duration and missing source history stay unavailable',()=>{
 const args=input(history());
 for(const changes of [{durationMs:15000},{quoteHistory:[]},{now:T+1500}]){
  const altered={...args,...changes};assert.equal(candidate.thirtySecondCycleForecast(altered).ready,false);
  assert.deepEqual(candidate.thirtySecondCycleForecast(altered),released(altered));
 }
});
test('actual candidate runtime holds a single side until the 30s deadline',()=>{
 const rows=JSON.parse(readFileSync(new URL('./fixtures/sentinel-user-video-broker-6dp-20261016.json',import.meta.url))).quoteHistory;
 const runtime=new candidate.DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
 const settings={...runtime.settings,engine:'automatic',asset:'EUR/GBP OTC',orderDurationMs:30000};
 let previous=null,lastEntry=-Infinity,count=0;
 for(let i=0;i<rows.length;i++){
  const q=rows[i],snap={provider:'iq_option',price:q.price,quoteTs:q.ts,quoteHistory:rows.slice(0,i+1),candles:[]};
  const anchor=runtime._signalValidationGate({analysis:{asset:settings.asset},snap,settings,now:q.ts}).analysis.vnext.futureEntryAnchor;
  if(previous?.phase==='fired'&&q.ts<previous.exitAt){
   assert.equal(anchor.side,previous.side);assert.equal(anchor.exitAt,previous.exitAt);assert.equal(anchor.entryReadyNow,false);
  }
  if(anchor?.entryReadyNow){assert.ok(anchor.entryAt-lastEntry>=30000);lastEntry=anchor.entryAt;count++;}
  previous=anchor;
 }
 assert.ok(count>0,'fixture must exercise actual emitted signals');
});
test('5s, 15s and 60s runtime decisions preserve original admissions and directions',()=>{
 const rows=history();
 for(const duration of [5000,15000,60000]){
  const pair=[BaseRuntime,candidate.DemoTradingRuntime].map(R=>new R({enableVNext:true,forecastModel:'now-structural-v1'}));
  for(const i of [70,100,150,180]){
   const q=rows[i],snap={provider:'iq_option',price:q.price,quoteTs:q.ts,quoteHistory:rows.slice(0,i+1),candles:[]};
   const results=pair.map(r=>r._signalValidationGate({analysis:{asset:'TEST'},snap,
    settings:{...r.settings,engine:'automatic',asset:'TEST',orderDurationMs:duration},now:q.ts}).analysis.vnext);
   assert.deepEqual(results[1].futureEntryAnchor,results[0].futureEntryAnchor);
   assert.deepEqual(results[1].nowObservation,results[0].nowObservation);
  }
 }
});
