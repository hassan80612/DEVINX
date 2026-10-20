import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {shortProbability} from '../sentinel-trading-lab/agent/src/core/short-probability.mjs';
import {analystSnapshot,fitAnalystFrame} from '../sentinel-trading-lab/agent/worker/live-bridge.mjs';
const now=1792500000000;
const mk=(rate=.000016,seconds=180)=>Array.from({length:seconds+1},(_,i)=>({
 ts:now-seconds*1000+i*1000,price:1.1+i*rate+Math.sin(i*.4)*.000002
}));
const snap=(rate,seconds=180)=>{const q=mk(rate,seconds);return {
 provider:'iq_option',quoteHistory:q,quoteTs:now,price:q.at(-1).price,payout:.8,
 brokerExpirationDurationMs:60000,brokerExpirationKind:'selected-duration',
 brokerExpirationConfidence:.96,brokerExpirationUpdatedAt:now
}};
test('13.9.66 original decisions and 30s/60s boundaries are unchanged',()=>{
 for(const durationMs of [30000,60000])for(const rate of [.000016,-.000016,0]){
  const market=snap(rate);
  market.brokerExpirationDurationMs=durationMs;
  const old=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
  const revised=new DemoTradingRuntime({enableVNext:true,forecastModel:'short-probability-v1'});
  old.patchSettings({asset:'EUR/USD',engine:'automatic',orderDurationMs:durationMs},'test');
  revised.patchSettings({asset:'EUR/USD',engine:'automatic',orderDurationMs:durationMs,motorVariant:'66'},'test');
  const a=old._signalValidationGate({analysis:{},snap:market,settings:old.settings,now});
  const b=revised._signalValidationGate({analysis:{},snap:market,settings:revised.settings,now});
  for(const name of ['side','ready','reason'])assert.equal(b.analysis.vnext.nowObservation[name],a.analysis.vnext.nowObservation[name],name+' '+durationMs+' '+rate);
  assert.deepEqual(b.analysis.vnext.opportunityWindow,a.analysis.vnext.opportunityWindow);
  assert.deepEqual(b.analysis.vnext.futureEntryAnchor,a.analysis.vnext.futureEntryAnchor);
  assert.equal(b.analysis.vnext.motorVariant,'66');
  assert.equal(b.analysis.vnext.nowObservation.probabilityCalibrated,false);
 }
});
test('probability mode starts from 30-second price history without trade outcomes',()=>{
 const q=mk(.000016,60),last=q.at(-1);
 const p=shortProbability({quoteHistory:q,quoteAt:now,price:last.price,now,durationMs:30000,payout:.8});
 assert.equal(p.side,'CALL');
 assert.equal(p.calibrated,false);
 const rt=new DemoTradingRuntime({enableVNext:true,forecastModel:'short-probability-v1'});
 rt.patchSettings({engine:'automatic',motorVariant:'probability',orderDurationMs:30000},'test');
 const market=snap(.000016,60);market.brokerExpirationDurationMs=30000;
 const out=rt._signalValidationGate({analysis:{},snap:market,settings:rt.settings,now});
 assert.equal(out.analysis.vnext.motorVariant,'probability');
 assert.equal(out.analysis.vnext.nowObservation.probabilityCall!=null,true);
});
test('one-minute expiry stays sixty seconds in legacy and probability modes',()=>{
 for(const variant of ['66','probability']){
  const rt=new DemoTradingRuntime({enableVNext:true,forecastModel:'short-probability-v1'});
  rt.patchSettings({engine:'automatic',motorVariant:variant,orderDurationMs:60000},'test');
  assert.equal(rt.settings.orderDurationMs,60000);
  assert.equal(rt.settings.forecastHorizonSeconds,30);
  const gate=rt._signalValidationGate({analysis:{},snap:snap(.000016),settings:rt.settings,now});
  const anchor=gate.analysis.vnext.futureEntryAnchor;
  if(anchor?.entryAt&&anchor?.exitAt)assert.equal(anchor.exitAt-anchor.entryAt,60000);
  assert.equal(gate.analysis.vnext.expirySeconds,60);
 }
});
test('switching motors cannot unlock a still-active broker operation',()=>{
 const rt=new DemoTradingRuntime({enableVNext:true,forecastModel:'short-probability-v1'});
 assert.equal(rt.settings.motorVariant,'66');
 rt.vnextWindowState={phase:'fired',exitAt:Date.now()+30000};
 assert.throws(()=>rt.patchSettings({motorVariant:'probability'},'test'),/wait_for_option_expiry/);
 assert.equal(rt.settings.motorVariant,'66');
 rt.vnextWindowState={phase:'fired',exitAt:Date.now()-1000};
 rt.patchSettings({motorVariant:'probability'},'test');
 assert.equal(rt.settings.motorVariant,'probability');
 assert.equal(rt.vnextWindowState,null);
});
test('signed mobile packet preserves engine and probabilities without altering countdown',()=>{
 const runtimeStatus={
  agentVersion:'13.9.71',state:'running',settings:{engine:'automatic',motorVariant:'66',orderDurationMs:60000},
  lastResult:{asset:'EUR/USD',analysis:{vnext:{
   mode:'now',engineId:'automatic',expirySeconds:60,
   nowObservation:{side:'CALL',ready:true,observedAt:now,evaluatedAt:now,probabilityCall:.62,probabilityPut:.38},
   futureEntryAnchor:{delaySeconds:60,side:'CALL',issuedAt:now,holdingSeconds:60,entryAt:now,exitAt:now+60000,entryReadyNow:true,phase:'fired',entryTriggeredAt:now},
   opportunityWindow:{phase:'fired',windowStartedAt:now,windowEndsAt:now+60000}
  }}}};
 const frame=analystSnapshot(runtimeStatus,{symbol:'EUR/USD',validatedSymbol:'EUR/USD',quote:1.2,lastQuoteAt:now,assetValidated:true,analysisFeedValidated:true});
 const fitted=fitAnalystFrame(frame);
 assert.ok(fitted);
 assert.equal(fitted.settings.motorVariant,'66');
 assert.equal(fitted.lastResult.analysis.vnext.nowObservation.probabilityCall,.62);
 assert.equal(fitted.lastResult.analysis.vnext.nowObservation.probabilityPut,.38);
 assert.ok(Buffer.byteLength(JSON.stringify(fitted))<=3000);
});
test('PC motor selector and 60-second options are present without old UI rewrite',()=>{
 const p=readFileSync(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
 const w=readFileSync(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');
 assert.match(p,/data-sentinel-setting="motorVariant"/);
 assert.match(p,/value="66"/);
 assert.match(p,/value="probability"/);
 assert.match(p,/data-sentinel-probability-30s/);
 assert.ok(w.includes('[5000,10000,15000,30000,60000].includes(n)'));
});
