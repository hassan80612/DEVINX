import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {causalForwardPath} from '../sentinel-trading-lab/agent/src/core/causal-closed-structure-1379.mjs';
import {confirmWindowEntry,futureEntrySchedule} from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';
const T=1800000000000;
const settings={asset:'TEST',engine:'automatic',forecastMode:'continuous',clockMode:'current',orderDurationMs:30000};
function quotes(sign=1,turnAt=Infinity,returnAt=Infinity){let p=100;return Array.from({length:680},(_,i)=>{p+=sign*(i>=turnAt&&i<returnAt?-1:1)*.01+Math.sin(i/7)*.0001;return {ts:T+i*1000,receivedAt:T+i*1000,price:p}})}
function read(all,i){const q=all.slice(0,i+1),now=q.at(-1).ts,snap={quoteHistory:q,quoteTs:now,price:q.at(-1).price};return {q,now,snap,fit:causalForwardPath({quoteHistory:q,asOf:now,holdingSeconds:30,maxSeconds:60})}}
test('two contradictory completed blocks cannot authorize the old trend during an unresolved turn',()=>{
 for(const sign of [1,-1]){
  const r=read(quotes(sign,600),620);
  assert.equal(r.fit.regime,'transition');
  assert.equal(r.fit.priceAt(0),r.fit.priceAt(30));
  assert.equal(r.fit.analogNeighbors,0,'old trend analogs cannot resurrect a cancelled edge');
  const args={settings,snap:r.snap,now:r.now,forecastModel:'causal-closed-structure-1379'};
  assert.equal(confirmWindowEntry(args).side,null);
  assert.equal(futureEntrySchedule({...args,delays:[30]})[0].side,null);
 }
});
test('clean trends and completed wider reversals retain their direction',()=>{
 for(const sign of [1,-1])for(const turn of [false,true]){
  const r=read(quotes(sign,turn?600:Infinity),630);
  const expected=sign*(turn?-1:1)>0?'CALL':'PUT';
  assert.equal(confirmWindowEntry({settings,snap:r.snap,now:r.now,forecastModel:'causal-closed-structure-1379'}).side,expected);
 }
});
test('one unfinished opposite spike cannot relabel completed structural direction',()=>{
 const a=read(quotes(),629),mutated=a.q.map(q=>({...q}));
 for(let i=622;i<mutated.length;i++)mutated[i].price-=.4;
 const b=causalForwardPath({quoteHistory:mutated,asOf:a.now,holdingSeconds:30,maxSeconds:60});
 assert.equal(b.regime,a.fit.regime);
 assert.ok(Math.abs(Math.log(a.fit.priceAt(60)/a.fit.priceAt(30))-Math.log(b.priceAt(60)/b.priceAt(30)))<1e-9);
});
test('recorded short continuation trace retains its qualified entry results',()=>{
 const q=JSON.parse(readFileSync(new URL('./fixtures/sentinel-continuation-prices.json',import.meta.url))).quoteHistory;
 let entries=0,wins=0;
 for(let i=90;i<q.length;i++){
  const now=q[i].ts,exit=q.find(x=>x.ts>=now+30000&&x.ts<=now+31500);
  if(!exit)continue;
  const result=confirmWindowEntry({settings,snap:{quoteHistory:q.slice(0,i+1),quoteTs:now,price:q[i].price},now,forecastModel:'causal-closed-structure-1379'});
  if(!result.side)continue;
  entries++;wins+=result.side==='CALL'?exit.price>q[i].price:exit.price<q[i].price;
 }
 assert.equal(entries,27);assert.equal(wins,27);
 // One short trace with overlapping origins is only a regression fixture,
 // never a measured live win rate or evidence of general accuracy.
});
