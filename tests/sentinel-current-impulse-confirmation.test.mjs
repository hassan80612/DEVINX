import test from 'node:test';
import assert from 'node:assert/strict';
import {currentImpulseConfirmation,qualifyCurrentImpulse} from '../experiments/current-impulse-confirmation-20261017.mjs';
import {analyzeNowOpportunity,advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const T=1792250040000;
function input(side='PUT',bounce=false){
 const sign=side==='CALL'?1:-1;
 const quotes=Array.from({length:181},(_,i)=>({ts:T+(i-180)*1000,price:1.1*Math.exp(sign*i*.00001)}));
 if(bounce)quotes.at(-1).price=quotes.at(-2).price*Math.exp(-sign*.000001);
 return {quoteHistory:quotes,quoteAt:T,price:quotes.at(-1).price,now:T,side};
}
for(const side of ['CALL','PUT'])test(`${side}: the released impulse rule can admit after the latest quote already reversed`,()=>{
 const a=input(side,true),old=analyzeNowOpportunity({...a,durationMs:30000,engineId:'automatic'});
 assert.equal(old.ready,true);assert.equal(old.side,side);assert.equal(old.reason,'closed-structure-and-live-impulse');
 assert.equal(currentImpulseConfirmation(a).confirmed,false);
});
test('sustained continuation remains eligible in both mirrored directions',()=>{
 for(const side of ['CALL','PUT'])assert.equal(currentImpulseConfirmation(input(side)).confirmed,true);
});
test('zero current net progress cannot be certified by an older six-second impulse',()=>{
 const a=input();a.quoteHistory.at(-1).price=a.quoteHistory.at(-4).price;a.price=a.quoteHistory.at(-1).price;
 assert.equal(currentImpulseConfirmation(a).confirmed,false);
});
test('an unchanged last quote remains eligible when the current three-second movement advances',()=>{
 const a=input();a.quoteHistory.at(-1).price=a.quoteHistory.at(-2).price;a.price=a.quoteHistory.at(-1).price;
 assert.equal(currentImpulseConfirmation(a).confirmed,true);
});
test('future data or late received records cannot alter the current decision',()=>{
 const a=input(),b={...a,quoteHistory:[...a.quoteHistory,{ts:T+1000,price:100,receivedAt:T+1000},{ts:T-500,price:100,receivedAt:T+1000}]};
 assert.deepEqual(currentImpulseConfirmation(b),currentImpulseConfirmation(a));
});
test('missing nearby references, stale quotes and a mismatched current price cannot certify an entry',()=>{
 const a=input();assert.equal(currentImpulseConfirmation({...a,now:T+1451}).confirmed,false);
 assert.equal(currentImpulseConfirmation({...a,price:a.price+.1}).confirmed,false);
 assert.equal(currentImpulseConfirmation({...a,quoteHistory:a.quoteHistory.filter(q=>q.ts>T-2500)}).confirmed,false);
});
test('a final impulse-only gate preserves unrelated reasons and all other durations',()=>{
 const a=input('PUT',true),candidate={ready:true,side:'PUT',reason:'closed-structure-and-live-impulse',observedAt:T,entryPrice:a.price};
 assert.equal(qualifyCurrentImpulse({candidate,...a}).ready,false);
 for(const reason of ['closed-range-extreme-reversal-confirmed','historical-level-rejection','break-retest-continuation','observed-trend-and-30s-cycle-projection']){
  const other={...candidate,reason};assert.equal(qualifyCurrentImpulse({candidate:other,...a}),other);
 }
 for(const durationMs of [5000,10000,15000,60000])assert.equal(qualifyCurrentImpulse({candidate,...a,durationMs}),candidate);
});
test('the held signal remains immutable for its full 30 seconds despite a later contradictory observation',()=>{
 const a=input(),candidate={ready:true,side:'PUT',reason:'closed-structure-and-live-impulse',observedAt:T,entryPrice:a.price};
 const initial=advanceNowOpportunity({candidate:qualifyCurrentImpulse({candidate,...a}),now:T,quoteAt:T,asset:'EUR/USD',engineId:'automatic',durationMs:30000});
 assert.equal(initial.exitAt-initial.entryAt,30000);
 const held=advanceNowOpportunity({previous:initial,candidate:{ready:false,side:null,reason:'research-continuation-without-current-followthrough'},now:T+1000,quoteAt:T+1000,asset:'EUR/USD',engineId:'automatic',durationMs:30000});
 assert.equal(held.side,'PUT');assert.equal(held.exitAt,initial.exitAt);
 const expired=advanceNowOpportunity({previous:held,candidate:{ready:false,side:null},now:T+30000,quoteAt:T+30000,asset:'EUR/USD',engineId:'automatic',durationMs:30000});
 assert.equal(expired.phase,'scanning');assert.equal(expired.entryReadyNow,false);
});
