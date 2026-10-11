import test from 'node:test';
import assert from 'node:assert/strict';
import {SCENARIO_ENGINES} from '../sentinel-trading-lab/agent/src/core/scenario-engine-catalog.mjs';
import {futureEntrySchedule} from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';
import {advanceAdaptiveSelectedEngineStudy} from '../sentinel-trading-lab/agent/src/core/vnext-adaptive-self-correction.mjs';
import {entryRegimeFeatures} from '../sentinel-trading-lab/agent/src/core/vnext-residual-reversal-research.mjs';

const t0=1800000000000, H=[5,10,30,60,120,300];
function market(seed,kind){
 let x=seed>>>0,p=Math.log(1.1),old=0,shock=0;
 const rand=()=>((x=(1664525*x+1013904223)>>>0)+1)/4294967297;
 const out=[];
 for(let i=0;i<3400;i++){
  const a=rand(),b=rand(),c=rand();
  const gauss=Math.sqrt(-2*Math.log(a))*Math.cos(2*Math.PI*b);
  let drift=0,scale=.000010;
  if(kind==='trend')drift=(i%1250<900?1:-1)*.0000035+.30*old;
  if(kind==='range')drift=-.075*(p-Math.log(1.1))-.44*old;
  if(kind==='reversal')drift=(Math.floor(i/133)%2?-.0000065:.0000065)+.15*old;
  if(kind==='false-break')drift=(i%220<19?.000016:i%220<50?-.000013:0)-.035*(p-Math.log(1.1));
  if(kind==='shock'){
    scale=i%800>300&&i%800<520?.000030:.000010;
    shock=c<.028?(b<.5?-1:1)*.00007:0;
    drift=shock-.25*old-.03*(p-Math.log(1.1));
  }
  const delta=drift+gauss*scale;
  p+=delta;old=delta;
  out.push({ts:t0+i*1000,price:Math.exp(p)});
 }
 return out;
}
const tally=arr=>({
 n:arr.length,original:arr.filter(x=>x.correctOriginal).length,
 raw:arr.filter(x=>x.correctRaw).length,
 adaptive:arr.filter(x=>x.correctAdaptive).length,
 corrections:arr.filter(x=>x.adapted).length,
 worsened:arr.filter(x=>x.correctOriginal&&!x.correctAdaptive).length,
 rescued:arr.filter(x=>!x.correctOriginal&&x.correctAdaptive).length
});
test('adaptive same-engine correction is forward-only and works for EVERY selected duration 5/10/30/60/120/300 seconds',()=>{
 const output=[];
 for(const type of ['trend','range','reversal','false-break','shock']){
  for(const seed of [97,7103]){
   const prices=market(seed,type);
   for(const h of H){
    for(const e of SCENARIO_ENGINES){
     let state=null;
     for(let i=750;i<=2650;i+=110){
      const now=t0+i*1000;
      const quoteHistory=prices.slice(Math.max(0,i-1900),i+1);
      const settings={engine:e.id,asset:'EUR/USD OTC',orderDurationMs:h*1000};
      const plan=futureEntrySchedule({
       settings,snap:{quoteHistory,quoteTs:now,provider:'iq_option'},
       now,delays:[h]
      })[0];
      state=advanceAdaptiveSelectedEngineStudy({previous:state,
       basePlan:plan,quoteHistory,now});
      assert.equal(state.adaptive.baselineSide,plan.side);
      assert.equal(plan.actionable,false);
      assert.equal(plan.calibrated,false);
      if(i<1800||i+2*h>=prices.length||!plan.side||!state.adaptive.side||
         !state.candidate?.shadowSide)continue;
      const actual=prices[i+2*h].price>prices[i+h].price?'CALL':'PUT';
      output.push({h,type,engine:e.id,correctOriginal:plan.side===actual,
       correctRaw:state.candidate.shadowSide===actual,
       correctAdaptive:state.adaptive.side===actual,
       adapted:state.adaptive.blendWeight>0,
       weight:state.adaptive.blendWeight,
       observations:state.adaptive.observations});
     }
    }
   }
  }
 }
 const byH=Object.fromEntries(H.map(h=>[h,tally(output.filter(x=>x.h===h))]));
 const byType=Object.fromEntries(['trend','range','reversal','false-break','shock'].map(type=>
  [type,tally(output.filter(x=>x.type===type))]));
 const byEngine=Object.fromEntries(SCENARIO_ENGINES.map(e=>
  [e.id,tally(output.filter(x=>x.engine===e.id))]));
 console.log('SENTINEL_ADAPTIVE_ALL_HORIZONS_RESULT='+JSON.stringify({
  type:'synthetic-forward-only-chronological-heldout-NOT-broker-data',
  total:tally(output),byH,byType,byEngine
 }));
 for(const h of H)assert.ok(byH[h].n>0,'no heldout tests for horizon '+h);
});
test('regime window scales to 5s and 300s, and future prices are never incorporated',()=>{
 const p=market(114,'range'),now=t0+1300000;
 const history=p.filter(x=>x.ts<=now);
 for(const h of H){
  const f=entryRegimeFeatures(history,now,h);
  assert.ok(f,'regime feature missing at '+h);
  assert.equal(f.delaySeconds,h);
  assert.equal(f.features.length,12);
  const future=[...history,{ts:now+1000,price:99},{ts:now+600000,price:.01}];
  assert.deepEqual(entryRegimeFeatures(future,now,h),f,'future quote leak at '+h);
 }
});
