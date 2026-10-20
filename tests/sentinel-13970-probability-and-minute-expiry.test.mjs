import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {shortProbability} from '../sentinel-trading-lab/agent/src/core/short-probability.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {executorSignal} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';
const START=1792500000000;
function quotes({seconds=60,stepMs=1000,dir=1,noisy=false}={}){
 return Array.from({length:Math.floor(seconds*1000/stepMs)+1},(_,i)=>{
  const sec=i*stepMs/1000;
  return {ts:START+i*stepMs,price:1.1+dir*.000015*sec+(noisy?.000002*Math.sin(sec):0)};
 });
}
function estimate(q,durationMs=30000,extra={}){
 const latest=q.at(-1);
 return shortProbability({quoteHistory:q,quoteAt:latest.ts,price:latest.price,durationMs,payout:.8,now:latest.ts,...extra});
}
test('30-second warmup does not require hundreds of outcomes',()=>{
 assert.equal(estimate(quotes({seconds:29})).ready,false);
 assert.equal(estimate(quotes({seconds:30})).side,'CALL');
});
test('30s and 60s expiries each independently return CALL and PUT',()=>{
 for(const durationMs of [30000,60000])for(const dir of [-1,1]){
  const r=estimate(quotes({dir}),durationMs);
  assert.equal(r.side,dir>0?'CALL':'PUT');
  assert.equal(r.horizonSeconds,durationMs/1000);
  assert.equal(r.calibrated,false);
  assert.equal(r.source,'parametric-unvalidated');
 }
});
test('sparse 4-second observation feed can produce a live estimate',()=>{
 const r=estimate(quotes({seconds:60,stepMs:4000}),60000);
 assert.equal(r.side,'CALL');
 assert.ok(r.quoteCount>=8);
});
test('invalid, future, or stale prices cannot produce a new signal',()=>{
 const q=quotes();
 const end=q.at(-1);
 assert.equal(estimate(q,30000,{now:end.ts+2100}).ready,false);
 assert.equal(estimate([...q,{ts:end.ts+5000,price:1000}],30000,{quoteAt:end.ts,price:end.price,now:end.ts}).side,'CALL');
 assert.equal(estimate(q,30000,{price:999}).ready,false);
});
test('60-second UI setting is supported by runtime while forecast chart reference stays 30s',()=>{
 const rt=new DemoTradingRuntime({enableVNext:true,forecastModel:'short-probability-v1'});
 rt.patchSettings({orderDurationMs:60000},'test');
 assert.equal(rt.settings.orderDurationMs,60000);
 assert.equal(rt.settings.forecastHorizonSeconds,30);
});
test('60-second broker-confirmed duration reaches engine and executor unchanged',()=>{
 const q=quotes(),last=q.at(-1),now=last.ts;
 const rt=new DemoTradingRuntime({enableVNext:true,forecastModel:'short-probability-v1'});
 rt.patchSettings({orderDurationMs:60000},'test');
 const snap={provider:'iq_option',quoteHistory:q,quoteTs:now,price:last.price,payout:.8,
  brokerExpirationDurationMs:60000,brokerExpirationKind:'selected-duration',
  brokerExpirationConfidence:.95,brokerExpirationUpdatedAt:now};
 const out=rt._signalValidationGate({analysis:{},snap,settings:rt.settings,now});
 const fired=out.analysis.vnext.futureEntryAnchor;
 assert.ok(fired&&fired.phase==='fired');
 assert.equal(fired.holdingSeconds,60);
 assert.equal(fired.exitAt-fired.entryAt,60000);
 assert.equal(executorSignal(out.analysis).durationMs,60000);
 assert.equal(out.analysis.vnext.nowObservation.probabilityCalibrated,false);
});
test('mismatch between selected 60s and broker confirmed 30s blocks the operation',()=>{
 const q=quotes(),last=q.at(-1),now=last.ts;
 const rt=new DemoTradingRuntime({enableVNext:true,forecastModel:'short-probability-v1'});
 rt.patchSettings({orderDurationMs:60000},'test');
 const snap={provider:'iq_option',quoteHistory:q,quoteTs:now,price:last.price,payout:.8,
  brokerExpirationDurationMs:30000,brokerExpirationKind:'selected-duration',
  brokerExpirationConfidence:.95,brokerExpirationUpdatedAt:now};
 const out=rt._signalValidationGate({analysis:{},snap,settings:rt.settings,now});
 assert.equal(out.analysis.vnext.futureEntryAnchor,null);
 assert.equal(out.analysis.vnext.nowObservation.reason,'broker-duration-mismatch');
});
test('worker 60s acceptance, not unsupported 2m-15m promise',()=>{
 const code=readFileSync(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');
 assert.ok(code.includes('[5000,10000,15000,30000,60000].includes(n)'));
 assert.match(code,/orderDurationMs:n,forecastHorizonSeconds:30/);
});
