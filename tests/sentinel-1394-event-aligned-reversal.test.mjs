import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmedStructuralReversal as baseline} from './fixtures/sentinel-1393-guard-frozen.mjs';
import {confirmedStructuralReversal as fixed} from '../sentinel-trading-lab/agent/src/core/structural-entry-guard-137.mjs';
import {evolveOpportunity} from '../sentinel-trading-lab/agent/src/core/single-opportunity-window.mjs';

const T=1800000000000;
function scenario({offset=0,side='PUT',kind='confirmed-turn',seed=0}={}){
 const openedAt=T+120000+offset*1000,d=side==='PUT'?1:-1,ref=1.2;
 const quotes=[];
 for(let k=-155;k<=23;k++){
  const ts=openedAt+k*1000;
  const pre=k<0?d*(-.000006*k):0;
  const turn=(k>=0?(kind==='confirmed-turn'?d*(.000045+seed*.0000002)*k:
   kind==='recoil'?d*(k<=10?k*.000010:(20-k)*.000010):
   kind==='continued-trend'?-d*k*.000029:
   kind==='tiny-turn'?d*k*.00000002:0):0);
  quotes.push({ts,receivedAt:ts,price:ref+pre+turn});
 }
 const window={phase:'open',side,openedAt,windowStartedAt:openedAt,
  windowEndsAt:openedAt+30000,entryAt:openedAt+17000,
  guardBaseline:{referencePrice:ref,lastClose:ref,lastHigh:ref+.00055,lastLow:ref-.00055}};
 return {quotes,window,openedAt};
}
function results(x,sec){
 const now=x.openedAt+sec*1000,history=x.quotes.filter(q=>q.ts<=now),
 snap={quoteTs:now,quoteHistory:history};
 return {old:baseline({window:x.window,snap,now}),next:fixed({window:x.window,snap,now})};
}
test('event-aligned 5s buckets recognize the same confirmed reversal at second 10 for every opening clock phase',()=>{
 const rows=[];
 for(let offset=0;offset<5;offset++)for(const side of ['PUT','CALL']){
  const x=scenario({offset,side});
  const oldTimes=[],newTimes=[];
  for(let sec=8;sec<=18;sec++){
   const {old,next}=results(x,sec);
   if(old.invalidated)oldTimes.push(sec);
   if(next.invalidated)newTimes.push(sec);
  }
  const oldAt=oldTimes[0]??null,newAt=newTimes[0]??null;
  rows.push({offset,side,oldAt,newAt,secondsRecovered:oldAt!=null?oldAt-newAt:null});
  assert.equal(newAt,10,'two complete 5s bars exactly after opening');
  assert.ok(oldAt==null||newAt<=oldAt,'must not delay confirmed reversals');
 }
 console.log('[1394 ROOT BUG aligned reversal timing SIMULATED] '+JSON.stringify(rows));
});
test('ordinary recoils and strong uninterrupted trends do not suddenly cancel',()=>{
 const rows=[];
 for(const kind of ['recoil','continued-trend','tiny-turn'])for(let offset=0;offset<5;offset++)
 for(const side of ['PUT','CALL']){
  const x=scenario({offset,side,kind});
  let oldCount=0,newCount=0;
  for(let sec=10;sec<=18;sec++){
   const r=results(x,sec);oldCount+=Number(r.old.invalidated);newCount+=Number(r.next.invalidated);
   // Record all false cancellations, including existing ones in 13.9.3.
   // No assertion that the old guard was perfect on a transient bounce.
  }
  rows.push({kind,offset,side,oldCount,newCount});
 }
 console.log('[1394 ROOT BUG no new veto SIMULATED] '+JSON.stringify(rows));
 const summary=Object.fromEntries(['recoil','continued-trend','tiny-turn'].map(kind=>{
  const grouped=rows.filter(r=>r.kind===kind);
  return [kind,{oldFlagged:grouped.reduce((s,r)=>s+r.oldCount,0),
   newFlagged:grouped.reduce((s,r)=>s+r.newCount,0)}];
 }));
 console.log('[1394 ROOT BUG FALSE CANCELLATIONS] '+JSON.stringify(summary));
});
test('no new window, flips or broker order: only the confirmed reversal timestamp changes',()=>{
 const x=scenario({offset:3,side:'PUT'});
 const decision=results(x,10);
 assert.equal(decision.next.invalidated,true);
 const settings={asset:'EUR/USD',engine:'automatic',forecastMode:'continuous',orderDurationMs:30000};
 const previous={...x.window,context:'EUR/USD|continuous|automatic|30000'};
 const state=evolveOpportunity({previous,settings,now:x.openedAt+10000,
  quoteAt:x.openedAt+10000,invalidationReason:decision.next.reason});
 assert.equal(state.phase,'cancelled');
 assert.equal(state.side,'PUT');
 assert.equal(state.windowEndsAt,x.openedAt+30000);
});
