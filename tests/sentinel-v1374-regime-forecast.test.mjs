import test from 'node:test';
import assert from 'node:assert/strict';
import {marketRegimeEvidence,contextualPairDecision} from '../sentinel-trading-lab/agent/src/core/market-regime-evidence.mjs';
import {historicalFuturePath,conditionalPathWindow} from '../sentinel-trading-lab/agent/src/core/forward-path-research.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const T=1800000000000;
const prices=Array.from({length:1500},(_,i)=>({ts:T+i*1000,price:1.1*Math.exp(i*.000004+Math.sin(i*.18)*.000006)}));
test('only information known at issuance determines regime diagnosis',()=>{
 const now=prices.at(-1).ts;
 const before=marketRegimeEvidence({quoteHistory:prices,asOf:now});
 const after=marketRegimeEvidence({quoteHistory:[...prices,
  {ts:now+1000,price:5000},{ts:now+30000,price:.000001}],asOf:now});
 assert.deepEqual(before,after);
 assert.equal(before.ready,true);
 assert.equal(before.trendSide,'CALL');
 assert.equal(before.calibrated,false);
});
test('two strategies cannot reinforce a confirmed opposite regime',()=>{
 const regime={trendSide:'CALL',volatilityShock:false};
 const counter=contextualPairDecision({firstSide:'PUT',secondSide:'PUT',regime});
 assert.equal(counter.side,null);
 assert.equal(counter.reason,'countertrend-agreement-unreliable');
 const rescue=contextualPairDecision({firstSide:'PUT',secondSide:'CALL',regime});
 assert.equal(rescue.side,'CALL');
 assert.equal(rescue.reason,'observed-trend-breaks-strategy-tie');
 assert.equal(contextualPairDecision({firstSide:'PUT',secondSide:'CALL',
  regime:{volatilityShock:true}}).side,null);
});
test('historical conditional price movement uses exact entry and expiry, not nearest coarse grid',()=>{
 const now=prices.at(-1).ts;
 const path=historicalFuturePath({quoteHistory:prices,asOf:now,horizonSeconds:100,
  requestedOffsets:[17,60]});
 assert.equal(path.ready,true);
 assert.ok(path.expectedPath.some(x=>Math.abs(x.secondsFromNow-17)<.001));
 assert.ok(path.expectedPath.some(x=>Math.abs(x.secondsFromNow-60)<.001));
 const entry=conditionalPathWindow(path,17,43);
 assert.equal(entry.entrySeconds,17);
 assert.equal(entry.holdingSeconds,43);
 assert.ok(!['unavailable','exact-entry-or-expiry-sample-missing'].includes(entry.status));
 assert.equal(entry.calibrated,false);
});
test('longer local-only research history retains timespan on 4 quotes per second',()=>{
 const runtime=new DemoTradingRuntime({enableVNext:true});
 runtime.patchSettings({pairResearchEnabled:true,pairResearchId:'reversal'});
 const history=Array.from({length:6800},(_,i)=>({ts:T+i*250,price:1.1+i*.0000001}));
 runtime.setExternalMarket({symbol:'EUR/USD OTC',provider:'iq_option',
  quoteHistory:history,quote:history.at(-1).price,quoteTs:history.at(-1).ts});
 assert.equal(runtime.externalMarket.quoteHistory.length,2400);
 assert.ok(runtime.externalMarket.researchQuoteHistory.length>=1600);
 assert.ok(runtime.externalMarket.researchQuoteHistory.length<1800);
 assert.ok(runtime.externalMarket.researchQuoteHistory[0].ts<
  runtime.externalMarket.quoteHistory[0].ts);
 const disabled=new DemoTradingRuntime({enableVNext:true});
 disabled.setExternalMarket({symbol:'EUR/USD OTC',provider:'iq_option',quoteHistory:history});
 assert.equal(disabled.externalMarket.researchQuoteHistory.length,0);
});
