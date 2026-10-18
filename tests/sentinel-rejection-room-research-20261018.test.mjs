import test from 'node:test';
import assert from 'node:assert/strict';
import {qualifyRejectionRoom} from '../experiments/rejection-room-20261018.mjs';
const T=Date.UTC(2026,9,18,16),quotes=Array.from({length:181},(_,i)=>({ts:T+(i-180)*1000,price:100+i*.01}));
const price=quotes.at(-1).price,candidate={ready:true,side:'CALL',reason:'historical-level-rejection',entryPrice:price};
const input={candidate,quoteHistory:quotes,quoteAt:T,now:T,price,durationMs:30000,
 map:{asOf:T-1000,tolerance:.01,levels:[{level:price+.1,confirmedPivots:1,independentRejections:0}]}};
test('a confirmed opposing level inside the observed 30s movement blocks standalone rejection',()=>{
 const result=qualifyRejectionRoom(input);
 assert.equal(result.ready,false);assert.equal(result.reason,'rejection-room-before-opposing-level');
 assert.equal(result.researchRoom.completedMoves,6);
});
test('more room and a price already beyond the old wall keep the current entry',()=>{
 const distant={...input,map:{...input.map,levels:[{...input.map.levels[0],level:price+1}]}};
 assert.deepEqual(qualifyRejectionRoom(distant),candidate);
 const broken={...input,map:{...input.map,levels:[{...input.map.levels[0],level:price-.1}]}};
 assert.deepEqual(qualifyRejectionRoom(broken),candidate);
});
test('support below price gives the symmetric PUT check',()=>{
 const mirrored=quotes.map(q=>({...q,price:2*price-q.price}));
 const result=qualifyRejectionRoom({...input,candidate:{...candidate,side:'PUT'},quoteHistory:mirrored,
  map:{...input.map,levels:[{...input.map.levels[0],level:price-.1}]}});
 assert.equal(result.ready,false);
});
test('future and not-yet-received quotes cannot change the room measurement',()=>{
 assert.deepEqual(qualifyRejectionRoom({...input,quoteHistory:[...quotes,
  {ts:T+1,receivedAt:T+1,price:500},{ts:T-1000,receivedAt:T+1,price:500}]}),qualifyRejectionRoom(input));
});
test('sparse context and unrelated admission paths preserve the baseline without a new collection timer',()=>{
 assert.deepEqual(qualifyRejectionRoom({...input,quoteHistory:quotes.slice(-60)}),candidate);
 for(const reason of ['break-retest-continuation','failed-breakout-structure-change','closed-structure-and-live-impulse']){
  const entry={...candidate,reason};assert.deepEqual(qualifyRejectionRoom({...input,candidate:entry}),entry);
 }
});
