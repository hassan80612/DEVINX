import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmedStructuralReversal as oldGuard} from './fixtures/sentinel-1393-original-guard-admission.mjs';
import {confirmedStructuralReversal as fixedGuard} from '../sentinel-trading-lab/agent/src/core/structural-entry-guard-137.mjs';
import {evolveOpportunity} from '../sentinel-trading-lab/agent/src/core/single-opportunity-window.mjs';
const START=1800000000000;
const settings={asset:'EUR/USD',engine:'automatic',forecastMode:'continuous',orderDurationMs:30000};
const UP=1,DOWN=-1;
function timeline({side='PUT',admitSec=13,scenario='recover',seed=0}={}){
 const adverse=side==='PUT'?UP:DOWN,rows=[],base=1.2;
 const wobble=t=>.00000012*Math.sin(t*1.31+seed*.73);
 for(let t=-95;t<=80;t++){
  let deviation;
  if(t<=admitSec)deviation=adverse*t*(.000022+seed*.0000003);
  else{
   const elapsed=t-admitSec,admission=adverse*admitSec*(.000022+seed*.0000003);
   if(scenario==='recover')deviation=admission+adverse*(elapsed<=3?elapsed*.000025:3*.000025-(elapsed-3)*.000035);
   else if(scenario==='strong-turn')deviation=admission+adverse*elapsed*(.000030+seed*.0000003);
   else if(scenario==='trend-continuation')deviation=admission-adverse*elapsed*.000030;
   else if(scenario==='weak-recoil')deviation=admission+adverse*(elapsed<=2?elapsed*.000006:2*.000006-(elapsed-2)*.000026);
   else throw Error(scenario);
  }
  const ts=START+t*1000;rows.push({ts,receivedAt:ts,price:base+deviation+wobble(t)});
 }
 const issuedAt=START+admitSec*1000;
 const reference=rows.find(q=>q.ts===issuedAt).price;
 const candidate={side,engineId:'automatic',asset:'EUR/USD',delaySeconds:30,
  holdingSeconds:30,issuedAt,entryAt:START+27000,exitAt:START+57000,
  projectedEntryPrice:1.2,projectedExitPrice:side==='PUT'?1.19:1.21,
  guardBaseline:{referencePrice:reference,lastClose:reference}};
 const scan=evolveOpportunity({settings,now:START,quoteAt:START});
 const accepted=evolveOpportunity({settings,previous:scan,candidate,now:issuedAt,quoteAt:issuedAt});
 assert.equal(accepted.phase,'open');
 assert.equal(accepted.side,side);
 assert.equal(accepted.windowStartedAt,START);
 assert.equal(accepted.openedAt,START);
 assert.equal(accepted.admittedAt,issuedAt);
 return {rows,old:{...accepted,admittedAt:undefined},fixed:accepted,admitSec,side,scenario};
}
function inspect(data,t){
 const now=START+t*1000,quotes=data.rows.filter(q=>q.ts<=now);
 const snap={quoteTs:now,quoteHistory:quotes,price:quotes.at(-1).price};
 return {old:oldGuard({window:data.old,snap,now}),
  fixed:fixedGuard({window:data.fixed,snap,now})};
}
test('late admission: previously completed bars never invalidate newly selected side',()=>{
 const details=[],tallies={samples:0,oldFalse:0,newFalse:0};
 for(const side of ['CALL','PUT'])for(const admitSec of [7,11,12,13,16])
 for(const scenario of ['recover','weak-recoil','trend-continuation'])
 for(let seed=0;seed<12;seed++){
  const data=timeline({side,admitSec,scenario,seed});
  for(let t=admitSec+1;t<Math.min(admitSec+8,29);t++){
   const r=inspect(data,t);
   tallies.samples++;tallies.oldFalse+=Number(r.old.invalidated);
   tallies.newFalse+=Number(r.fixed.invalidated);
   assert.equal(r.fixed.invalidated,false,
     'two complete post-admission 5s bars cannot exist yet '+JSON.stringify({side,admitSec,t,scenario}));
  }
  if(side==='PUT'&&scenario==='recover'&&seed===0)
   details.push({admitSec,sec:admitSec+2,
    baseline:inspect(data,admitSec+2).old.invalidated,
    candidate:inspect(data,admitSec+2).fixed.invalidated});
 }
 console.log('[1394 ADMISSION ROOT early 1-7s SIMULATED] '+JSON.stringify({tallies,details}));
 assert.ok(tallies.oldFalse>0,'baseline did not exhibit pre-admission cancellation');
 assert.equal(tallies.newFalse,0);
});
test('strong post-admission adverse movement remains cancellable once two actual post-admission 5s bars complete',()=>{
 const summary={cases:0,baselineConfirmed:0,candidateConfirmed:0,oldTimes:[],newTimes:[],missed:[]};
 for(const side of ['CALL','PUT'])for(const admitSec of [7,11,12,13,16])
 for(let seed=0;seed<15;seed++){
  const data=timeline({side,admitSec,scenario:'strong-turn',seed}),last=30;
  let oldAt=null,newAt=null;
  for(let t=admitSec+1;t<=last;t++){
   const r=inspect(data,t);
   if(r.old.invalidated&&oldAt===null)oldAt=t;
   if(r.fixed.invalidated&&newAt===null)newAt=t;
  }
  summary.cases++;summary.baselineConfirmed+=Number(oldAt!==null);
  summary.candidateConfirmed+=Number(newAt!==null);
  if(newAt==null)summary.missed.push({side,admitSec,seed});
  if(oldAt!==null)summary.oldTimes.push(oldAt-admitSec);
  if(newAt!==null)summary.newTimes.push(newAt-admitSec);
 }
 console.log('[1394 ADMISSION ROOT strong after admission SIMULATED] '+JSON.stringify({
  ...summary,oldTimes:summary.oldTimes.reduce((a,x)=>(a[x]=(a[x]||0)+1,a),{}),
  newTimes:summary.newTimes.reduce((a,x)=>(a[x]=(a[x]||0)+1,a),{})}));
 assert.ok(summary.candidateConfirmed>0);
});
test('signals admitted at the cycle start preserve the old guard exactly',()=>{
 for(const side of ['CALL','PUT'])for(const scenario of ['recover','weak-recoil','strong-turn','trend-continuation']){
  const data=timeline({side,admitSec:0,scenario});
  for(let t=0;t<=29;t++){
   const r=inspect(data,t);
   assert.deepEqual(r.fixed,r.old);
  }
 }
});
test('new admission marker cannot flip direction, extend countdown, or reopen a cancelled window',()=>{
 const data=timeline({side:'PUT',admitSec:13,scenario:'strong-turn'});
 const existing=data.fixed;
 const result=evolveOpportunity({previous:existing,settings,now:START+20000,quoteAt:START+20000,
  candidate:{...existing,side:'CALL',issuedAt:START+20000,entryAt:START+24000,
   projectedEntryPrice:1.2,projectedExitPrice:1.21}});
 assert.equal(result.side,'PUT');
 assert.equal(result.admittedAt,START+13000);
 assert.equal(result.windowStartedAt,START);
 assert.equal(result.windowEndsAt,START+30000);
});

