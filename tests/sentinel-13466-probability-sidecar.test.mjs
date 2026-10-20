import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {shortProbability} from '../sentinel-trading-lab/agent/src/core/short-probability.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {singleEngineForecast} from '../sentinel-trading-lab/agent/src/core/vnext-single-engine.mjs';
import {analystSnapshot,fitAnalystFrame} from '../sentinel-trading-lab/agent/worker/live-bridge.mjs';

const t=1800000000000, asset='EUR/USD OTC';
function series({seconds=60,sign=1}={}){
 return Array.from({length:seconds+1},(_,i)=>({ts:t-seconds*1000+i*1000,price:1.1+sign*i*.000016}));
}
const assessment=(rows,durationMs=30000,payout=.8)=>{
 const q=rows.at(-1);
 return shortProbability({quoteHistory:rows,quoteAt:q.ts,price:q.price,now:q.ts,durationMs,payout});
};
test('probability from just 30s, no 280-trade waiting, 30s or 60s horizon',()=>{
 assert.equal(assessment(series({seconds:29})).ready,false);
 for(const durationMs of [30000,60000])for(const sign of [-1,1]){
  const value=assessment(series({sign}),durationMs);
  assert.ok(value.pCall!==null&&value.pPut!==null);
  assert.equal(value.side,sign>0?'CALL':'PUT');
  assert.equal(value.calibrated,false);
 }
});
test('future quotes cannot alter the 66 probability estimate',()=>{
 const q=series();
 const original=assessment(q);
 const modified=assessment([...q,{ts:t+1000,price:1000}]);
 assert.equal(original.pCall,modified.pCall);
});
test('no payout authorizes no probability-based CALL/PUT',()=>{
 const p=assessment(series(),30000,null);
 assert.equal(p.ready,false);
 assert.equal(p.side,null);
 assert.equal(p.pCall!==null,true);
});
test('66 original forecast side, expiry, target and research remain unchanged',()=>{
 const quotes=Array.from({length:460},(_,i)=>({ts:t-(459-i)*1000,
  price:1.1+.0000017*i+Math.sin(i/11)*.00002+Math.sin(i/41)*.00005}));
 const snap={quoteHistory:quotes,quoteTs:t,price:quotes.at(-1).price,provider:'iq_option',payout:.8};
 for(const durationMs of [30000,60000]){
  const runtime=new DemoTradingRuntime({enableVNext:true});
  runtime.patchSettings({asset,engine:'automatic',orderDurationMs:durationMs},'test');
  const original=singleEngineForecast({settings:runtime.settings,snap,now:t});
  const out=runtime._signalValidationGate({analysis:{},snap,settings:runtime.settings,now:t});
  assert.equal(out.allowed,false);
  assert.deepEqual(out.analysis.vnext.receipt,original.receipt);
  assert.equal(out.analysis.vnext.targetAnchor?.targetAt,original.receipt?.targetAt);
  assert.equal(out.analysis.vnext.operational.side,'AGUARDAR');
  assert.equal(out.analysis.vnext.probability?.calibrated,false);
 }
});
test('old 66 worker accepts 60-second selection directly',()=>{
 const s=readFileSync(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');
 assert.ok(s.includes('30000,45000,60000,120000'));
});
test('PC and phone use the same compact probability, preserving receipt',()=>{
 const receipt={engineId:'automatic',asset,side:'CALL',issuedAt:t,quoteReceivedAt:t,
   expirySeconds:60,targetAt:t+60000,referencePrice:1.1,projectedPrice:1.1001};
 const a={vnext:{engineId:'automatic',expirySeconds:60,receipt,targetAnchor:receipt,
   projection:{callPct:50,putPct:50},probability:{pCall:.62,pPut:.38},
   horizonForecasts:[],horizonMeasurements:[],cards:[]}};
 const frame=analystSnapshot({settings:{asset,engine:'automatic',orderDurationMs:60000},
   state:'running',agentVersion:'13.4.66',lastResult:{asset,analysis:a},lastEvalMs:t},
   {symbol:asset,validatedSymbol:asset,assetValidated:true,analysisFeedValidated:true,lastQuoteAt:t,quote:1.1});
 const compact=fitAnalystFrame(frame);
 assert.deepEqual(compact.lastResult.analysis.vnext.p,[62,38]);
 assert.deepEqual(compact.lastResult.analysis.vnext.receipt.side,receipt.side);
 assert.equal(compact.lastResult.analysis.vnext.receipt.targetAt,receipt.targetAt);
 assert.ok(Buffer.byteLength(JSON.stringify(compact))<3000);
});
