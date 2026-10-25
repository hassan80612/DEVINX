import test from 'node:test';
import assert from 'node:assert/strict';
import {observedLevelSequence,applyObservedLevelSequence} from '../sentinel-trading-lab/agent/src/core/observed-level-sequence.mjs';
const T=1800000000000;
const levels=[102,100.6,101.3,99.4,100.2,99.9,101.8];
const quoteTape=()=>{
 const rows=[];
 for(let k=0;k<levels.length-1;k++)
  for(let i=0;i<10;i++)rows.push({ts:T+rows.length*500,price:levels[k]+(levels[k+1]-levels[k])*i/10});
 rows.push({ts:T+rows.length*500,price:101.8});
 return rows;
};
const map=()=>({observedCandles:100,asOf:T-60000,tolerance:.15,levels:[
 {low:100,high:100,level:100,confirmedPivots:2,independentTests:3,
 supportPivots:1,supportRejections:2,supportWick:.8,windows:[3,10,20,50,100]}
]});
const get=(rows)=>{const last=rows.at(-1);return {map:map(),quoteHistory:rows,
 quoteAt:last.ts,now:last.ts,price:last.price};};
test('first historical reclaim is still admitted on the real observable quote; all 7 expiries',()=>{
 const tape=quoteTape(),first=get(tape);
 const evidence=observedLevelSequence(first);
 assert.equal(evidence?.structureChange?.side,'CALL');
 assert.equal(evidence?.structureChange?.confirmedAt,tape.at(-1).ts);
 for(const durationMs of [5000,10000,15000,30000,60000,120000,300000]){
  const out=applyObservedLevelSequence({candidate:{ready:false,side:null},...first,durationMs});
  assert.equal(out.side,'CALL',String(durationMs));assert.equal(out.observedAt,tape.at(-1).ts);
 }
});
test('a completed OLD reversal cannot be restamped as fresh after prices keep travelling',()=>{
 const tape=quoteTape(),after=[...tape];
 for(let i=1;i<=8;i++)after.push({ts:tape.at(-1).ts+i*1000,price:101.8+i*.09});
 const score=observedLevelSequence(get(after));
 assert.equal(score?.structureChange??null,null);
 for(const durationMs of [5000,10000,15000,30000,60000,120000,300000]){
  const result=applyObservedLevelSequence({candidate:{ready:false,side:null},...get(after),durationMs});
  assert.notEqual(result.reason,'failed-breakout-structure-change');
 }
});
test('first observed turn and stale confirmation mirror for PUT',()=>{
 const base=quoteTape();const put=base.map(x=>({...x,price:202-x.price}));
 const levelsMap={...map(),levels:map().levels.map(z=>({...z,low:102-z.high,high:102-z.low,level:102-z.level,
  supportPivots:0,supportRejections:0,resistancePivots:1,resistanceRejections:2}))};
 const first=get(put);first.map=levelsMap;
 assert.equal(observedLevelSequence(first)?.structureChange?.side,'PUT');
 const stale=[...put,...Array.from({length:8},(_,i)=>({ts:put.at(-1).ts+(i+1)*1000,
  price:put.at(-1).price-(i+1)*.09}))];
 const late=get(stale);late.map=levelsMap;
 assert.equal(observedLevelSequence(late)?.structureChange??null,null);
});
test('original confirmation is not shifted later to next 5/10/15/30s candle',()=>{
 const tape=quoteTape(),at=tape.at(-1).ts;
 assert.notEqual(at%5000,0,'test uses non-rounded broker-quote evidence');
 assert.equal(observedLevelSequence(get(tape))?.structureChange?.confirmedAt,at);
});
