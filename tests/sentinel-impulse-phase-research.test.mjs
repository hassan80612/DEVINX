import test from 'node:test';
import assert from 'node:assert/strict';
import {observedImpulsePhase,analyzeNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const start=Date.UTC(2026,9,15,12,0,0);
const prices=(changes,initial=1.1)=>{let price=initial;return changes.map((d,i)=>{
 price*=Math.exp(d);return {ts:start+i*1000,receivedAt:start+i*1000,price};
})};
test('detect end of CALL surge when last 2s loses strength',()=>{
 const quoteHistory=prices([...Array(60).fill(.000015),...Array(4).fill(.00013),...Array(3).fill(.000007)]);
 const last=quoteHistory.at(-1);
 const p=observedImpulsePhase({quoteHistory,quoteAt:last.ts,price:last.price,side:'CALL'});
 assert.equal(p.exhausted,true,JSON.stringify(p));
});
test('sustained CALL has no phantom impulse exhaustion',()=>{
 const quoteHistory=prices(Array(80).fill(.000015));
 const last=quoteHistory.at(-1);
 const p=observedImpulsePhase({quoteHistory,quoteAt:last.ts,price:last.price,side:'CALL'});
 assert.equal(p.exhausted,false,JSON.stringify(p));
});
test('mirror-symmetry: a strong PUT can also become exhausted',()=>{
 const quoteHistory=prices([...Array(60).fill(-.000015),...Array(4).fill(-.00013),...Array(3).fill(-.000007)]);
 const last=quoteHistory.at(-1);
 const p=observedImpulsePhase({quoteHistory,quoteAt:last.ts,price:last.price,side:'PUT'});
 assert.equal(p.exhausted,true,JSON.stringify(p));
});
test('future-arriving observations cannot alter phase diagnosis',()=>{
 const quoteHistory=prices([...Array(60).fill(.000015),...Array(4).fill(.00013),...Array(3).fill(.000007)]);
 const last=quoteHistory.at(-1),args={quoteHistory,quoteAt:last.ts,price:last.price,side:'CALL'};
 const expected=observedImpulsePhase(args);
 const actual=observedImpulsePhase({...args,quoteHistory:[...quoteHistory,
  {ts:last.ts-1500,receivedAt:last.ts+10000,price:last.price+1},
  {ts:last.ts+1000,receivedAt:last.ts+1000,price:last.price+1}]});
 assert.deepEqual(actual,expected);
});
test('phase-aware selection has same result as production for a constant trend',()=>{
 const quoteHistory=prices(Array(90).fill(.000015)),q=quoteHistory.at(-1);
 const baseline=analyzeNowOpportunity({quoteHistory,quoteAt:q.ts,price:q.price,now:q.ts,durationMs:30000,engineId:'automatic'});
 const trial=analyzeNowOpportunity({quoteHistory,quoteAt:q.ts,price:q.price,now:q.ts,durationMs:30000,engineId:'automatic',qualityPolicy:'phase-aware'});
 assert.equal(trial.ready,baseline.ready);
 assert.equal(trial.side,baseline.side);
});
