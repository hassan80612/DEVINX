import test from 'node:test';
import assert from 'node:assert/strict';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {brokerDurationGuard} from '../sentinel-trading-lab/agent/src/core/structural-entry-guard-137.mjs';
const T=1792364400000;
// Hypothetical contract examples. These are not captured user trades and do not
// establish that the user's current losses involve a strike/deadline mismatch.
function priceScore(history,now){
 const r=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
 r.vnextWindowOutcomes=[{windowId:T,provider:'iq_option',asset:'TEST',engineId:'automatic',forecastMode:'now',
  periodSeconds:30,side:'CALL',entryAt:T,exitAt:T+30000,entryPrice:100,verified:false}];
 const last=history.at(-1);
 return r._signalValidationGate({analysis:{asset:'TEST'},settings:{...r.settings,engine:'automatic',asset:'TEST',orderDurationMs:30000},
  now,snap:{provider:'iq_option',price:last.price,quoteTs:last.ts,quoteHistory:history,candles:[]}}).analysis.vnext.outcomeQuality;
}
const q=(seconds,price)=>({ts:T+seconds*1000,receivedAt:T+seconds*1000,price});
test('a correct 30s directional quote score can disagree with a different Digital strike',()=>{
 const score=priceScore([q(0,100),q(30,100.2)],T+30000);
 assert.equal(score.correct,1);assert.equal(score.source,'observed-broker-quotes-not-trade-settlements');
 const hypotheticalStrike=100.3,contractCallWins=100.2>hypotheticalStrike;
 assert.equal(contractCallWins,false);
});
test('a correct 30s direction does not grade a hypothetical later contract deadline',()=>{
 const score=priceScore([q(0,100),q(30,100.2),q(60,99.8)],T+60000);
 assert.equal(score.correct,1);
 assert.equal(99.8>100,false);
});
test('matching reference and deadline agree in the same controlled example',()=>{
 const score=priceScore([q(0,100),q(30,100.2)],T+30000);
 assert.equal(score.correct===1,100.2>100);
});
test('the released duration guard does not treat fixed-clock metadata as a verified holding duration',()=>{
 const guard=brokerDurationGuard({now:T,settings:{orderDurationMs:30000},snap:{brokerExpirationDurationMs:60000,
  brokerExpirationKind:'fixed-clock',brokerExpirationConfidence:1,brokerExpirationUpdatedAt:T}});
 assert.equal(guard.allowed,true);assert.equal(guard.verified,false);assert.equal(guard.selectedDurationMs,30000);
});