test('holdout: how many valid and invalid windows survive through an actual planned entry second',()=>{
 const summary={cases:0,oldWouldOpen:0,newWouldOpen:0,additionalCorrect:0,additionalIncorrect:0,
  oldCancelled:0,newCancelled:0};
 const detail=[];
 const candidateSides=['CALL','PUT'],scenarios=['recover','weak-recoil','strong-turn','trend-continuation'];
 for(const admitSec of [7,11,12,13,16])for(const lead of [3,6,9,12])
 for(const scenario of scenarios)for(const side of candidateSides){
  const group={admitSec,lead,scenario,side,cases:0,oldWouldOpen:0,newWouldOpen:0,
   additionalCorrect:0,additionalIncorrect:0};
  for(let seed=20;seed<40;seed++){
   const due=admitSec+lead;
   if(due>=30)continue;
   const data=timeline({side,admitSec,scenario,seed});
   const oldCancel=[],newCancel=[];
   for(let t=admitSec+1;t<=due;t++){
    const r=inspect(data,t);
    if(r.old.invalidated)oldCancel.push(t);
    if(r.fixed.invalidated)newCancel.push(t);
   }
   const oldActive=oldCancel.length===0,newActive=newCancel.length===0;
   const entry=data.rows.find(q=>q.ts===START+due*1000).price;
   const exit=data.rows.find(q=>q.ts===START+(due+30)*1000).price;
   const correct=(exit>entry?'CALL':'PUT')===side;
   for(const o of [summary,group]){
    o.cases++;o.oldWouldOpen+=Number(oldActive);o.newWouldOpen+=Number(newActive);
    o.additionalCorrect+=Number(!oldActive&&newActive&&correct);
    o.additionalIncorrect+=Number(!oldActive&&newActive&&!correct);
   }
   summary.oldCancelled+=Number(!oldActive);summary.newCancelled+=Number(!newActive);
  }
  if(group.cases>0)detail.push(group);
 }
 console.log('[1394 ADMISSION HOLDOUT distinct windows, synthetic] '+JSON.stringify({summary,detail}));
 assert.ok(summary.cases>800);
 assert.ok(summary.additionalCorrect>0);
 // Do not assert an impossible zero-regression promise: if an opposite
 // movement continues through the actual entry second, the new guard
 // may fail to cancel before its first two POST-admission bars complete.
});
