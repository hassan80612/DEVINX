import test from 'node:test';
import assert from 'node:assert/strict';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const t=1800000000000;
const quotes=Array.from({length:360},(_,i)=>({ts:t-(359-i)*1000,
 price:1.1+i*.0000009+Math.sin(i/13)*.00002+Math.cos(i/35)*.000008}));
function snapshot(){return{
 quoteHistory:quotes,price:quotes.at(-1).price,quoteTs:t,provider:'iq_option',
 candles:Array.from({length:65},(_,i)=>({from:t-(65-i)*60000,to:t-(64-i)*60000,open:1.1,high:1.101,low:1.099,close:1.1001}))
}}
test('13.4.58 base runtime remains unchanged unless VNext Agent explicitly opts in',()=>{
 const a=new DemoTradingRuntime(),b=new DemoTradingRuntime({enableVNext:true});
 assert.equal(a.settings.engine,null);
 assert.equal(b.settings.engine,'automatic');
});
test('VNext Agent uses selected expiration, not older separate horizon or broker expiry',()=>{
 const runtime=new DemoTradingRuntime({enableVNext:true});
 runtime.patchSettings({asset:'EUR/USD OTC',orderDurationMs:5000,forecastHorizonSeconds:60,engine:'automatic'});
 const snap={...snapshot(),brokerExpirationDurationMs:60000};
 const g=runtime._signalValidationGate({analysis:{metrics:{}},snap,settings:runtime.settings,now:t});
 assert.equal(g.allowed,false);
 assert.equal(g.analysis.engineId,'automatic');
 assert.equal(g.analysis.vnext.expirySeconds,5);
 assert.equal(g.analysis.vnext.receipt.targetAt,t+5000);
 assert.equal(g.analysis.entryPlanner.horizons['5'].horizonSeconds,5);
 assert.equal(g.analysis.operationalSignal.entryAnalyst.independent,true);
 assert.equal(g.analysis.operationalSignal.actionable,false);
 assert.deepEqual(g.analysis.strategyCards,[]);
 assert.equal(g.analysis.strategyConfluence,null);
 assert.equal(g.analysis.generalConsensus,null);
});
test('each selected specialist owns the scenario without three-way confluence',()=>{
 const runtime=new DemoTradingRuntime({enableVNext:true});
 const snap=snapshot(),predicted=[];
 for(const engine of ['automatic','trend','support_resistance','price_action','breakout','mean_reversion','fibonacci_retest','trendline_breakout','smart_confluence']){
  runtime.patchSettings({asset:'EUR/USD OTC',engine,orderDurationMs:15000});
  const g=runtime._signalValidationGate({analysis:{metrics:{}},snap,settings:runtime.settings,now:t});
  assert.equal(g.analysis.engineId,engine);
  assert.ok(g.analysis.vnext?.receipt?.projectedPrice>0,engine);
  assert.equal(g.analysis.operationalSignal.engineId,engine);
  predicted.push(g.analysis.vnext.receipt.projectedPrice);
 }
 assert.ok(new Set(predicted).size>=5,'models must project different future prices');
});
test('a quote from the future or stale quote cannot manufacture a trade-ready prediction',()=>{
 const runtime=new DemoTradingRuntime({enableVNext:true});
 runtime.patchSettings({asset:'EUR/USD OTC',orderDurationMs:10000});
 let snap={...snapshot(),quoteTs:t-15000};
 const g=runtime._signalValidationGate({analysis:{metrics:{}},snap,settings:runtime.settings,now:t});
 assert.equal(g.analysis.vnext.receipt,null);
 assert.equal(g.analysis.operationalSignal.ready,false);
 assert.equal(g.analysis.operationalSignal.actionable,false);
});
