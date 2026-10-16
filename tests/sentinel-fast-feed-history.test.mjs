import test from 'node:test';
import assert from 'node:assert/strict';
import {compactObservedQuoteHistory} from '../sentinel-trading-lab/agent/src/core/observed-quote-history.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {causalPatternDirection} from '../sentinel-trading-lab/agent/src/core/causal-pattern-direction.mjs';
const T=Date.UTC(2026,9,16,22);
const rowsFor=(hz,seconds=180)=>Array.from({length:seconds*hz+1},(_,i)=>({ts:T-seconds*1000+i*1000/hz,
 price:Math.exp(.00001*i/hz+.0006*Math.sin(i/hz*Math.PI*2/41)),receivedAt:T-seconds*1000+i*1000/hz}));
function ingest(rows){
 const r=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
 r.setExternalMarket({provider:'iq_option',symbol:'EUR/USD',quote:rows.at(-1).price,quoteTs:rows.at(-1).ts,
  quoteFeedValidated:true,quoteHistory:rows});return r;
}
test('compaction preserves actual bucket open, extrema, close and receive metadata without interpolation',()=>{
 const rows=[1,9,2,0.5,4,3].map((price,i)=>({ts:T+i*20,price,receivedAt:T+i*20+5}));
 const result=compactObservedQuoteHistory(rows);
 assert.deepEqual(result.map(q=>q.price),[1,9,.5,3]);
 for(const q of result)assert.ok(rows.includes(q));
 assert.equal(result.at(-1),rows.at(-1));
});
test('same 180s trajectory retains completed 30s comparisons as update frequency increases',()=>{
 for(const hz of [2,10,20,40,100]){
  const rows=rowsFor(hz),snap=ingest(rows)._marketSnapshot(),kept=snap.quoteHistory;
  assert.equal(kept.at(-1),rows.at(-1));assert.equal(kept[0].ts,rows[0].ts);
  assert.ok(kept.length<=4804);
  const model=causalPatternDirection({quoteHistory:kept,quoteAt:T,now:T,price:rows.at(-1).price,durationMs:30000});
  assert.equal(model.ready,true,`${hz}Hz: ${model.reason}`);
 }
});
test('low-frequency observations remain identical; legacy engine retains its previous limit',()=>{
 const rows=rowsFor(2);assert.deepEqual(ingest(rows).externalMarket.quoteHistory,rows);
 const r=ingest(rowsFor(20));r.settings.engine=null;r.setExternalMarket({quoteHistory:rowsFor(20)});
 assert.equal(r.externalMarket.quoteHistory.length,900);
});
test('memory remains bounded by five minutes and does not invent observations across missing periods',()=>{
 const rows=rowsFor(100,600),kept=compactObservedQuoteHistory(rows);
 assert.ok(kept.length<=4804);assert.equal(kept[0].ts,T-300000);assert.equal(kept.at(-1),rows.at(-1));
 const gap=[...rows.slice(0,100),...rows.slice(-100)];
 assert.ok(compactObservedQuoteHistory(gap).every(q=>gap.includes(q)));
});
for(const provider of ['iq_option','exnova'])test(`${provider}: actual protocol ingestion preserves elapsed history during a dense quote burst`,()=>{
 const d=new LocalPlaywrightDriver(),s=d.state(provider);s.activeId=1;s.symbol='EUR/USD';
 const rows=rowsFor(100);
 for(const q of rows)d.ingest(provider,{name:'quote-generated',msg:{active_id:1,price:q.price,time:q.ts/1000}},'direct-in');
 const kept=s.quoteHistory;
 assert.equal(kept.at(-1).ts,T);assert.equal(kept.at(-1).price,rows.at(-1).price);
 assert.equal(kept[0].ts,rows[0].ts);assert.ok(kept.length<=6000);
 const runtime=ingest(kept);assert.equal(runtime.externalMarket.quoteHistory[0].ts,rows[0].ts);
});
