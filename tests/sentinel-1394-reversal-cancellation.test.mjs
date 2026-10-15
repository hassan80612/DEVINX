import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmedStructuralReversal as oldCheck} from './fixtures/sentinel-1393-reversal-guard.mjs';
import {confirmedStructuralReversal as newCheck,brokerDurationGuard} from '../sentinel-trading-lab/agent/src/core/structural-entry-guard-137.mjs';
import {evolveOpportunity} from '../sentinel-trading-lab/agent/src/core/single-opportunity-window.mjs';
const T=1791500000000;
function caseFor(side,type,n){
 const dir=side==='PUT'?1:-1,openAt=T+120000,ref=1.2;
 const lastHigh=ref+.0005,lastLow=ref-.0005;
 const perSecond=(type==='pullback'? .000004:
   type==='bounce'? .000014:
   type==='reversal'? .000065:
   type==='trend'?-.000014: .000009)*(1+n/500);
 const quotes=[];
 for(let j=-40;j<0;j++){
  const b=ref+(j%11)*.0000008;
  quotes.push({ts:openAt+j*1000,receivedAt:openAt+j*1000,price:b});
 }
 for(let j=0;j<=12;j++){
  const drift=j*perSecond*dir;
  const price=ref+drift+.0000005*Math.sin(j*.3);
  quotes.push({ts:openAt+j*1000,receivedAt:openAt+j*1000,price});
 }
 const window={phase:'open',side,openedAt:openAt,windowStartedAt:openAt,
   windowEndsAt:openAt+30000,entryAt:openAt+17000,exitAt:openAt+47000,
   guardBaseline:{referencePrice:ref,lastHigh,lastLow}};
 return {window,snap:{quoteTs:openAt+12000,quoteHistory:quotes},now:openAt+12000};
}
test('no cancellation of 80 same-direction opportunities during ordinary retreat',()=>{
 const rows=[];
 for(const side of ['CALL','PUT'])for(const type of ['pullback','bounce','reversal','trend']){
  let oldCancelled=0,newCancelled=0;
  for(let i=0;i<40;i++){
   const x=caseFor(side,type,i),a=oldCheck(x),b=newCheck(x);
   oldCancelled+=Number(a.invalidated);newCancelled+=Number(b.invalidated);
   assert.equal(x.window.side,side);
   if(type==='trend')assert.equal(b.invalidated,false);
   if(type==='pullback'||type==='bounce')assert.equal(b.invalidated,false,
     JSON.stringify({type,side,i,b}));
   if(type==='reversal')assert.equal(b.invalidated,true,
     JSON.stringify({type,side,i,b}));
  }
  rows.push({type,side,total:40,oldCancelled,newCancelled});
 }
 console.log('[1394 CANCEL replay SIMULATED: canceled not won] '+JSON.stringify(rows));
});
test('existing signal window state machine and expiry protection are unchanged',()=>{
 const p=caseFor('PUT','reversal',3);
 const reject=newCheck(p);
 assert.equal(reject.invalidated,true);
 const settings={asset:'EUR/USD',forecastMode:'continuous',engine:'automatic',orderDurationMs:30000};
 const ctx='EUR/USD|continuous|automatic|30000';
 const window={...p.window,context:ctx,asset:'EUR/USD',engineId:'automatic',holdingSeconds:30,
  delaySeconds:30,issuedAt:p.window.openedAt,projectedEntryPrice:1.2,
  projectedExitPrice:1.19};
 const canceled=evolveOpportunity({previous:window,settings,now:p.now,quoteAt:p.now,
   invalidationReason:reject.reason});
 assert.equal(canceled.phase,'cancelled');
 assert.equal(canceled.side,'PUT');
 assert.equal(brokerDurationGuard({snap:{},settings,now:p.now}).allowed,true);
});
test('missing extreme metadata retains original safe cancellation behavior',()=>{
 for(const side of ['PUT','CALL']){
  const x=caseFor(side,'reversal',12);
  delete x.window.guardBaseline.lastHigh;
  delete x.window.guardBaseline.lastLow;
  assert.deepEqual(newCheck(x),oldCheck(x));
 }
});
