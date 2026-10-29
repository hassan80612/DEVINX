import test from 'node:test';
import assert from 'node:assert/strict';
import {marketDataStatus} from '../sentinel-trading-lab/agent/src/core/market-reading.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
const T=1800000000000;
test('technical freshness uses the selected duration without granting order permission',()=>{
 assert.match(marketDataStatus({quoteAt:T,evaluatedAt:T,now:T+1600,durationMs:30000}),/^COTAÇÃO ATRASADA/);
 assert.equal(marketDataStatus({quoteAt:T,evaluatedAt:T,now:T+1600,durationMs:60000}),'');
 assert.equal(marketDataStatus({quoteAt:T,evaluatedAt:T,now:T+2200,durationMs:300000}),'');
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
