import test from 'node:test';
import assert from 'node:assert/strict';
import {observedLevelSequence,applyObservedLevelSequence} from '../sentinel-trading-lab/agent/src/core/observed-level-sequence.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const T=1792250000000;
const expiries=[30000,60000,300000];
const level=p=>({low:p,high:p,level:p,confirmedPivots:2,independentTests:3,tests:[{age:1},{age:3},{age:5}],windows:[3,10,20,50,100]});
function fixture(vertices,mirror=false){
 const rows=[];
 for(let k=0;k<vertices.length-1;k++)for(let i=0;i<10;i++)rows.push({ts:T+rows.length*500,price:vertices[k]+(vertices[k+1]-vertices[k])*i/10});
 rows.push({ts:T+rows.length*500,price:vertices.at(-1)});
 if(mirror)for(const q of rows)q.price=200-q.price;
 return {rows,map:{observedCandles:100,asOf:T-60000,tolerance:.15,levels:[level(100)],windows:[]}};
}
const input=(f,rows=f.rows)=>({map:f.map,quoteHistory:rows,quoteAt:rows.at(-1).ts,now:rows.at(-1).ts,price:rows.at(-1).price});
const firstEvent=f=>{
 for(let i=1;i<=f.rows.length;i++){
  const rows=f.rows.slice(0,i),event=observedLevelSequence(input(f,rows))?.structureChange;
  if(event)return {rows,event};
 }
 assert.fail('fixture must contain a causally observed structure break');
};
test('the first reclaim confirmation keeps its actual timestamp as later prices arrive, on both sides',()=>{
 for(const vertices of [[102,100.6,101.3,99.4,100.2,99.9,101.8]])for(const mirror of [false,true]){
  const f=fixture(vertices,mirror),first=firstEvent(f),sign=first.event.side==='CALL'?1:-1;
  const rows=[...f.rows],end=rows.at(-1);
  for(let i=1;i<=20;i++)rows.push({ts:end.ts+i*500,price:end.price+sign*i*.005});
  const event=observedLevelSequence(input(f,rows)).structureChange;
  assert.ok(event);assert.equal(event.kind,first.event.kind);
  assert.equal(event.confirmedAt,first.event.confirmedAt,'a later quote cannot restamp an older break');
  assert.equal(event.pivotPrice,first.event.pivotPrice);
 }
});
test('a current structural confirmation remains immediately eligible at all expiries; an older event cannot wake a waiting candidate',()=>{
 for(const mirror of [false,true]){
  const f=fixture([102,100.6,101.3,99.4,100.2,99.9,101.8],mirror),first=firstEvent(f);
  for(const durationMs of expiries){
   const candidate={ready:false,side:null},fresh=applyObservedLevelSequence({candidate,...input(f,first.rows),durationMs});
   assert.equal(fresh.ready,true);assert.equal(fresh.side,mirror?'PUT':'CALL');
   assert.equal(fresh.observedAt,first.event.confirmedAt);
   const late=applyObservedLevelSequence({candidate,...input(f),durationMs});
   assert.equal(late.ready,false);assert.equal(late.side,null);
   assert.ok(late.priceStructure.observedSequence.structureChange.confirmedAt<f.rows.at(-1).ts-1450,'the historical event retains an old proof time');
  }
 }
});
test('an old structural event cannot replace an independently ready current decision',()=>{
 for(const mirror of [false,true])for(const durationMs of expiries){
  const f=fixture([102,100.6,101.3,99.4,100.2,99.9,101.8],mirror),a=input(f);
  const candidate={ready:true,side:mirror?'CALL':'PUT',reason:'independent-current-decision',observedAt:a.now,entryPrice:a.price};
  const out=applyObservedLevelSequence({candidate,...a,durationMs});
  assert.equal(out.side,candidate.side);assert.equal(out.reason,candidate.reason);assert.equal(out.observedAt,a.now);
 }
});
test('break/retest confirms only an already qualified, agreeing continuation at the selected expiry',()=>{
 for(const mirror of [false,true])for(const durationMs of expiries){
  const f=fixture([102,100.4,100.9,99,100,99.7,98.6],mirror),a=input(f);
  const event=observedLevelSequence(a).structureChange,side=mirror?'CALL':'PUT';
  assert.equal(event.kind,'break-retest-continuation');assert.equal(event.confirmedAt,a.quoteAt);
  const waiting={ready:false,side:null,reason:'own-horizon-not-qualified',expirySeconds:durationMs/1000};
  const unready=applyObservedLevelSequence({candidate:waiting,...a,durationMs});
  assert.equal(unready.ready,false);assert.equal(unready.reason,waiting.reason);
  const qualified={ready:true,side,reason:'own-horizon-qualified',expirySeconds:durationMs/1000};
  const fresh=applyObservedLevelSequence({candidate:qualified,...a,durationMs});
  assert.equal(fresh.ready,true);assert.equal(fresh.side,side);assert.equal(fresh.observedAt,a.quoteAt);
  assert.equal(fresh.expirySeconds,durationMs/1000);
  const conflicting=applyObservedLevelSequence({candidate:{...qualified,side:mirror?'PUT':'CALL'},...a,durationMs});
  assert.equal(conflicting.ready,false);assert.equal(conflicting.side,null);
  assert.equal(conflicting.reason,'retest-versus-horizon-direction-conflict');
 }
});
test('the existing quote freshness limit is measured from the proof, with no additional waiting period',()=>{
 const f=fixture([102,100.6,101.3,99.4,100.2,99.9,101.8]),first=firstEvent(f),a=input(f,first.rows);
 for(const delay of [0,1000,1450,1451]){
  const out=applyObservedLevelSequence({candidate:{ready:false,side:null},...a,now:a.now+delay,durationMs:60000});
  assert.equal(out.ready,delay<=1450);
 }
});
test('the short-horizon gate blocks generic reclaims while other expiries retain the existing event behavior',()=>{
 for(const mirror of [false,true]){
  const f=fixture([102,100.6,101.3,99.4,100.2,99.9,101.8],mirror),first=firstEvent(f);
  for(const engine of ['automatic','trend','support_resistance','smart_confluence','fibonacci_retest'])for(const durationMs of expiries)for(const fresh of [true,false]){
   const a=input(f,fresh?first.rows:f.rows),rt=new DemoTradingRuntime({enableVNext:true,forecastModel:'short-probability-v1'});
   rt.patchSettings({engine,orderDurationMs:durationMs},'event-origin-regression');
   rt.structureCache={get:()=>({candles:100,asOf:f.map.asOf,tolerance:f.map.tolerance,atr:1.5,averages:[],zones:f.map.levels,candleLevelMap:f.map})};
   const out=rt._signalValidationGate({analysis:{},settings:rt.settings,now:a.now,snap:{provider:'exnova',price:a.price,quoteTs:a.quoteAt,quoteHistory:a.quoteHistory,candles:[],historicalCandlesVerified:true}});
   const v=out.analysis.vnext,label=[mirror,engine,durationMs,fresh].join('|');
   if(fresh&&(durationMs===30000||durationMs===60000)){
    assert.equal(v.futureEntryAnchor,null,label);
    assert.equal(v.nowObservation.reason,'short-horizon-setup-not-eligible',label);
   }else if(fresh){
    assert.equal(v.futureEntryAnchor?.side,mirror?'PUT':'CALL',label);
    assert.equal(v.nowObservation.reason,'failed-breakout-structure-change',label);
   }else {
    assert.notEqual(v.nowObservation.reason,'failed-breakout-structure-change',label);
    if(engine==='automatic'&&durationMs===60000)assert.equal(v.futureEntryAnchor,null,label);
    // An independently ready strategy may still enter on current evidence.
    if(v.futureEntryAnchor)assert.equal(v.nowObservation.ready,true,label);
   }
  }
 }
});

