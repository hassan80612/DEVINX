import test from 'node:test';
import assert from 'node:assert/strict';
import {analystWireV1 as site} from '../sentinel-trading-lab/src/lib/analyst-wire-v1.mjs';
import {analystWireV1 as agent} from '../sentinel-trading-lab/agent/src/core/analyst-wire-v1.mjs';
const reordered=x=>Array.isArray(x)?x.map(reordered):x&&typeof x==='object'?
 Object.fromEntries(Object.keys(x).sort().map(k=>[k,reordered(x[k])])):x;
test('site verifies original signed bytes from installed 29/30 during rollout without dropping fields',()=>{
 for(const version of ['13.9.29','13.9.30']){
  const frame={v:1,agentVersion:version,settings:{forecastMode:'continuous',clockMode:'broker',engine:'automatic',orderDurationMs:30000},
   liveBroker:{symbol:'EUR/USD',quote:1.1,brokerTiming:{capturedAt:123,purchaseWindow:{closesAt:456},instrumentKind:'digital',brokerClock:{ageMs:0,verified:true},source:'broker-visible-readonly'}}};
  // Unknown nested object keys were already sorted by the v1 producer.
  const original=JSON.stringify(frame),received=reordered(frame);
  assert.equal(site(received),original);
  received.settings.clockMode='current';assert.notEqual(site(received),original);
 }
});
test('31 signatures use exactly the current Agent serialization',()=>{
 const frame={v:1,agentVersion:'13.9.31',settings:{engine:'automatic',orderDurationMs:30000,forecastMode:'continuous'},
  lastResult:{analysis:{vnext:{mode:'now',engineId:'automatic',nowObservation:{side:'PUT',ready:true}}}}};
 assert.equal(site(reordered(frame)),agent(frame));
});
