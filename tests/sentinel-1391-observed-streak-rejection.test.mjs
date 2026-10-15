import test from 'node:test';
import assert from 'node:assert/strict';
import {completedStreakStage,observedStreakRejection} from '../sentinel-trading-lab/agent/src/core/completed-streak-stage.mjs';
import {readFileSync} from 'node:fs';
const T=1800000000000;
function four(side='CALL',weak=false){
 const sign=side==='CALL'?1:-1;
 return Array.from({length:4},(_,i)=>{
  const open=1.1+sign*i*.001,body=weak&&i===3?.00012:.001;
  const close=open+sign*body;
  return {from:(T+i*30000)/1000,to:(T+(i+1)*30000)/1000,
   open,close,high:Math.max(open,close)+(weak&&i===3?.0014:0),
   low:Math.min(open,close)-(weak&&i===3?.0014:0)};
 });
}
test('13.9.1: continuing four-bar trend does not stop same-side entry',()=>{
 for(const side of ['CALL','PUT']){
  const candles=four(side),last=candles.at(-1),sigma=.00001;
  const stage=completedStreakStage({candles,quotePrice:last.close,asOf:T+120000,sigma});
  assert.equal(stage.side,side);
  assert.equal(stage.extended,true);
  assert.equal(observedStreakRejection({stage,side}),null);
 }
});
test('13.9.1: a weak fourth candle alone is not a blanket trend veto',()=>{
 for(const side of ['CALL','PUT']){
  const candles=four(side,true),last=candles.at(-1);
  const stage=completedStreakStage({candles,quotePrice:last.close,asOf:T+120000,sigma:.00001});
  assert.equal(observedStreakRejection({stage,side}),null);
 }
});
test('13.9.1: a real price retreat plus taper/rejection declines a late same-side entry',()=>{
 for(const side of ['CALL','PUT']){
  const candles=four(side,true),last=candles.at(-1),sign=side==='CALL'?1:-1;
  const stage=completedStreakStage({candles,quotePrice:last.close-sign*.00055,
   asOf:T+120000,sigma:.00001});
  assert.equal(stage.side,side);
  const bad=observedStreakRejection({stage,side});
  assert.equal(bad?.side,side,JSON.stringify(stage));
  assert.equal(observedStreakRejection({stage,side:side==='CALL'?'PUT':'CALL'}),null);
 }
});
test('13.9.1: unconfirmed quotes/different candles cannot invent a reversal',()=>{
 const cut=four('CALL').slice(-3);
 const stage=completedStreakStage({candles:cut,quotePrice:1.10,asOf:T+120000,sigma:.00001});
 assert.equal(observedStreakRejection({stage,side:'CALL'}),null);
});
test('13.9.1: check is applied at both selected future entry and source-quote confirmation',()=>{
 const source=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs',import.meta.url),'utf8');
 assert.match(source,/observedStreakRejection\(\{stage:causal\?\.streakStage,side:check\.side\}\)/);
 assert.match(source,/status:observedRejection\?'observed-streak-rejection'/);
 assert.match(source,/const observedRejection=check\.qualified\?/);
});
