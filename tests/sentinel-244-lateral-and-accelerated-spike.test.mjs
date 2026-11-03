import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {analyzeCausalRange244} from '../sentinel-trading-lab/agent/src/core/range-opportunity-244.mjs';
import {assessCarryoverSpike244} from '../sentinel-trading-lab/agent/src/core/carryover-spike-244.mjs';
import {reviewBoldSpikeReversal242} from '../sentinel-trading-lab/agent/src/core/spike-exhaustion-counterturn-242.mjs';
const T=Date.UTC(2026,9,1),running=(period,length=540)=>Array.from({length},(_,i)=>{
 const ts=T+i*1000;
 const log=Math.log(1.082)+.00068*Math.sin(2*Math.PI*i/period)+.000009*Math.sin(i*1.73)+.000006*Math.cos(i*.45);
 return {ts,receivedAt:ts,price:Math.exp(log)};
});
const input=(q,i,ms)=>({quoteHistory:q.slice(0,i+1),quoteAt:q[i].ts,now:q[i].ts,
  price:q[i].price,durationMs:ms});
test('244: repeated 48-second lateral swing admits 1m opportunities without changing the requested expiry',()=>{
 const q=running(48);
 const oldMissingGate=Array.from({length:30},(_,j)=>{
  const i=190+j,arg=input(q,i,60000);
  return analyzeNowOpportunity(arg);
 });
 const signals=oldMissingGate.filter(x=>x.ready);
 assert.ok(signals.length>0,'The old 243 blocked all 60s range entries');
 for(const s of signals){
  assert.equal(s.reason,'verified-range-expiry-analogue-244');
  assert.equal(s.expirySeconds,60);
  assert.ok(['CALL','PUT'].includes(s.side));
  assert.equal(s.proof,'historical-expiry-outcomes-only');
 }
});
test('244: refuses 60s trade on a 60s round trip that cannot win the chosen expiry',()=>{
 const q=running(60);
 for(let i=180;i<260;i++){
  const x=analyzeCausalRange244(input(q,i,60000));
  assert.equal(x.ready,false);
 }
});
test('244: trends are not misclassified as an eligible range, nor is stale quote accepted',()=>{
 const q=Array.from({length:241},(_,i)=>({ts:T+i*1000,receivedAt:T+i*1000,price:1.08+i*.000004}));
 const a=input(q,240,60000);
 assert.equal(analyzeCausalRange244(a).ready,false);
 assert.equal(analyzeCausalRange244({...a,now:a.quoteAt+5000}).ready,false);
 assert.equal(analyzeCausalRange244({...a,durationMs:300000}).ready,false);
});
function tallCandle(ms=60000,direction='CALL',big=true){
 const boundary=T+180000, sign=direction==='CALL'?1:-1;
 let spot=1.1;
 const tape=[];
 for(let i=-3*ms/1000;i<=4;i++){
  const ts=boundary+i*1000;
  if(i<0){
   const which=Math.floor((i+3*ms/1000)/(ms/1000));
   spot+=sign*(which===2?(big?3.1:1):which===1?.7:1)*.000001;
  }else spot+=sign*.6*.000001;
  tape.push({ts,receivedAt:ts,price:spot});
 }
 return {candidate:{ready:true,side:direction,reason:'failed-breakout-structure-change'},
  quoteHistory:tape,quoteAt:tape.at(-1).ts,now:tape.at(-1).ts,price:tape.at(-1).price,durationMs:ms};
}
test('244: oversized previous up-candle flips CALL to PUT at next candle opening while new ticks are STILL RISING',()=>{
 for(const ms of [30000,60000]){
  const a=tallCandle(ms,'CALL'),r=reviewBoldSpikeReversal242(a),e=assessCarryoverSpike244(a);
  assert.equal(e.kind,'flip');assert.equal(e.carryoverClimax,true);
  assert.equal(r.side,'PUT');assert.equal(r.originalDecisionSide,'CALL');
  assert.equal(r.spikeExhaustion?.carryoverClimax,true);
  assert.equal(r.reason,'active-spike-countertrade-243');
 }
});
test('244: oversized previous down-candle flips PUT to CALL at next open while new ticks are STILL FALLING',()=>{
 for(const ms of [30000,60000]){
  const a=tallCandle(ms,'PUT'),r=reviewBoldSpikeReversal242(a);
  assert.equal(r.side,'CALL');
  assert.equal(r.spikeExhaustion?.carryoverClimax,true);
 }
});
test('244: healthy preceding candle, existing opposite reversal and 5m are never inverted',()=>{
 for(const ms of [30000,60000]){
  const a=tallCandle(ms,'CALL',false);
  assert.notEqual(assessCarryoverSpike244(a).kind,'flip');
  assert.equal(reviewBoldSpikeReversal242(a).side,'CALL');
  const b=tallCandle(ms,'CALL',true);
  const p={...b,candidate:{ready:true,side:'PUT',reason:'confirmed-level-structure-reversal'}};
  assert.equal(reviewBoldSpikeReversal242(p).side,'PUT');
  assert.equal(assessCarryoverSpike244({...b,now:b.now+3200}).kind,'none');
 }
 const five=tallCandle(60000,'CALL',true);
 assert.equal(assessCarryoverSpike244({...five,durationMs:300000}).kind,'none');
});
