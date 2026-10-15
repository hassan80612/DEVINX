import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmedStructuralReversal as oldGuard} from './fixtures/sentinel-1393-original-guard-admission.mjs';
import {confirmedStructuralReversal as proposed} from '../sentinel-trading-lab/agent/src/core/structural-entry-guard-137.mjs';
const T=1800000000000;
function run({side,admit,lead,seed}){
 let rng=seed>>>0;
 const rnd=()=>{rng=(Math.imul(1664525,rng)+1013904223)>>>0;return rng/2**32};
 const against=side==='PUT'?1:-1,level=1.2;
 const leg=seed%6===0?90:1+Math.floor(rnd()*13);
 const beforeRate=.000014+rnd()*.000027;
 const adverseRate=.000013+rnd()*.000033;
 const recoveringRate=.000019+rnd()*.000052;
 const rows=[];
 for(let t=-90;t<=90;t++){
  const admission=against*admit*beforeRate;
  let p=t<=admit?against*t*beforeRate:
    admission+against*(Math.min(t-admit,leg)*adverseRate-
      Math.max(0,t-admit-leg)*recoveringRate);
  p+=(rnd()-.5)*.0000013;
  rows.push({ts:T+t*1000,receivedAt:T+t*1000,price:level+p});
 }
 const reference=rows.find(q=>q.ts===T+admit*1000).price;
 const initial={phase:'open',side,openedAt:T,windowStartedAt:T,
   windowEndsAt:T+30000,admittedAt:T+admit*1000,
   guardBaseline:{referencePrice:reference,lastClose:reference}};
 const before={...initial,admittedAt:undefined};
 const due=admit+lead;
 let oldCancel=false,newCancel=false;
 for(let t=admit+1;t<=due;t++){
  const now=T+t*1000,q=rows.filter(v=>v.ts<=now);
  const snap={quoteTs:now,quoteHistory:q};
  oldCancel||=oldGuard({window:before,snap,now}).invalidated;
  newCancel||=proposed({window:initial,snap,now}).invalidated;
 }
 const entry=rows.find(q=>q.ts===T+due*1000).price;
 const exit=rows.find(q=>q.ts===T+(due+30)*1000).price;
 return {leg,side,due,admit,lead,oldActive:!oldCancel,newActive:!newCancel,
   outcome:(exit>entry?'CALL':'PUT')===side};
}
test('unseen variable-duration turns: evaluate rescued wins versus uncovered losses without fitting to scenarios',()=>{
 const rows=[],categories=['early-entry','normal-lead','late-lead'];
 const aggregate={evaluations:0,originalWouldEnter:0,proposedWouldEnter:0,
   originalWinners:0,proposedWinners:0,extraWinning:0,extraLosing:0,
   lostWinning:0,lostLosing:0,originalCancelled:0,proposedCancelled:0};
 for(const side of ['PUT','CALL'])for(const admit of [6,9,12,15,17])
 for(const lead of [3,5,7,9,12]){
  if(admit+lead>=30)continue;
  const group={side,admit,lead,checks:0,addedCorrect:0,addedIncorrect:0,
   removedCorrect:0,removedIncorrect:0};
  for(let seed=101;seed<=170;seed++){
   const result=run({side,admit,lead,seed:seed+admit*317+lead*107+(side==='CALL'?731:0)});
   group.checks++;aggregate.evaluations++;
   const{oldActive,newActive,outcome}=result;
   aggregate.originalWouldEnter+=Number(oldActive);
   aggregate.proposedWouldEnter+=Number(newActive);
   aggregate.originalWinners+=Number(oldActive&&outcome);
   aggregate.proposedWinners+=Number(newActive&&outcome);
   aggregate.originalCancelled+=Number(!oldActive);
   aggregate.proposedCancelled+=Number(!newActive);
   const added=!oldActive&&newActive,lost=oldActive&&!newActive;
   aggregate.extraWinning+=Number(added&&outcome);
   aggregate.extraLosing+=Number(added&&!outcome);
   aggregate.lostWinning+=Number(lost&&outcome);
   aggregate.lostLosing+=Number(lost&&!outcome);
   group.addedCorrect+=Number(added&&outcome);
   group.addedIncorrect+=Number(added&&!outcome);
   group.removedCorrect+=Number(lost&&outcome);
   group.removedIncorrect+=Number(lost&&!outcome);
  }
  rows.push(group);
 }
 console.log('[1394 ADMISSION VARIABLE HOLDOUT independent synthetic] '+JSON.stringify({
  aggregate,byLead:[3,5,7,9,12].map(l=>{
   const a=rows.filter(r=>r.lead===l);
   return {lead:l,count:a.reduce((x,r)=>x+r.checks,0),
    gainedCorrect:a.reduce((x,r)=>x+r.addedCorrect,0),
    gainedIncorrect:a.reduce((x,r)=>x+r.addedIncorrect,0),
    lostCorrect:a.reduce((x,r)=>x+r.removedCorrect,0),
    lostIncorrect:a.reduce((x,r)=>x+r.removedIncorrect,0)};
  }),byWindow:rows}));
 assert.ok(aggregate.evaluations>2000);
 // Do not assert future performance; report it. A wide noisy holdout
 // may legitimately reveal risk in the candidate rather than "pass" it.
});
