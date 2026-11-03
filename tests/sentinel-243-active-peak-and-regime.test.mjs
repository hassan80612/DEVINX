import test from 'node:test';
import assert from 'node:assert/strict';
import {assessSpikeExhaustion242,reviewBoldSpikeReversal242}
 from '../sentinel-trading-lab/agent/src/core/spike-exhaustion-counterturn-242.mjs';
import {marketReading} from '../sentinel-trading-lab/agent/src/core/market-reading.mjs';
import {decisiveMarketRegime240} from '../sentinel-trading-lab/agent/src/core/decisive-market-regime-240.mjs';
import {assessDirectionalPersistence,advanceNowOpportunity}
 from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const T=1800000000000;
const spike=[0,1,2,3,4,5,6,7,8,9,10,11,15,25,40];
function ticks(values,side='CALL'){
 const sign=side==='CALL'?1:-1;
 return values.map((v,i)=>{const ts=T-(values.length-1-i)*1000;
  return {ts,receivedAt:ts,price:1.123+sign*v*.00001}});
}
function args(q,ms,side){
 return {candidate:{ready:true,side,reason:'historical-level-breakout',
  observedAt:q.at(-1).ts,entryPrice:q.at(-1).price},
  quoteHistory:q,quoteAt:q.at(-1).ts,now:q.at(-1).ts,price:q.at(-1).price,
  durationMs:ms};
}
test('243: a CALL continuation becomes PUT WHILE the latest incoming prices are still accelerating upward',()=>{
 for(const ms of [30000,60000]){
  const q=ticks(spike),input=args(q,ms,'CALL');
  assert.ok(q.at(-1).price>q.at(-2).price&&q.at(-2).price>q.at(-3).price);
  const e=assessSpikeExhaustion242(input);
  assert.equal(e.kind,'flip',JSON.stringify(e));
  assert.equal(e.activeClimax,true);assert.equal(e.side,'PUT');
  const result=reviewBoldSpikeReversal242(input);
  assert.equal(result.side,'PUT');
  assert.equal(result.reason,'active-spike-countertrade-243');
  assert.equal(result.originalDecisionSide,'CALL');
  assert.equal(marketReading({candidate:result}),'PICO ACELERADO · REVERSÃO ANTECIPADA · PUT');
  assert.equal(result.observedAt,input.quoteAt);
  const opportunity=advanceNowOpportunity({candidate:result,quoteAt:T,now:T,
   asset:'EUR/USD OTC',provider:'exnova',durationMs:ms});
  assert.equal(opportunity?.side,'PUT');
  assert.equal(opportunity?.holdingSeconds,ms/1000);
  assert.equal(opportunity?.exitAt-opportunity?.entryAt,ms);
 }
});
test('243: PUT becomes CALL while the quoted candle is still plunging, no contrary quotes',()=>{
 for(const ms of [30000,60000]){
  const q=ticks(spike,'PUT'),input=args(q,ms,'PUT');
  assert.ok(q.at(-1).price<q.at(-2).price);
  const e=assessSpikeExhaustion242(input);
  assert.equal(e.kind,'flip');assert.equal(e.side,'CALL');
  assert.equal(e.activeClimax,true);
 }
});
test('243: steady trend and unsupported 5m are not blindly inverted',()=>{
 const steady=Array.from({length:55},(_,i)=>i);
 for(const ms of [30000,60000]){
  const inp=args(ticks(steady),ms,'CALL');
  assert.notEqual(assessSpikeExhaustion242(inp).kind,'flip');
  assert.equal(reviewBoldSpikeReversal242(inp).side,'CALL');
 }
 const five=args(ticks(spike),300000,'CALL');
 assert.strictEqual(reviewBoldSpikeReversal242(five),five.candidate);
});
test('243: 35 seconds of genuinely progressing prices is a trend, never lateral',()=>{
 for(const direction of ['CALL','PUT'])for(const ms of [30000,60000]){
  const rows=ticks(Array.from({length:39},(_,i)=>i),direction),last=rows.at(-1);
  const input={quoteHistory:rows,quoteAt:last.ts,now:last.ts,price:last.price,durationMs:ms};
  const regime=decisiveMarketRegime240(input),phase=assessDirectionalPersistence(input);
  assert.equal(regime.kind,'trend',JSON.stringify(regime));
  assert.equal(regime.side,direction);
  assert.notEqual(phase.phase,'range',JSON.stringify(phase));
 }
});
test('243: too little data is unconfirmed, not falsely lateral',()=>{
 for(const ms of [30000,60000]){
  const q=ticks(Array.from({length:9},(_,i)=>i));
  const x={quoteHistory:q,quoteAt:T,now:T,price:q.at(-1).price,durationMs:ms};
  assert.equal(decisiveMarketRegime240(x).kind,'unconfirmed');
  assert.notEqual(assessDirectionalPersistence(x).phase,'range');
 }
});
