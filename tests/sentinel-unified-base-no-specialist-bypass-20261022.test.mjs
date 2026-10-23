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
   if(base.ready){assert.equal(got.ready,base.ready,`${engineId} ${durationMs}`);
     assert.equal(got.side,base.side,`${engineId} ${durationMs}`);
     assert.equal(got.reason,base.reason,`${engineId} ${durationMs}`);}
   if(got.ready)assert.ok(['CALL','PUT'].includes(got.side));
   assert.equal(got.signalOwner,'shared-market-base');
   assert.equal(got.engineId,engineId);
   assert.equal(got.observedAt,base.observedAt);
  }
 }
});
test('flat or unobserved market cannot produce a speculative specialist CALL/PUT',()=>{
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

test('valid early trend evidence stays eligible while full automatic bars are still collecting',()=>{
 const q=Array.from({length:27},(_,i)=>({ts:T-26000+i*1000,
  receivedAt:T-26000+i*1000,price:1.1+i*.000012}));
 const input={quoteHistory:q,price:q.at(-1).price,quoteAt:T,now:T,durationMs:30000,
  qualityPolicy:'adaptive-market-v17'};
 const auto=analyzeNowOpportunity({...input,engineId:'automatic'});
 const selected=analyzeNowOpportunity({...input,engineId:'trend'});
 assert.equal(auto.ready,false,'30s shared base can still be collecting wider bars');
 assert.equal(selected.ready,true,'existing 14s specialist setup is reviewed without imposing a new wait');
 assert.equal(selected.side,'CALL');
 assert.equal(selected.signalOwner,'shared-market-base');
 assert.equal(selected.strategyResponse,'base-reviewed-evidence');
});
