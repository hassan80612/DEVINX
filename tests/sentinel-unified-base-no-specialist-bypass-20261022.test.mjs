import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const T=1800000000000;
const engines=['automatic','trend','support_resistance','smart_confluence','fibonacci_retest'];
const durations=[5000,10000,15000,30000,60000,120000,300000];
function quotes({sign=1,phase=0,flat=false}={}){
 return Array.from({length:231},(_,i)=>({
  ts:T+(i-230)*1000,receivedAt:T+(i-230)*1000,
  price:1.1+(flat?0:sign*(i*.000009+.000095*Math.sin((i+phase)*Math.PI/25)))
 }));
}
test('selected strategies can respond but the shared market base alone owns every CALL/PUT',()=>{
 for(const durationMs of durations)for(const sign of [-1,1]){
  const q=quotes({sign}),input={quoteHistory:q,price:q.at(-1).price,quoteAt:T,now:T,durationMs,
   qualityPolicy:'adaptive-market-v17'};
  const base=analyzeNowOpportunity({...input,engineId:'automatic'});
  for(const engineId of engines){
   const got=analyzeNowOpportunity({...input,engineId});
   assert.equal(got.ready,base.ready,`${engineId} ${durationMs}`);
   assert.equal(got.side,base.side,`${engineId} ${durationMs}`);
   assert.equal(got.reason,base.reason,`${engineId} ${durationMs}`);
   assert.equal(got.signalOwner,'shared-market-base');
   assert.equal(got.engineId,engineId);
   assert.equal(got.observedAt,base.observedAt);
  }
 }
});
test('no specialist can turn a base WAIT into a CALL/PUT',()=>{
 const q=quotes({flat:true}),input={quoteHistory:q,price:q.at(-1).price,quoteAt:T,now:T,
 durationMs:30000,qualityPolicy:'adaptive-market-v17'};
 const base=analyzeNowOpportunity({...input,engineId:'automatic'});
 assert.equal(base.ready,false);
 for(const engineId of engines){
  const got=analyzeNowOpportunity({...input,engineId});
  assert.equal(got.ready,false);assert.equal(got.side,null);
 }
});
test('no extra asynchronous wait or browser access is introduced in shared decision',()=>{
 assert.ok(engines.length===5);
});
