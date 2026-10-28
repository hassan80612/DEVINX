import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {shortProbability} from '../sentinel-trading-lab/agent/src/core/short-probability.mjs';
import {combine66WithProbability} from '../sentinel-trading-lab/agent/src/core/66-probability-integration.mjs';
import {analystSnapshot,fitAnalystFrame} from '../sentinel-trading-lab/agent/worker/live-bridge.mjs';
const time=1792500000000, asset='EUR/USD';
const quotes=(s=60,k=.000015)=>Array.from({length:s+1},(_,i)=>({ts:time-s*1000+i*1000,price:1.1+i*k+Math.sin(i*.4)*.000001}));
const snapshot=(durationMs=30000,k=.000015)=>{
 const q=quotes(180,k);return{provider:'iq_option',quoteHistory:q,quoteTs:time,price:q.at(-1).price,payout:.8,brokerExpirationDurationMs:durationMs,brokerExpirationKind:'selected-duration',brokerExpirationConfidence:.96,brokerExpirationUpdatedAt:time};
};
test('probability uses 30s quotes, not hours of completed operations',()=>{
 const q=quotes(60),p=q.at(-1);
 const estimate=shortProbability({quoteHistory:q,quoteAt:time,price:p.price,durationMs:30000,payout:.8,now:time});
 assert.equal(estimate.side,'CALL');
 assert.equal(estimate.calibrated,false);
 assert.equal(shortProbability({quoteHistory:quotes(29),quoteAt:time,price:quotes(29).at(-1).price,durationMs:30000,payout:.8,now:time}).ready,false);
});
test('original 66 side preserved if probability agrees or is missing',()=>{
 const buy={ready:true,side:'CALL',strength:42,reason:'closed-structure-and-live-impulse'};
 assert.equal(combine66WithProbability(buy,null,{durationMs:30000}),buy);
 assert.equal(combine66WithProbability(buy,{pCall:.69,pPut:.31},{durationMs:30000}).side,'CALL');
 assert.equal(combine66WithProbability(buy,{pCall:.3,pPut:.7},{durationMs:60000}).side,'CALL');
});
test('probability cannot reverse 66 without independently verified quote outcomes',()=>{
 const weak={ready:true,side:'CALL',strength:35,reason:'closed-structure-and-live-impulse'};
 const estimate={pCall:.28,pPut:.72};
 const unapproved=combine66WithProbability(weak,estimate,{durationMs:30000});
 assert.equal(unapproved.side,'CALL');
 assert.equal(unapproved.ready,true);
 const proof={approved:true,n:16,observedOppositeRate:.8};
 const inverted=combine66WithProbability(weak,estimate,{durationMs:30000,proof});
 assert.equal(inverted.side,'PUT');
 assert.equal(inverted.probabilityOverride,true);
 assert.equal(inverted.originalSide,'CALL');
 assert.equal(combine66WithProbability({...weak,strength:75},estimate,{durationMs:30000,proof}).side,'CALL');
 assert.equal(combine66WithProbability({...weak,strength:null,reason:'closed-range-extreme-reversal-confirmed'},estimate,{durationMs:30000,proof}).side,'CALL');
 assert.equal(combine66WithProbability(weak,estimate,{durationMs:15000,proof}).side,'CALL');
});
test('new integration performs no async waits and costs little per decision',()=>{
 const q=quotes(60),p=q.at(-1);
 const obs={ready:true,side:'CALL',strength:65,reason:'closed-structure-and-live-impulse'};
 const begin=performance.now();
 for(let i=0;i<100;i++){
  const estimate=shortProbability({quoteHistory:q,quoteAt:time,price:p.price,durationMs:30000,payout:.8,now:time});
  const combined=combine66WithProbability(obs,estimate,{durationMs:30000});
  assert.equal(combined.ready,true);
 }
 assert.ok(performance.now()-begin<1000,'probability must stay inexpensive for 100 ticks');
});
test('one integrated runtime retains broker expiry at 30s and 60s',()=>{
 for(const durationMs of [30000,60000]){
  const rt=new DemoTradingRuntime({enableVNext:true,forecastModel:'short-probability-v1'});
  rt.patchSettings({engine:'automatic',orderDurationMs:durationMs},'test');
  const out=rt._signalValidationGate({analysis:{},snap:snapshot(durationMs),settings:rt.settings,now:time});
  assert.equal(rt.settings.orderDurationMs,durationMs);
  assert.equal(out.analysis.vnext.expirySeconds,durationMs/1000);
  assert.equal(out.analysis.vnext.nowObservation.probabilityCalibrated,false);
  assert.ok(out.analysis.vnext.nowObservation.probabilityCall!==null);
  if(out.analysis.vnext.futureEntryAnchor?.phase==='fired'){
   const anchor=out.analysis.vnext.futureEntryAnchor;
   assert.equal(anchor.exitAt-anchor.entryAt,durationMs);
  }
 }
});
test('old separate motor selection is ignored, original motor is not replaceable',()=>{
 const rt=new DemoTradingRuntime({enableVNext:true,forecastModel:'short-probability-v1'});
 rt.patchSettings({motorVariant:'probability'},'test');
 assert.equal(rt.settings.motorVariant,undefined);
 rt.restore({settings:{motorVariant:'probability',orderDurationMs:60000}});
 assert.equal(rt.settings.motorVariant,undefined);
 assert.equal(rt.settings.orderDurationMs,60000);
});
test('mobile signed relay carries probability, not a second engine',()=>{
 const record={agentVersion:'13.9.72',state:'running',settings:{engine:'automatic',orderDurationMs:60000},lastResult:{asset,analysis:{vnext:{
  mode:'now',engineId:'automatic',expirySeconds:60,
  nowObservation:{side:'CALL',ready:true,observedAt:time,evaluatedAt:time,probabilityCall:.62,probabilityPut:.38,probabilityInfluenced:false},
  futureEntryAnchor:{delaySeconds:60,side:'CALL',issuedAt:time,holdingSeconds:60,entryAt:time,exitAt:time+60000,entryReadyNow:true,phase:'fired',entryTriggeredAt:time},
  opportunityWindow:{phase:'fired',windowStartedAt:time,windowEndsAt:time+60000}
 }}}};
 const frame=analystSnapshot(record,{symbol:asset,validatedSymbol:asset,quote:1.2,lastQuoteAt:time,assetValidated:true,analysisFeedValidated:true});
 const compact=fitAnalystFrame(frame);
 assert.equal(compact.lastResult.analysis.vnext.nowObservation.probabilityCall,.62);
 assert.equal(compact.lastResult.analysis.vnext.nowObservation.probabilityPut,.38);
 assert.equal(compact.lastResult.analysis.vnext.nowObservation.probabilityInfluenced,false);
 assert.ok(Buffer.byteLength(JSON.stringify(compact))<3000);
});
test('no MOTOR dropdown on PC or mobile; 60s setting retained',()=>{
 const driver=readFileSync(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');
 const phone=readFileSync(new URL('../sentinel-trading-lab/src/components/LiveScenarioCard.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(driver,/data-sentinel-motor-switch|data-sentinel-setting="motorVariant"/);
 assert.doesNotMatch(phone,/\{t\('Motor'\)\}/);
 assert.ok(driver.includes('data-sentinel-probability-30s'));
 assert.ok(worker.includes('[30000,60000,300000].includes(n)'));
});

test('large rapid retracement vetoes stale trend entry but never manufactures an opposite trade',()=>{
 let price=1.1;const now=1820000000000,q=[];
 for(let i=0;i<=90;i++){price+=i>85?-.000075:.00002;q.push({ts:now+i*1000,price})}
 const last=q.at(-1),estimate=shortProbability({quoteHistory:q,quoteAt:last.ts,price:last.price,durationMs:30000,payout:.8,now:last.ts});
 assert.equal(estimate.fastReversalAgainst30s,true);
 assert.ok(estimate.pPut>=.64);
 const original={ready:true,side:'CALL',strength:86,reason:'closed-structure-and-live-impulse',observedAt:last.ts,entryPrice:last.price};
 const held=combine66WithProbability(original,estimate,{durationMs:30000});
 assert.equal(held.ready,false);assert.equal(held.side,null);
 assert.equal(held.reason,'rapid-countertrend-retraction-risk');
 assert.equal(combine66WithProbability({...original,reason:'confirmed-retest-at-level'},estimate,{durationMs:30000}).side,'CALL');
 assert.equal(combine66WithProbability(original,estimate,{durationMs:120000}).side,'CALL');
});