test('a reclaim cannot invent a structure change from a pivot preceding the breakdown or a worsening second extreme',()=>{
 for(const mirror of [false,true])for(const vertices of [
  [102,101,102,99,103],
  [102,100.6,101.3,99.4,100.2,99,101.8]
 ]){
  const f=fixture(vertices,mirror);
  const event=observedLevelSequence(input(f))?.structureChange;
  assert.notEqual(event?.kind,'failed-breakout-structure-change',JSON.stringify({mirror,vertices,event}));
 }
});

test('reclaim respects directional level evidence and allows a real observed role change',()=>{
 for(const mirror of [false,true]){
  const originalRole=mirror?'support':'resistance',neededRole=mirror?'resistance':'support';
  for(const roleChanged of [false,true]){
   const f=fixture(roleChanged?[102,100.6,101.3,99.4,100.2,99.9,101.8]:
    [102,100.6,101.3,99.2,99.95,99.55,101.8],mirror);
   Object.assign(f.map.levels[0],{[originalRole+'Pivots']:2,[originalRole+'Rejections']:3,
    [neededRole+'Pivots']:0,[neededRole+'Rejections']:0});
   const event=observedLevelSequence(input(f))?.structureChange;
   if(roleChanged){assert.equal(event?.kind,'failed-breakout-structure-change');assert.equal(event.side,mirror?'PUT':'CALL');}
   else assert.notEqual(event?.kind,'failed-breakout-structure-change','a resistance cannot silently become support (or the reverse)');
  }
 }
});

test('later improving pivot pairs cannot mint another reclaim event for the same original break',()=>{
 for(const mirror of [false,true]){
  const f=fixture([102,100.6,101.3,99.4,100.2,99.9,101.8,100.8,101.5,101.1,102],mirror);
  const first=firstEvent(f),event=observedLevelSequence(input(f)).structureChange;
  assert.equal(event.confirmedAt,first.event.confirmedAt);
  assert.equal(event.pivotPrice,first.event.pivotPrice);
  for(const durationMs of expiries){
   const out=applyObservedLevelSequence({candidate:{ready:false,side:null},...input(f),durationMs});
   assert.notEqual(out.reason,'failed-breakout-structure-change');
  }
 }
});
