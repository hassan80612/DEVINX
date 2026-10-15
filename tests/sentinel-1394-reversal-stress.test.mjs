import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmedStructuralReversal as oldGuard} from './fixtures/sentinel-1393-guard-frozen.mjs';
import {confirmedStructuralReversal as newGuard} from '../sentinel-trading-lab/agent/src/core/structural-entry-guard-137.mjs';
const T=1800000000000;
function sample({side,offset,prior,against,recover,noiseSeed=0}){
 const d=side==='PUT'?1:-1,open=T+160000+offset*1000,priorPrice=1.2;
 const quotes=[];
 for(let s=-135;s<=35;s++){
  let delta=0;
  if(s<0)delta=-d*prior*s;
  else if(s<=11)delta=d*against*s;
  else if(recover)delta=d*(against*11)-d*against*1.8*(s-11);
  else delta=d*against*11+d*against*.9*(s-11);
  const wobble=(Math.sin(s*1.21+noiseSeed*.4)+Math.sin(s*.57+noiseSeed))*.0000003;
  const ts=open+s*1000;
  quotes.push({ts,receivedAt:ts,price:priorPrice+delta+wobble});
 }
 const window={phase:'open',side,openedAt:open,windowStartedAt:open,
  windowEndsAt:open+30000,guardBaseline:{referencePrice:priorPrice,lastClose:priorPrice}};
 return {quotes,window,open};
}
function evaluate(x,fn,at=17){
 for(let s=10;s<=at;s++){
  const now=x.open+s*1000;
  const snap={quoteTs:now,quoteHistory:x.quotes.filter(q=>q.ts<=now)};
  if(fn({window:x.window,snap,now}).invalidated)return s;
 }
 return null;
}
test('out-of-sample reversal/recoil strength grid reveals tradeoffs before publication',()=>{
 const old={truePositive:0,falsePositive:0,trueNegative:0,falseNegative:0};
 const newer={truePositive:0,falsePositive:0,trueNegative:0,falseNegative:0};
 const byRatio=[];
 let n=0;
 const bands=[.7,1.2,1.7,2.2,2.8,3.5,5,7.5];
 for(const ratio of bands){
  const one={ratio,oldRecoveredCancellations:0,newRecoveredCancellations:0,
   oldMissedReversals:0,newMissedReversals:0,scenarios:0};
  for(const side of ['PUT','CALL'])for(let offset=0;offset<5;offset++)
  for(const p of [4,5,7,9,12,15])for(const seed of [3,9]){
   const prior=p*.000001,against=prior*ratio;
   for(const recover of [true,false]){
    const x=sample({side,offset,prior,against,recover,noiseSeed:seed});
    const a=evaluate(x,oldGuard),b=evaluate(x,newGuard);
    const key=(fnResult,label)=>fnResult!=null?
      (label?'truePositive':'falsePositive'):(label?'falseNegative':'trueNegative');
    old[key(a,!recover)]++;newer[key(b,!recover)]++;
    if(recover){one.oldRecoveredCancellations+=Number(a!=null);one.newRecoveredCancellations+=Number(b!=null);}
    else{one.oldMissedReversals+=Number(a==null);one.newMissedReversals+=Number(b==null);}
    one.scenarios++;n++;
   }
  }
  byRatio.push(one);
 }
 console.log('[1394 stress RATIOS by strength, synthetic] '+JSON.stringify(byRatio));
 console.log('[1394 stress CONFUSION synthetic at planned entry] '+JSON.stringify({
  total:n,baseline:old,candidate:newer}));
 assert.equal(n,8*2*5*6*2*2);
});
