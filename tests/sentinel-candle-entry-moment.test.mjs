import test from 'node:test';
import assert from 'node:assert/strict';
import {candleEntryMoment} from '../experiments/candle-entry-moment-20261017.mjs';
import {advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const T=1792250040000;
function setup(points,side='CALL',previous={open:102,close:104,high:105,low:99}){
 const candles=[{from:T/1000-120,to:T/1000-60,open:100,close:102,high:103,low:98},
  {from:T/1000-60,to:T/1000,...previous}];
 const quoteHistory=points.map(([sec,price])=>({ts:T+sec*1000,receivedAt:T+sec*1000,price}));
 const last=quoteHistory.at(-1),snap={candles,predictionCandles:candles,historicalCandlesVerified:true,quoteHistory,quoteTs:last.ts,price:last.price};
 return {candidate:{ready:true,side,observedAt:last.ts,entryPrice:last.price},snap,now:last.ts,durationMs:30000};
}
const retest=[[10,105.5],[12,105.1],[19,105.15],[20,105.4]];
test('release is permitted on a fresh resumption after an observed breakout and retest',()=>{
 const r=candleEntryMoment(setup(retest));
 assert.equal(r.ready,true);assert.equal(r.side,'CALL');assert.equal(r.candleMoment.kind,'breakout-retest-resumption');
 assert.equal(r.observedAt,T+20000);assert.equal(r.entryPrice,105.4);
});
test('a first breakout without retest stays provisional; no timer manufactures confirmation',()=>{
 const r=candleEntryMoment(setup([[10,104.5],[19,105.1],[20,105.4]]));
 assert.equal(r.ready,false);assert.equal(r.side,null);assert.equal(r.provisionalSide,'CALL');
});
test('the previous candle wick can qualify an actual reclaim of its body',()=>{
 const r=candleEntryMoment(setup([[3,98.1],[18,102.9],[19,103.1],[20,103.3]],'CALL',{open:103,close:104,high:105,low:98}));
 assert.equal(r.ready,true);assert.equal(r.candleMoment.kind,'wick-rejection-body-reclaim');
});
test('mirroring the prices mirrors the direction and preserves the event type',()=>{
 const original=setup(retest),mirrored=setup(retest.map(([t,p])=>[t,220-p]),'PUT',
  {open:118,close:116,high:121,low:115});
 const a=candleEntryMoment(original),b=candleEntryMoment(mirrored);
 assert.equal(b.ready,a.ready);assert.equal(b.side,'PUT');assert.equal(b.candleMoment.kind,a.candleMoment.kind);
});
test('future prices and future closed-candle records cannot qualify the present entry',()=>{
 const a=setup(retest),b=structuredClone(a);
 b.snap.quoteHistory.push({ts:a.now+1000,price:120,receivedAt:a.now+1000});
 b.snap.predictionCandles.push({from:T/1000,to:T/1000+60,open:105,close:120,high:130,low:90,receivedAt:T+60000});
 assert.deepEqual(candleEntryMoment(b),candleEntryMoment(a));
});
test('a past crossing is not reused after its freshness allowance',()=>{
 const r=candleEntryMoment(setup([...retest,[25,105.45]]));
 assert.equal(r.ready,false);
});
test('a fresh signal uses the current quote; a stale quote cannot be relabeled as current',()=>{
 const valid=setup([...retest,[21.4,105.45]]),r=candleEntryMoment(valid);
 assert.equal(r.ready,true);assert.equal(r.entryPrice,105.45);assert.equal(r.observedAt,T+21400);
 const stale=setup(retest);stale.now+=1501;
 assert.equal(candleEntryMoment(stale).ready,false);
});
test('no certified candle source means no selective entry',()=>{
 const a=setup(retest);a.snap.historicalCandlesVerified=false;
 assert.equal(candleEntryMoment(a).ready,false);
});
test('entry lifecycle holds the released direction for 30 seconds and never reuses the expired event',()=>{
 const a=setup(retest),candidate=candleEntryMoment(a);
 const first=advanceNowOpportunity({candidate,quoteAt:a.snap.quoteTs,now:a.now,asset:'EUR/USD',engineId:'automatic',durationMs:30000});
 assert.equal(first.side,'CALL');assert.equal(first.exitAt-first.entryAt,30000);
 const held=advanceNowOpportunity({previous:first,candidate:{...candidate,side:'PUT',observedAt:a.now+1000},quoteAt:a.now+1000,now:a.now+1000,asset:'EUR/USD',engineId:'automatic',durationMs:30000});
 assert.equal(held.side,'CALL');assert.equal(held.entryReadyNow,false);
 const later=setup([...retest,[51,105.45]]);
 const next=advanceNowOpportunity({previous:held,candidate:candleEntryMoment(later),quoteAt:later.snap.quoteTs,now:later.now,asset:'EUR/USD',engineId:'automatic',durationMs:30000});
 assert.equal(next.phase,'scanning');assert.equal(next.entryReadyNow,false);
});
