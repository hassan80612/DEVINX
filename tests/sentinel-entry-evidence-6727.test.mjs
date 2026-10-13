import test from 'node:test';
import assert from 'node:assert/strict';
import {evidenceFromOutcomes,observedEntryEvidence} from '../sentinel-trading-lab/agent/src/core/entry-evidence.mjs';
import {futureEntrySchedule,confirmWindowEntry} from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';
import {evolveOpportunity} from '../sentinel-trading-lab/agent/src/core/single-opportunity-window.mjs';
const t=1800000000000,settings={asset:'EVIDENCE',engine:'automatic',forecastMode:'continuous',orderDurationMs:30000};
const outcomes=(n,hits)=>Array.from({length:n},(_,i)=>({correct:i<hits}));
test('46%, coin-flip and insufficient samples cannot authorize opening or entry',()=>{
 for(const [n,h] of [[0,0],[5,5],[100,46],[20,10],[20,13]])assert.equal(evidenceFromOutcomes(outcomes(n,h)).qualified,false);
 const supported=evidenceFromOutcomes(outcomes(20,17));
 assert.equal(supported.qualified,true);
 assert.ok(supported.lowerBound>.5);
});
test('audit uses only arrived past quotes and disjoint completed expiry intervals; caches each closed case',()=>{
 const q=Array.from({length:1201},(_,i)=>({ts:t+i*1000,price:1+i*.0001}));
 const now=t+1200000,seen=[];
 const predict=frame=>{
  assert.ok(frame.quoteHistory.every(q=>q.ts<=frame.now&&Number(q.receivedAt??q.ts)<=frame.now));
  seen.push(frame.now);return {side:'CALL'};
 };
 const args={quoteHistory:[...q,{ts:t+700000,price:99,receivedAt:now+1000}],now,holdingSeconds:30,context:'causal-test',predict};
 const a=observedEntryEvidence(args);
 assert.equal(a.samples,20);assert.equal(a.hits,20);assert.equal(a.qualified,true);
 assert.equal(seen.length,20);
 for(let i=1;i<seen.length;i++)assert.equal(seen[i]-seen[i-1],30000);
 observedEntryEvidence(args);assert.equal(seen.length,20);
 const next=[...q,...Array.from({length:30},(_,i)=>({ts:now+(i+1)*1000,price:1.12+(i+1)*.0001}))];
 observedEntryEvidence({...args,quoteHistory:next,now:now+30000});
 assert.equal(seen.length,21);
});
function quotes(kind){
 let seed=17,p=1.1;
 return Array.from({length:1801},(_,i)=>{
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  const noise=(random()+random()+random()-1.5)*.000025;
  p*=Math.exp(noise+(kind==='trend'?.000007:0));
  return {ts:t+i*1000,price:p};
 });
}
test('a clear continuous trend can open and confirm; unproven lateral readings cannot',()=>{
 for(const kind of ['trend','lateral']){
  const q=quotes(kind),now=q.at(-1).ts;
  const input={settings:{...settings,asset:kind},now,snap:{quoteHistory:q,price:q.at(-1).price,quoteTs:now},forecastModel:'selected-strengths-67.5'};
  const [row]=futureEntrySchedule({...input,delays:[30]});
  const confirmation=confirmWindowEntry(input);
  if(kind==='trend'){
   assert.equal(row.side,'CALL');assert.equal(row.entryEvidence.qualified,true);
   assert.equal(confirmation.side,'CALL');assert.equal(confirmation.entryEvidence.qualified,true);
  }else{
   assert.equal(row.side,null);assert.equal(confirmation.side,null);
  }
 }
});
test('failed evidence or opposite directions leave the original CALL/PUT, deadline and single trigger intact',()=>{
 for(const mode of ['continuous','selective'])for(const side of ['CALL','PUT']){
  const config={...settings,forecastMode:mode};
  const candidate={engineId:'automatic',asset:'EVIDENCE',side,issuedAt:t,
   entryAt:t+5000,exitAt:t+35000,delaySeconds:30,holdingSeconds:30,
   projectedEntryPrice:1,projectedExitPrice:side==='CALL'?1.01:.99};
  let window=evolveOpportunity({candidate,settings:config,now:t,quoteAt:t});
  for(let i=5;i<20;i++){
   window=evolveOpportunity({previous:window,settings:config,now:t+i*1000,quoteAt:t+i*1000,
    candidate:{...candidate,side:side==='CALL'?'PUT':'CALL'},confirmation:{side:null,status:'waiting-validated-entry'}});
   assert.equal(window.side,side);assert.equal(window.windowEndsAt,t+30000);assert.equal(window.phase,'open');
  }
  window=evolveOpportunity({previous:window,settings:config,now:t+20000,quoteAt:t+20000,confirmation:candidate});
  assert.equal(window.entryReadyNow,true);
  const again=evolveOpportunity({previous:window,settings:config,now:t+21000,quoteAt:t+21000,confirmation:candidate});
  assert.equal(again.entryReadyNow,false);assert.equal(again.entryTriggeredAt,t+20000);
 }
});

test('wins during continuous movement cannot qualify a new retracement',()=>{
 const quotes=Array.from({length:1201},(_,i)=>({ts:t+i*1000,price:1+i*.0001}));
 const now=quotes.at(-1).ts,context='regime-transition-test';
 const before=observedEntryEvidence({quoteHistory:quotes,now,holdingSeconds:30,context,predict:()=>({side:'CALL'})});
 assert.equal(before.behaviour,'continuous');assert.equal(before.qualified,true);
 const retracted=[...quotes,...Array.from({length:30},(_,i)=>({ts:now+(i+1)*1000,price:1.12-(i+1)*.0002}))];
 const after=observedEntryEvidence({quoteHistory:retracted,now:now+30000,holdingSeconds:30,context,predict:()=>({side:'CALL'})});
 assert.equal(after.behaviour,'retracement');assert.equal(after.qualified,false);
 assert.equal(after.samples,0);
});
