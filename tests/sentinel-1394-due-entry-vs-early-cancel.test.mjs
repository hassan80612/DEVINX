import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmedStructuralReversal} from '../sentinel-trading-lab/agent/src/core/structural-entry-guard-137.mjs';
import {confirmWindowEntry} from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';
import {evolveOpportunity} from '../sentinel-trading-lab/agent/src/core/single-opportunity-window.mjs';
const T=1791500000000;
const category=['pullback-then-continue','early-reversal','strong-continuation',
 'range-bounce','secondary-reversal','slow-pullback'];
function build(kind,side,variation){
 const dir=side==='CALL'?1:-1,opening=T+300000;
 const spread=variation%7,early=(3.5+spread*.75)*.000001;
 const stronger=(variation%11)*.0000005;
 const rows=[];
 const push=(sec,p)=>{const ts=opening+sec*1000;rows.push({ts,receivedAt:ts,price:p});};
 // Reference structures before opening follow the chosen signal direction
 // and vary in speed; subsequent price path is never visible before now.
 const pre=(5+variation%8*.9)*.000001;
 const origin=1.2;
 for(let j=-160;j<=0;j++){
  const a=dir*pre*j+Math.sin(j*.23+variation*.35)*.0000015;
  push(j,origin+a);
 }
 const after=j=>{
  const rate=early+stronger;
  if(kind==='strong-continuation')return dir*(j*rate+.000003*Math.sin(j*.3));
  if(kind==='early-reversal')return -dir*j*rate;
  if(kind==='secondary-reversal')return j<21?-dir*j*rate:
     -dir*(21*rate+(j-21)*rate*.65);
  if(kind==='pullback-then-continue')return j<=19?-dir*j*rate:
     -dir*19*rate+dir*(j-19)*(rate*(1.25+spread*.10));
  if(kind==='slow-pullback')return j<=22?-dir*j*rate*.45:
     -dir*22*rate*.45+dir*(j-22)*rate*.55;
  if(kind==='range-bounce')return dir*((variation%3)*.000009+
     .000135*Math.sin(2*Math.PI*j/42+Math.PI));
  return 0;
 };
 for(let j=1;j<=65;j++)push(j,origin+after(j)+.000001*Math.sin(j*.41+variation));
 return {rows,opening};
}
function check(kind,side,variation){
 const {rows,opening}=build(kind,side,variation),guardAt=opening+12000,atEntry=opening+17000;
 const pastGuard=rows.filter(x=>x.ts<=guardAt),seen=rows.filter(x=>x.ts<=atEntry);
 const quote=seen.at(-1),guardQuote=pastGuard.at(-1);
 const earlier=rows.filter(x=>x.ts<opening).slice(-90);
 const baseline=rows.find(x=>x.ts===opening).price;
 const high=Math.max(...earlier.map(x=>x.price)),low=Math.min(...earlier.map(x=>x.price));
 const window={phase:'open',side,openedAt:opening,windowStartedAt:opening,
  windowEndsAt:opening+30000,entryAt:atEntry,exitAt:atEntry+30000,
  guardBaseline:{referencePrice:baseline,lastHigh:high,lastLow:low}};
 const oldCancel=confirmedStructuralReversal({window,snap:{quoteTs:guardQuote.ts,quoteHistory:pastGuard},now:guardAt});
 const settings={asset:'EUR/USD',forecastMode:'continuous',engine:'automatic',orderDurationMs:30000,
  clockMode:'current'};
 const snap={quoteHistory:seen,quoteTs:quote.ts,price:quote.price,candles:[]};
 const checked=confirmWindowEntry({settings,snap,now:atEntry,adaptiveHistory:seen,
  forecastModel:'causal-closed-structure-1379',entryAt:atEntry});
 const nextCanFire=checked.side===side;
 const oldCanFire=!oldCancel.invalidated&&nextCanFire;
 const entry=rows.find(x=>x.ts===atEntry).price,exit=rows.find(x=>x.ts===atEntry+30000).price;
 const actual=exit>entry?'CALL':exit<entry?'PUT':null;
 return {kind,side,variation,oldCancelled:oldCancel.invalidated,modelQualified:!!checked.side,
  modelSide:checked.side,oldCanFire,nextCanFire,actual,correct:actual===side,
  modelVersion:checked.status};
}
test('retaining window until original planned entry with fresh model recheck: matched synthetic result',()=>{
 const rows=[];
 for(const kind of category)for(const side of ['PUT','CALL']){
  const p={kind,side,samples:0,oldCancelled:0,oldFired:0,candidateFired:0,
   oldWins:0,oldLosses:0,newWins:0,newLosses:0,additionalWins:0,additionalLosses:0,
   wouldConfirm:0,modelAgainst:0};
  for(let n=0;n<60;n++){
   const x=check(kind,side,n);p.samples++;
   p.oldCancelled+=Number(x.oldCancelled);
   p.oldFired+=Number(x.oldCanFire);
   p.candidateFired+=Number(x.nextCanFire);
   p.oldWins+=Number(x.oldCanFire&&x.correct);
   p.oldLosses+=Number(x.oldCanFire&&!x.correct);
   p.newWins+=Number(x.nextCanFire&&x.correct);
   p.newLosses+=Number(x.nextCanFire&&!x.correct);
   p.additionalWins+=Number(!x.oldCanFire&&x.nextCanFire&&x.correct);
   p.additionalLosses+=Number(!x.oldCanFire&&x.nextCanFire&&!x.correct);
   p.wouldConfirm+=Number(x.modelQualified);
   p.modelAgainst+=Number(x.modelSide&&x.modelSide!==side);
  }
  rows.push(p);
 }
 const sum=arr=>Object.fromEntries(['samples','oldCancelled','oldFired','candidateFired','oldWins',
 'oldLosses','newWins','newLosses','additionalWins','additionalLosses','wouldConfirm','modelAgainst']
 .map(k=>[k,arr.reduce((x,y)=>x+y[k],0)]));
 console.log('[1394 CANCEL ORIGINAL vs ENTRY-RECHECK synthetic matched settlement] '+JSON.stringify(rows));
 console.log('[1394 CANCEL SUMMARY synthetic matched settlement] '+JSON.stringify({
  all:sum(rows),pullbacks:sum(rows.filter(x=>x.kind.includes('pullback')||x.kind==='range-bounce')),
  reversals:sum(rows.filter(x=>x.kind.includes('reversal'))),
  trends:sum(rows.filter(x=>x.kind==='strong-continuation'))}));
 assert.ok(rows.every(x=>x.samples===60));
});
test('original one-window side and expiry still immutable; no opposite signal introduced',()=>{
 const settings={asset:'EUR/USD',forecastMode:'continuous',engine:'automatic',orderDurationMs:30000};
 const at=T+300000,window={context:'EUR/USD|continuous|automatic|30000',phase:'open',
  side:'PUT',openedAt:at,windowStartedAt:at,windowEndsAt:at+30000,
  entryAt:at+17000,exitAt:at+47000,holdingSeconds:30,
  brokerExpiresAt:null};
 const response=evolveOpportunity({previous:window,settings,now:at+13000,
  quoteAt:at+13000,confirmation:null,invalidationReason:null});
 assert.equal(response.phase,'open');
 assert.equal(response.side,'PUT');
 assert.equal(response.entryAt,at+17000);
});
