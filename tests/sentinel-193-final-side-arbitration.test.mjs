import test from 'node:test';
import assert from 'node:assert/strict';
import {arbitrateFinalSide,assessCompetingSideEvidence} from '../sentinel-trading-lab/agent/src/core/final-side-arbitration.mjs';
const T=1800000000000;
const tape=(prices)=>prices.map((price,i)=>({price,ts:T-(prices.length-i-1)*1000,receivedAt:T-(prices.length-i-1)*1000}));
const run=(prices,reason,side='CALL',durationMs=30000,more={})=>{
 const cand={ready:true,side,reason,observedAt:T,entryPrice:prices.at(-1),...more};
 return arbitrateFinalSide({candidate:cand,quoteHistory:tape(prices),quoteAt:T,now:T,
  price:prices.at(-1),durationMs});
};
test('full arbiter: continuity loses the right to enter when a real opposite short turn is observed',()=>{
 const up=[100,100.1,100.2,100.3,100.4,100.5,100.6,100.7,100.8,100.9,
 101.0,101.1,101.2,101.3,101.4,101.5,101.6,101.55,101.4,101.25,101.1];
 const out=run(up,'closed-structure-and-live-impulse');
 assert.equal(out.ready,false,JSON.stringify(out));
 assert.equal(out.reason,'final-side-confirmed-countermove');
 assert.equal(out.side,null);
 assert.equal(out.sideArbitration.reversal.side,'PUT');
});
test('same rule blocks late PUT at a genuine short-term upward turn',()=>{
 const down=[102,101.9,101.8,101.7,101.6,101.5,101.4,101.3,101.2,101.1,
 101,100.9,100.8,100.7,100.6,100.5,100.4,100.45,100.6,100.75,100.9];
 const out=run(down,'closed-structure-and-live-impulse','PUT',60000);
 assert.equal(out.ready,false,JSON.stringify(out));
 assert.equal(out.sideArbitration.reversal.side,'CALL');
});
test('strong continuation with current supporting ticks is kept without timer',()=>{
 const prices=Array.from({length:21},(_,i)=>100+i*.07);
 for(const durationMs of [30000,60000]){
  const result=run(prices,'closed-structure-and-live-impulse','CALL',durationMs);
  assert.equal(result.ready,true);
  assert.equal(result.sideArbitration.decision,'KEEP');
 }
});
test('confirmed historical rejection is kept while current observed price supports its side',()=>{
 const prices=[101,101.02,101.04,101.06,101.08,101.10,101.12,101.14,101.16,101.18,101.20,
 101.21,101.22,101.23,101.24,101.23,101.21,101.18,101.15,101.12,101.07];
 const out=run(prices,'confirmed-level-structure-reversal','PUT',60000,
  {priceStructure:{confirmedReversal:{side:'PUT',kind:'confirmed-level-structure-reversal'}}});
 assert.equal(out.ready,true);
 assert.equal(out.sideArbitration.structuralTurn,true);
});
test('an older reversal cannot continue trading after strong live price invalidation',()=>{
 const prices=[101,100.97,100.94,100.91,100.88,100.85,100.82,100.79,100.76,
 100.73,100.70,100.67,100.64,100.61,100.58,100.59,100.66,100.74,100.81,100.88,100.96];
 const out=run(prices,'confirmed-level-structure-reversal','PUT',60000,
  {priceStructure:{confirmedReversal:{side:'PUT',kind:'confirmed-level-structure-reversal'}}});
 assert.equal(out.ready,false,JSON.stringify(out));
 assert.equal(out.reason,'final-side-reversal-price-invalidation');
});
test('5m, no new quotes, expired or stale candidate does not alter existing signal or expiry',()=>{
 const prices=Array.from({length:21},(_,i)=>100+i*.07),cand={
  ready:true,side:'CALL',observedAt:T,entryPrice:prices.at(-1),reason:'closed-structure-and-live-impulse'
 };
 const base={candidate:cand,quoteHistory:tape(prices),quoteAt:T,now:T,price:prices.at(-1)};
 assert.equal(arbitrateFinalSide({...base,durationMs:300000}),cand);
 assert.equal(arbitrateFinalSide({...base,quoteHistory:[],durationMs:60000}),cand);
 assert.equal(arbitrateFinalSide({...base,candidate:{...cand,ready:false},durationMs:60000}).ready,false);
 assert.equal(arbitrateFinalSide({...base,quoteAt:T-1000,durationMs:60000}),cand);
});
test('every final decision calculates BOTH independent side readings on the same causal buffer',()=>{
 const p=Array.from({length:21},(_,i)=>100+i*.06),cand={ready:true,side:'CALL',
  observedAt:T,entryPrice:p.at(-1),reason:'historical-level-breakout'};
 const proof=assessCompetingSideEvidence({candidate:cand,quoteHistory:tape(p),quoteAt:T,now:T,
  price:p.at(-1),durationMs:30000});
 assert.equal(proof.continuity.side,'CALL');
 assert.equal(proof.reversal.independentlyObserved,false);
 assert.ok(proof.observedNoise>0);
});
