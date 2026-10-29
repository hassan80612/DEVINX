import test from 'node:test';
import assert from 'node:assert/strict';
import {assessDirectionalPersistence,reviewDirectionalPersistence,fiveMinuteReversalOnly} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {reviewEntryPrice} from '../sentinel-trading-lab/agent/src/core/entry-price-timing.mjs';
import {marketReading,marketDataStatus} from '../sentinel-trading-lab/agent/src/core/market-reading.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
const T=1800000000000;
for(const durationMs of [30000,60000,300000])for(const mirror of [false,true]){
 test(`${durationMs} ${mirror?'PUT':'CALL'}: weakening flow cannot authorize opposite continuation; own reversals remain eligible`,()=>{
  const span=durationMs===30000?12:durationMs===60000?20:60;
  const quoteHistory=Array.from({length:span*10+1},(_,i)=>{
   const t=i/10,price=100+Math.min(t,span*.7)*.02+Math.max(0,t-span*.7)*.001;
   return {ts:T-span*1000+i*100,price:mirror?200-price:price};
  });
  const flow=mirror?'PUT':'CALL',opposite=mirror?'CALL':'PUT',price=quoteHistory.at(-1).price,
   args={quoteHistory,quoteAt:T,now:T,price,durationMs};
  assert.equal(assessDirectionalPersistence(args).phase,'weakening');
  const candidate={ready:true,side:opposite,reason:'closed-structure-and-live-impulse',observedAt:T,entryPrice:price};
  assert.equal(reviewDirectionalPersistence({...args,candidate}).ready,false);
  const reversal={...candidate,reason:'confirmed-level-structure-reversal',priceStructure:{confirmedReversal:{kind:'confirmed-level-structure-reversal',side:opposite,confirmedAt:T}}};
  assert.equal(reviewDirectionalPersistence({...args,candidate:reversal}),reversal);
  assert.equal(fiveMinuteReversalOnly({...args,candidate:reversal}).ready,true);
  if(durationMs===300000)assert.equal(fiveMinuteReversalOnly({...args,candidate}).ready,false);
  const resumed=quoteHistory.map((q,i)=>({...q,price:100+(mirror?-1:1)*i*.001}));
  assert.equal(reviewDirectionalPersistence({...args,quoteHistory:resumed,price:resumed.at(-1).price,
   candidate:{...candidate,side:flow}}).ready,true,'a normal resumed flow requires no stored review or cooldown');
 });
 test(`${durationMs} ${mirror?'PUT':'CALL'}: extended entry keeps its diagnostic identity`,()=>{
  const rows=Array.from({length:71},(_,i)=>({ts:T-70000+i*1000,price:100+(mirror?-1:1)*(i*.02+(i>65?.15*(i-65):0))}));
  const candidate={ready:true,side:mirror?'PUT':'CALL',reason:'confirmed-level-structure-reversal'};
  const out=reviewEntryPrice({candidate,quoteHistory:rows,quoteAt:T,now:T,price:rows.at(-1).price,durationMs});
  assert.equal(out.ready,false);assert.equal(out.entryTiming.kind,'entry-price-already-extended');
  assert.match(marketReading({candidate:out,quoteAt:T,now:T}),/^REVERSÃO JÁ ESTICADA/);
 });
}
test('technical freshness uses the selected duration without granting order permission',()=>{
 assert.match(marketDataStatus({quoteAt:T,evaluatedAt:T,now:T+1600,durationMs:30000}),/^COTAÇÃO ATRASADA/);
 assert.match(marketDataStatus({quoteAt:T,evaluatedAt:T,now:T+1600,durationMs:60000}),/^COTAÇÃO ATUAL/);
 assert.match(marketDataStatus({quoteAt:T,evaluatedAt:T,now:T+2200,durationMs:300000}),/^COTAÇÃO ATUAL/);
 assert.match(marketDataStatus({quoteAt:T+1000,evaluatedAt:T,now:T}),/^SEM COTAÇÃO VÁLIDA/);
});
for(const provider of ['exnova','iq_option'])test(`${provider}: actual ticker ingestion supports broker timestamp units and still rejects old/future frames`,()=>{
 const clock=Date.now;Date.now=()=>T;
 try{
  for(const factor of [.001,1,1000,1000000]){
   const d=new LocalPlaywrightDriver(),s=d.state(provider);s.activeId=76;s.symbol='EUR/USD OTC';
   const send=(at,price)=>d.ingest(provider,{name:'quote-generated',msg:{active_id:76,price,time:at*factor}},'page-in');
   send(T,1.12);assert.equal(s.lastQuoteAt,T);assert.equal(s.quote,1.12);
   send(T-1000,1.11);assert.equal(s.quote,1.12);
   send(T+10000,1.13);assert.equal(s.quote,1.12);
  }
 }finally{Date.now=clock;}
});
test('all three analyst durations survive persistent restore and strategy changes',()=>{
 for(const orderDurationMs of [30000,60000,300000]){
  const a=new DemoTradingRuntime({enableVNext:true,forecastModel:'short-probability-v1'});
  a.patchSettings({orderDurationMs},'test');
  const b=new DemoTradingRuntime({enableVNext:true,forecastModel:'short-probability-v1'}).restore(a.snapshotPersistent());
  assert.equal(b.settings.orderDurationMs,orderDurationMs);
  b.patchSettings({engine:'support_resistance'},'test');assert.equal(b.settings.orderDurationMs,orderDurationMs);
 }
});
