import test from 'node:test';
import assert from 'node:assert/strict';
import {levelEntryPoints} from '../experiments/level-entry-points-20261018.mjs';
const T=1792250040000;
function scenario(prices,mirror=false){
 const quoteHistory=prices.map((p,i)=>({ts:T+(i-prices.length+1)*1000,
  receivedAt:T+(i-prices.length+1)*1000,price:mirror?200-p:p}));
 const zone={level:100,low:99.95,high:100.05,touches:2,pivots:1,ages:[10,20],
  confirmedPivots:1,independentRejections:2};
 return {quoteHistory,quoteAt:T,now:T,price:quoteHistory.at(-1).price,
  structure:{candles:100,asOf:T-60000,periodMs:60000,tolerance:.1,atr:1,
   averages:[{period:20,value:100,slope:0}],zones:[zone]}};
}
for(const mirror of [false,true]){
 test(`slowing approach retains causal approach direction ${mirror}`,()=>{
  const input=scenario([99.1,99.2,99.3,99.35,99.4,99.45,99.5,99.7,99.85,99.94,99.95,99.97,99.99],mirror);
  const e=levelEntryPoints(input).find(e=>e.kind==='slowing-approach-to-level');
  assert.ok(e);assert.equal(e.side,mirror?'PUT':'CALL');
 });
 test(`rejection direction and touch belong to observed approach ${mirror}`,()=>{
  const input=scenario([99.1,99.2,99.3,99.35,99.4,99.45,99.5,99.7,99.85,100.1,100.05,100.01,99.98],mirror);
  const e=levelEntryPoints(input).find(e=>e.kind==='detected-level-rejection');
  assert.ok(e);assert.equal(e.side,mirror?'CALL':'PUT');assert.equal(e.currentApproachTouch,true);
 });
 test(`held breakout follows the actual break ${mirror}`,()=>{
  const input=scenario([99.1,99.2,99.3,99.35,99.4,99.45,99.5,99.7,99.9,100.1,100.2,100.25,100.3],mirror);
  const e=levelEntryPoints(input).find(e=>e.kind==='detected-level-breakout');
  assert.ok(e);assert.equal(e.side,mirror?'PUT':'CALL');
 });
}
test('future and not-yet-received prices cannot alter selected points',()=>{
 const input=scenario([99.1,99.2,99.3,99.35,99.4,99.45,99.5,99.7,99.85,100.1,100.05,100.01,99.98]);
 const poisoned={...input,quoteHistory:[...input.quoteHistory,{ts:T+1,price:120,receivedAt:T+1},
  {ts:T-1000,price:80,receivedAt:T+1}]};
 assert.deepEqual(levelEntryPoints(poisoned),levelEntryPoints(input));
});
test('unverified, stale and future-history inputs cannot insert an entry',()=>{
 const input=scenario([99.1,99.2,99.3,99.35,99.4,99.45,99.5,99.7,99.85,100.1,100.05,100.01,99.98]);
 assert.deepEqual(levelEntryPoints({...input,price:101}),[]);
 assert.deepEqual(levelEntryPoints({...input,now:T+1451}),[]);
 assert.deepEqual(levelEntryPoints({...input,structure:{...input.structure,asOf:T+1}}),[]);
 assert.deepEqual(levelEntryPoints({...input,structure:{...input.structure,averages:[]}}),[]);
});
