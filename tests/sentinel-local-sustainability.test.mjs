import test from 'node:test';
import assert from 'node:assert/strict';
import {observedLevelSequence,applyObservedLevelSequence} from '../sentinel-trading-lab/agent/src/core/observed-level-sequence.mjs';
import {advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const T=1792250000000;
function input(vertices,mirror=false){
 const prices=[vertices[0]];
 for(const end of vertices.slice(1)){
  const start=prices.at(-1),steps=Math.round(Math.abs(end-start)*10);
  for(let i=1;i<=steps;i++)prices.push(start+(end-start)*i/steps);
 }
 const quoteHistory=prices.map((price,i)=>({ts:T-(prices.length-1-i)*1000,price:mirror?200-price:price}));
 return {map:{observedCandles:100,asOf:T-60000,tolerance:.15,
  levels:[90,100,110].map(level=>({low:level,high:level,level,confirmedPivots:2,independentTests:3}))},
  quoteHistory,quoteAt:T,now:T,price:quoteHistory.at(-1).price,durationMs:30000};
}
for(const mirror of [false,true]){
 const side=mirror?'PUT':'CALL',opposite=mirror?'CALL':'PUT';
 test(`${side}: an already qualified fast V reclaim is not forced to wait for a second pullback`,()=>{
  const args=input([102,100.6,101.3,99.4,101.8],mirror);
  const event=observedLevelSequence(args).structureChange;
  assert.equal(event.side,side);
  const result=applyObservedLevelSequence({candidate:{ready:false,side:null},...args});
  assert.equal(result.ready,true);assert.equal(result.side,side);assert.equal(result.observedAt,T);
 });
 test(`${side}: a small intermediate swing does not erase an intact historical rejection`,()=>{
  const args=input([100,103,102.5,105,103.5,103.8,101.5],!mirror);
  args.map.levels=[90,105].map(level=>({low:level,high:level,level,confirmedPivots:2,independentTests:3}));
  if(!mirror)args.map.levels=args.map.levels.map(z=>({...z,low:200-z.high,high:200-z.low,level:200-z.level}));
  const event=observedLevelSequence(args).continuation;
  assert.equal(event?.side,side);
  assert.equal(event.pivotPrice,mirror?105:95);
  assert.ok(event.room>event.projectedMove);
  const waiting=applyObservedLevelSequence({candidate:{ready:false,side:null},...args});
  assert.equal(waiting.ready,false);assert.equal(waiting.side,null);
  const candidate=applyObservedLevelSequence({candidate:{ready:true,side:opposite},...args});
  const fired=advanceNowOpportunity({candidate,now:T,quoteAt:T,asset:'EUR',durationMs:30000});
  assert.equal(fired.side,side);assert.equal(fired.entryAt,T);assert.equal(fired.exitAt,T+30000);
  const held=advanceNowOpportunity({previous:fired,candidate:{...candidate,side:opposite,observedAt:T+1000},now:T+1000,quoteAt:T+1000,asset:'EUR',durationMs:30000});
  assert.equal(held.side,side);assert.equal(held.entryReadyNow,false);
 });
 test(`${side}: a broken major anchor cannot be revived by a later small swing`,()=>{
  const args=input([100,103,102.5,105,103.5,107,105.5,105.8,103.5],mirror);
  args.map.levels=[90,105].map(level=>({low:level,high:level,level,confirmedPivots:2,independentTests:3}));
  if(mirror)args.map.levels=args.map.levels.map(z=>({...z,low:200-z.high,high:200-z.low,level:200-z.level}));
  assert.equal(observedLevelSequence(args).continuation,null);
 });
 test(`${side}: a newer opposing major reaction takes precedence over the older anchor`,()=>{
  const args=input([100,103,102.5,105,90,103,100],mirror);
  args.map.levels=[90,105].map(level=>({low:level,high:level,level,confirmedPivots:2,independentTests:3}));
  if(mirror)args.map.levels=args.map.levels.map(z=>({...z,low:200-z.high,high:200-z.low,level:200-z.level}));
  assert.equal(observedLevelSequence(args).continuation,null);
 });
 test(`${side}: an older anchor cannot bypass a nearer historical barrier`,()=>{
  const args=input([100,103,102.5,105,103.5,103.8,101.5],mirror);
  args.map.levels=[90,101.3,105].map(level=>({low:level,high:level,level,confirmedPivots:2,independentTests:3}));
  if(mirror)args.map.levels=args.map.levels.map(z=>({...z,low:200-z.high,high:200-z.low,level:200-z.level}));
  assert.equal(observedLevelSequence(args).continuation,null);
 });
 test(`${side}: a missing market segment cannot connect the old major anchor to the current leg`,()=>{
  const args=input([100,103,102.5,105,103.5,103.8,101.5],mirror);
  args.map.levels=[90,105].map(level=>({low:level,high:level,level,confirmedPivots:2,independentTests:3}));
  if(mirror)args.map.levels=args.map.levels.map(z=>({...z,low:200-z.high,high:200-z.low,level:200-z.level}));
  args.quoteHistory=args.quoteHistory.map((q,i)=>i<args.quoteHistory.length-15?{...q,ts:q.ts-10000}:q);
  assert.equal(observedLevelSequence(args).continuation,null);
 });
}
