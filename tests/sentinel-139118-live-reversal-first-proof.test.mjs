import test from 'node:test';
import assert from 'node:assert/strict';
import {observedLevelSequence,applyObservedLevelSequence} from '../sentinel-trading-lab/agent/src/core/observed-level-sequence.mjs';
const T=1800000000000;
const levels=[102,100.6,101.3,99.4,100.2,99.9,101.8];
const quoteTape=()=>{
 const rows=[];
 for(let k=0;k<levels.length-1;k++)
  for(let i=0;i<10;i++)rows.push({ts:T+rows.length*500,price:levels[k]+(levels[k+1]-levels[k])*i/10});
 rows.push({ts:T+rows.length*500+250,price:101.8});
 return rows;
};
const map=()=>({observedCandles:100,asOf:T-60000,tolerance:.15,levels:[
 {low:100,high:100,level:100,confirmedPivots:2,independentTests:3,
 supportPivots:1,supportRejections:2,supportWick:.8,windows:[3,10,20,50,100]}
]});
const get=(rows)=>{const last=rows.at(-1);return {map:map(),quoteHistory:rows,
 quoteAt:last.ts,now:last.ts,price:last.price};};
const firstReclaim=(tape,zone=map())=>{
 for(let i=5;i<tape.length;i++){
  const q=get(tape.slice(0,i+1));q.map=zone;
  if(observedLevelSequence(q)?.structureChange)return q;
 }
 return null;
};
test('first historical reclaim is still admitted on the real observable quote; all 7 expiries',()=>{
 const tape=quoteTape(),first=firstReclaim(tape);
 assert.ok(first,'the recording must have a genuine original structure-break quote');
 const evidence=observedLevelSequence(first);
 assert.equal(evidence?.structureChange?.side,'CALL');
 assert.equal(evidence?.structureChange?.confirmedAt,first.quoteAt);
 for(const durationMs of [5000,10000,15000,30000,60000,120000,300000]){
  const out=applyObservedLevelSequence({candidate:{ready:false,side:null},...first,durationMs});
  assert.equal(out.side,'CALL',String(durationMs));assert.equal(out.observedAt,first.quoteAt);
 }
});
test('a past reversal may stay an observation but cannot flip a qualified CURRENT opposite decision',()=>{
 const tape=quoteTape(),after=[...tape];
 for(let i=1;i<=8;i++)after.push({ts:tape.at(-1).ts+i*1000,price:101.8+i*.09});
 const late=get(after),old=observedLevelSequence(late)?.structureChange;
 assert.equal(old?.side,'CALL');
 assert.ok(old.firstConfirmedAt<late.quoteAt,'original market confirmation was earlier than this quote');
 for(const durationMs of [5000,10000,15000,30000,60000,120000,300000]){
  const prior={ready:true,side:'PUT',reason:'confirmed-current-market-sell',
   observedAt:late.quoteAt,entryPrice:late.price};
  const result=applyObservedLevelSequence({candidate:prior,...late,durationMs});
  assert.equal(result.side,'PUT',String(durationMs));
  assert.notEqual(result.reason,'failed-breakout-structure-change');
  const unqualified=applyObservedLevelSequence({candidate:{ready:false,side:null},
   ...late,durationMs});
  assert.equal(unqualified.side,'CALL','preserve the 13.9.117 admission path for waiting setups');
 }
});
test('first observed turn and stale confirmation mirror for PUT',()=>{
 const base=quoteTape();const put=base.map(x=>({...x,price:202-x.price}));
 const levelsMap={...map(),levels:map().levels.map(z=>({...z,low:202-z.high,high:202-z.low,level:202-z.level,
  supportPivots:0,supportRejections:0,resistancePivots:1,resistanceRejections:2}))};
 const first=firstReclaim(put,levelsMap);
 assert.ok(first,'mirror must have a first observed PUT structure break');
 assert.equal(observedLevelSequence(first)?.structureChange?.side,'PUT');
 const stale=[...put,...Array.from({length:8},(_,i)=>({ts:put.at(-1).ts+(i+1)*1000,
  price:put.at(-1).price-(i+1)*.09}))];
 const late=get(stale);late.map=levelsMap;
 const old=observedLevelSequence(late)?.structureChange;
 assert.equal(old?.side,'PUT');
 assert.ok(old.firstConfirmedAt<late.quoteAt);
 const prior={ready:true,side:'CALL',observedAt:late.quoteAt,entryPrice:late.price};
 for(const durationMs of [5000,10000,15000,30000,60000,120000,300000]){
  const result=applyObservedLevelSequence({candidate:prior,...late,durationMs});
  assert.equal(result.side,'CALL');
 }
});
test('original confirmation is not shifted later to next 5/10/15/30s candle',()=>{
 const tape=quoteTape(),first=firstReclaim(tape);
 assert.ok(first);
 assert.equal(observedLevelSequence(first)?.structureChange?.confirmedAt,first.quoteAt);
 assert.equal(first.quoteAt,first.quoteHistory.at(-1).ts);
 assert.equal(first.quoteHistory.at(-1).price,first.price);
});
