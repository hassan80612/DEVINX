import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewDynamicEntryQuality} from '../sentinel-trading-lab/agent/src/core/dynamic-entry-quality.mjs';
const T=1800000000000;
const tape=p=>p.map((price,i)=>({ts:T-(p.length-1-i)*1000,
  receivedAt:T-(p.length-1-i)*1000,price}));
function check(p,side='CALL',durationMs=60000){
 const candidate={ready:true,reason:'closed-structure-and-live-impulse',
  side,observedAt:T,entryPrice:p.at(-1)};
 return reviewDynamicEntryQuality({candidate,quoteHistory:tape(p),quoteAt:T,
  now:T,price:p.at(-1),durationMs});
}
test('CALL at exhausted high after two real falling ticks is WAIT, not blind continuation',()=>{
 const p=[100,100.05,100.1,100.15,100.2,100.25,100.3,100.35,100.4,100.45,
  100.5,100.55,100.6,100.65,100.7,100.75,100.8,100.85,100.85,100.84,100.83];
 for(const ms of [30000,60000]){
  const v=check(p,'CALL',ms);
  assert.equal(v.ready,false,JSON.stringify(v));
  assert.equal(v.reason,'dynamic-extended-impulse-lost-momentum');
  assert.equal(v.entryQuality?.kind,'rejected-extreme-after-strong-leg');
  assert.equal(v.side,null);
 }
});
test('PUT at exhausted low with clear price rebound is WAIT too',()=>{
 const p=[100,100.05,100.1,100.15,100.2,100.25,100.3,100.35,100.4,100.45,
  100.5,100.55,100.6,100.65,100.7,100.75,100.8,100.85,100.85,100.84,100.83]
  .map(x=>200-x);
 const v=check(p,'PUT',60000);
 assert.equal(v.ready,false,JSON.stringify(v));
 assert.equal(v.entryQuality?.kind,'rejected-extreme-after-strong-leg');
});
test('fresh, accelerating breakout is still admitted without artificial wait',()=>{
 const p=[100,100.01,100.02,100.03,100.04,100.05,100.06,100.07,100.08,100.09,100.1,
  100.12,100.14,100.16,100.18,100.21,100.25,100.3,100.36,100.43,100.51];
 for(const ms of [30000,60000]){
  assert.equal(check(p,'CALL',ms).ready,true);
 }
});
test('not enough real quote data cannot manufacture a new reversal or change the expiry',()=>{
 const q=[100,100.05,100.1];
 const candidate={ready:true,reason:'closed-structure-and-live-impulse',side:'CALL',
  observedAt:T,entryPrice:q.at(-1)};
 for(const ms of [30000,60000,300000]){
  assert.equal(reviewDynamicEntryQuality({candidate,quoteHistory:tape(q),quoteAt:T,
   now:T,price:q.at(-1),durationMs:ms}),candidate);
 }
});
