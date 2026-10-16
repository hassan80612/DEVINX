import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {thirtySecondCycleForecast} from '../research/thirty-second-cycle-forecast.mjs';
import {compare,modelNames,predict,ingestionStudy} from '../research/thirty-second-objective-study.mjs';
import {candleExpiryFeatures} from '../research/candle-expiry-direction.mjs';
const T=1792160000000;
const rows=JSON.parse(readFileSync(new URL('./fixtures/sentinel-user-video-broker-6dp-20261016.json',import.meta.url))).quoteHistory;
const inputFor=history=>{const q=history.at(-1);return {quoteHistory:history,quoteAt:q.ts,now:q.ts,price:q.price,
 durationMs:30000,engineId:'automatic',qualityPolicy:'adaptive-market-v17'};};
test('cycle forecast predicts 30s ahead even when the immediate wave is moving the other way',()=>{
 // Current slope is positive, while t+30 is below the entry for this phase.
 const history=Array.from({length:181},(_,i)=>({ts:T+i*1000,price:Math.exp(.001*Math.sin(2*Math.PI*i/60+Math.PI/3))}));
 const input=inputFor(history),f=thirtySecondCycleForecast(input);
 assert.equal(f.ready,true);assert.equal(f.fittedPeriodSeconds,60);assert.equal(f.horizonMs,30000);
 assert.ok(history.at(-1).price>history.at(-2).price);assert.equal(f.side,'PUT');
 const actual=Math.exp(.001*Math.sin(2*Math.PI*210/60+Math.PI/3));
 assert.ok(Math.abs(f.predictedPrice-actual)<1e-10);
});
test('forecast uses only observed prices, survives clock/scale changes, and rejects unsupported horizons',()=>{
 const input=inputFor(rows.slice(0,951)),f=thirtySecondCycleForecast(input);
 assert.equal(f.ready,true);
 const polluted={...input,quoteHistory:[...rows,{ts:input.now-100,receivedAt:input.now+1000,price:99}]};
 assert.deepEqual(thirtySecondCycleForecast(polluted),f);
 const shifted=thirtySecondCycleForecast({...input,quoteAt:input.now+517,now:input.now+517,
  quoteHistory:input.quoteHistory.map(q=>({...q,ts:q.ts+517,receivedAt:(q.receivedAt??q.ts)+517}))});
 assert.equal(shifted.predictedPrice,f.predictedPrice);
 const scaled=thirtySecondCycleForecast({...input,price:input.price*10,quoteHistory:input.quoteHistory.map(q=>({...q,price:q.price*10}))});
 assert.equal(scaled.side,f.side);assert.ok(Math.abs(scaled.predictedPrice/f.predictedPrice-10)<1e-8);
 assert.equal(thirtySecondCycleForecast({...input,durationMs:60000}).ready,false);
});
test('preserving entry admission retains every published entry and holding duration',()=>{
 const r=compare(rows),base=r.reports.published.entries,same=r.reports.cycle_direction_same_entries.entries;
 assert.deepEqual(same.map(e=>e.at),base.map(e=>e.at));
 for(const name of modelNames){
  const entries=r.reports[name].entries;
  for(let i=1;i<entries.length;i++)assert.ok(entries[i].at-entries[i-1].at>=30000);
  assert.deepEqual(r.matched[name].entries.map(e=>e.at),base.map(e=>e.at));
 }
});
test('every research policy ignores unseen prices and late arrivals',()=>{
 for(const index of [400,650,950]){
  const input=inputFor(rows.slice(0,index+1));
  const polluted={...input,quoteHistory:[...rows,{ts:input.now-100,receivedAt:input.now+1000,price:99}]};
  for(const name of modelNames)assert.deepEqual(predict(polluted,name),predict(input,name));
 }
});
test('wick and rejection inputs distinguish paths with identical old endpoint-return features',()=>{
 const history=Array.from({length:181},(_,i)=>({ts:T+i*1000,price:1+.000001*i+.000002*Math.sin(i)}));
 const changed=history.map((q,i)=>i===163?{...q,price:q.price+.0005}:q); // Previous 10s bar, t-17s.
 const t=history.at(-1).ts;
 const oldFeatures=xs=>[2,5,10,20,32,60].map(h=>Math.log(xs.at(-1).price/xs.find(q=>q.ts===t-h*1000).price));
 assert.deepEqual(oldFeatures(changed),oldFeatures(history));
 const a=candleExpiryFeatures(history,t),b=candleExpiryFeatures(changed,t);
 assert.ok(a&&b);assert.notEqual(a.x[10],b.x[10]); // Previous wick balance.
});
test('published ingestion can discard required elapsed context on a dense feed',()=>{
 const {cases}=ingestionStudy();
 assert.ok(cases.every(c=>c.browserInput.ready));
 assert.equal(cases.find(c=>c.quotesPerSecond===10).runtimeInput.ready,true);
 const dense=cases.find(c=>c.quotesPerSecond===20);
 assert.equal(dense.runtimeInput.quotes,2400);assert.equal(dense.runtimeInput.spanMs,119950);
 assert.equal(dense.runtimeInput.ready,false);assert.equal(dense.runtimeInput.reason,'insufficient-completed-analogues');
});
