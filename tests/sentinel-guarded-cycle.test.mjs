import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {thirtySecondCycleForecast} from '../research/thirty-second-cycle-forecast.mjs';
import {phaseInvalidity} from '../research/guarded-cycle-direction.mjs';
import {predictors,replayGuards} from '../research/guarded-cycle-study.mjs';
import {breakAwareCycleForecast} from '../research/break-aware-cycle-forecast.mjs';
const rows=JSON.parse(readFileSync(new URL('./fixtures/sentinel-user-video-broker-6dp-20261016.json',import.meta.url))).quoteHistory;
const inputAt=i=>({quoteHistory:rows.slice(0,i+1),price:rows[i].price,quoteAt:rows[i].ts,now:rows[i].ts,
 durationMs:30000,engineId:'automatic',qualityPolicy:'adaptive-market-v17'});
test('current velocity is checked against the SAME past interval, not the future expiry direction',()=>{
 const d={observed3:1,observed10:2,fitted3:1,fitted10:2,currentResidual:0,residualRms:1};
 assert.equal(phaseInvalidity(d),null);
 assert.equal(phaseInvalidity({...d,fitted3:-1,fitted10:-2}),'old-phase-opposes-observed-3s-and-10s');
 assert.equal(phaseInvalidity({...d,fitted3:-1}),null);
 assert.equal(phaseInvalidity({...d,currentResidual:3},'residual'),'current-price-outside-fitted-residual-range');
});
test('diagnostics preserve the previous candidate output exactly',()=>{
 for(const i of [400,650,950]){
  const input=inputAt(i),{diagnostics,...actual}=thirtySecondCycleForecast(input,{withDiagnostics:true});
  assert.deepEqual(actual,thirtySecondCycleForecast(input));assert.ok(diagnostics);
 }
});
test('all guards preserve published entry admission, exact instants and non-overlapping 30s windows',()=>{
 const reports=replayGuards(rows),base=reports.published.entries;
 for(const r of Object.values(reports)){
  assert.deepEqual(r.entries.map(e=>e.at),base.map(e=>e.at));
  for(let i=1;i<r.entries.length;i++)assert.ok(r.entries[i].at-r.entries[i-1].at>=30000);
 }
});
test('guards never inspect unseen prices or observations not yet received',()=>{
 for(const i of [400,650,950]){
  const input=inputAt(i),polluted={...input,quoteHistory:[...rows,{ts:input.now-100,receivedAt:input.now+1000,price:99}]};
  for(const [name,predict]of Object.entries(predictors))assert.deepEqual(predict(input),predict(polluted),name);
 }
});
test('break-aware projection can represent an observed trend change without waiting for a future candle',()=>{
 const T=1800000000000;
 const history=Array.from({length:181},(_,i)=>({ts:T+i*1000,price:Math.exp(.00001*Math.min(i,120)-.000025*Math.max(0,i-120))}));
 const q=history.at(-1),f=breakAwareCycleForecast({quoteHistory:history,quoteAt:q.ts,now:q.ts,price:q.price,durationMs:30000});
 assert.equal(f.ready,true);assert.equal(f.side,'PUT');assert.equal(f.fittedBreakSecondsAgo,60);
 const actual=Math.exp(.00001*120-.000025*90);
 assert.ok(Math.abs(f.predictedPrice-actual)<1e-10);assert.equal(f.horizonMs,30000);
});
