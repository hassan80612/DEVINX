import test from 'node:test';
import assert from 'node:assert/strict';
import {SCENARIO_ENGINES} from '../sentinel-trading-lab/agent/src/core/scenario-engine-catalog.mjs';
import {futureEntrySchedule} from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';
import {advanceSelectedEngineResidualStudy} from '../sentinel-trading-lab/agent/src/core/vnext-residual-reversal-research.mjs';
import {adaptSameEngineFutureEntry} from '../sentinel-trading-lab/agent/src/core/vnext-adaptive-residual-research.mjs';
const t0=1800000000000;
const HORIZONS=[5,10,30,60,120,300];
function synth(seed,kind){
 let x=seed>>>0,p=Math.log(1.1),old=0;
 const random=()=>((x=(1664525*x+1013904223)>>>0)+1)/4294967297;
 const out=[];
 for(let i=0;i<3700;i++){
  const u=random(),v=random(),z=random();
  const volatility=kind==='volatility-shift'&&i>=1800?3:1;
  const noise=Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)*.000009*volatility;
  let drift=0;
  if(kind==='trend')drift=(i<1950?.000004:-.000004)+old*.18;
  if(kind==='oscillation')drift=-.065*(p-Math.log(1.1))-.42*old;
  if(kind==='reversal')drift=(Math.floor(i/160)%2?-.000007:.000007)+old*.1;
  if(kind==='false-break')drift=(i%220<18?.000015:i%220<42?-.000013:0)-.034*(p-Math.log(1.1));
  if(kind==='volatility-shift')drift=i<1800?.000002:-.06*(p-Math.log(1.1))-.30*old;
  const delta=noise+drift;
  p+=delta;old=delta;
  out.push({ts:t0+i*1000,price:Math.exp(p)});
 }
 return out;
}
function summary(rows){
 return {n:rows.length,baseline:rows.filter(x=>x.baseline).length,
  corrected:rows.filter(x=>x.corrected).length,
  adaptive:rows.filter(x=>x.adaptive).length,
  adaptiveFlips:rows.filter(x=>x.adaptiveChanged).length,
  rescued:rows.filter(x=>!x.baseline&&x.adaptive).length,
  harmed:rows.filter(x=>x.baseline&&!x.adaptive).length};
}
test('13.4.67 + self-residual adaptive comparison works at EVERY horizon and ALL 9 selected engines without modifying original',()=>{
 const rows=[];
 for(const h of HORIZONS){
  for(const kind of ['trend','oscillation','reversal','false-break','volatility-shift']){
   for(const seed of [101,7009]){
    const full=synth(seed,kind);
    for(const engine of SCENARIO_ENGINES){
     let study=null;
     for(const i of [900,1080,1260,1440,1620,1800,1980,2160,2340,2520,2700,2880,3060]){
      const now=t0+i*1000;
      const history=full.slice(Math.max(0,i-2350),i+1);
      const plan=futureEntrySchedule({
       settings:{engine:engine.id,asset:'EUR/USD OTC',orderDurationMs:h*1000},
       snap:{provider:'iq_option',quoteHistory:history,quoteTs:now},
       now,delays:[h]
      })[0];
      const copySide=plan.side,copyEntry=plan.entryAt,copyExit=plan.exitAt;
      study=advanceSelectedEngineResidualStudy({
       previous:study,basePlan:plan,quoteHistory:history,now
      });
      const adaptive=adaptSameEngineFutureEntry({
       basePlan:plan,study,quoteHistory:history,now
      });
      assert.equal(plan.side,copySide);
      assert.equal(plan.entryAt,copyEntry);
      assert.equal(plan.exitAt,copyExit);
      assert.equal(plan.actionable,false);
      assert.equal(adaptive.actionable,false);
      assert.equal(adaptive.calibrated,false);
      assert.equal(adaptive.baselineSide,plan.side);
      assert.ok(adaptive.contribution>=0&&adaptive.contribution<=1);
      if(i<1800||!plan.side||!adaptive.adaptiveSide||!study.candidate?.shadowSide)continue;
      const entry=full[i+h].price,exit=full[i+2*h].price;
      const actual=entry<exit?'CALL':entry>exit?'PUT':null;
      if(!actual)continue;
      rows.push({h,kind,engine:engine.id,seed,
       baseline:plan.side===actual,corrected:study.candidate.shadowSide===actual,
       adaptive:adaptive.adaptiveSide===actual,
       adaptiveChanged:plan.side!==adaptive.adaptiveSide,
       samples:adaptive.samples});
     }
    }
   }
  }
 }
 const all=summary(rows);
 const byHorizon=Object.fromEntries(HORIZONS.map(h=>[h,summary(rows.filter(x=>x.h===h))]));
 const byRegime=Object.fromEntries(['trend','oscillation','reversal','false-break','volatility-shift']
  .map(k=>[k,summary(rows.filter(x=>x.kind===k))]));
 console.log('SENTINEL_ALL_HORIZONS_ADAPTIVE_RESULT='+JSON.stringify({
  disclaimer:'synthetic, overlapping forecasts and correlated motor results, NOT broker win rate',
  all,byHorizon,byRegime
 }));
 for(const h of HORIZONS)assert.ok(byHorizon[h].n>0,'no observations for horizon '+h);
 assert.equal(Object.keys(byHorizon).length,6);
});
