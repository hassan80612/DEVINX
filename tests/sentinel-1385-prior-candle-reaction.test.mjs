import test from 'node:test';
import assert from 'node:assert/strict';
import {priorCandleReaction} from '../sentinel-trading-lab/agent/src/core/prior-candle-reaction.mjs';
import {causalForwardPath} from '../sentinel-trading-lab/agent/src/core/causal-closed-structure-1379.mjs';
import {confirmWindowEntry} from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';
const T=1800000000000,now=T+630000;
function scenario(sign=1,kind='rejection'){
 const q=[];
 for(let i=0;i<=630;i++){
  let p=100+i*.01+Math.sin(i/7)*.0001;
  if(i>=622)p=106.22+(kind==='rejection'?-1:1)*(i-622)*.012;
  if(kind==='spike'&&i>=622)p=i<630?106.22+(i-622)*.002:106.21;
  q.push({ts:T+i*1000,receivedAt:T+i*1000,price:sign>0?p:220-p});
 }
 const candles=[{from:(T+540000)/1000,to:(T+600000)/1000,
   high:sign>0?106.22:114.3,low:sign>0?105.7:113.78,open:106,close:106}];
 return {q,candles};
}
for(const sign of [1,-1]){
 test((sign>0?'high rejection':'low rejection')+' changes forecast at the actual prior level instead of chasing the old trend',()=>{
  const {q,candles}=scenario(sign);
  const old=causalForwardPath({quoteHistory:q,asOf:now,holdingSeconds:30,maxSeconds:60});
  const revised=causalForwardPath({quoteHistory:q,candles,asOf:now,holdingSeconds:30,maxSeconds:60});
  assert.equal(old.priceAt(30)>old.priceAt(0),sign>0);
  assert.equal(revised.regime,'level-rejection');
  assert.equal(revised.priceAt(30)>revised.priceAt(0),sign<0);
  const result=confirmWindowEntry({settings:{asset:'TEST',engine:'automatic',forecastMode:'continuous',clockMode:'current',orderDurationMs:30000},snap:{quoteHistory:q,candles,price:q.at(-1).price,quoteTs:now},now,forecastModel:'causal-closed-structure-1379'});
  assert.equal(result.side,sign>0?'PUT':'CALL');
 });
 test((sign>0?'high breakout':'low breakout')+' retains strong continuation without an extra entry lock',()=>{
  const {q,candles}=scenario(sign,'breakout');
  const a=causalForwardPath({quoteHistory:q,asOf:now,holdingSeconds:30,maxSeconds:60});
  const b=causalForwardPath({quoteHistory:q,candles,asOf:now,holdingSeconds:30,maxSeconds:60});
  assert.equal(b.levelReaction,null);assert.equal(a.priceAt(30),b.priceAt(30));
 });
}
test('one opposite tick, a forming candle or stale levels cannot manufacture a reversal',()=>{
 const {q,candles}=scenario(1,'spike');
 assert.equal(priorCandleReaction({quoteHistory:q,candles,asOf:now,sigma:.0001}),null);
 const good=scenario();
 assert.equal(priorCandleReaction({quoteHistory:good.q,candles:good.candles.map(c=>({...c,to:(now+10000)/1000})),asOf:now,sigma:.0001}),null);
 assert.equal(priorCandleReaction({quoteHistory:good.q,candles:good.candles.map(c=>({...c,from:c.from-600,to:c.to-600})),asOf:now,sigma:.0001}),null);
});
