import test from 'node:test';
import {SCENARIO_ENGINES} from '../sentinel-trading-lab/agent/src/core/scenario-engine-catalog.mjs';
import {futureEntrySchedule} from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';
import {advanceSelectedEngineResidualStudy} from '../sentinel-trading-lab/agent/src/core/vnext-residual-reversal-research.mjs';

/**
 * Chronological synthetic benchmark, NO live market results. Generates two
 * disjoint noise seeds per scenario and never shows future data to forecaster.
 * All models receive SAME historical quote snapshot at SAME decision time.
 * Heldout starts after 1050s of online training. Predictions overlap and
 * motors are correlated, so counts are NOT an independent win-rate estimate.
 */
const t0=1800000000000;
function prices(seed,kind){
 let x=seed>>>0,lp=Math.log(1.1),last=0,shock=0;
 const random=()=>((x=(1664525*x+1013904223)>>>0)+1)/4294967297;
 const out=[];
 for(let i=0;i<1920;i++){
  const u=random(),v=random(),a=random();
  const noise=Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)*.000011;
  let drift=0;
  if(kind==='trend')drift=(i%1050<650?1:-1)*.0000036+.36*last;
  if(kind==='oscillation')drift=-.075*(lp-Math.log(1.1))-.46*last;
  if(kind==='reversal')drift=((Math.floor(i/108)%2)?-.0000065:.0000065)+.13*last;
  if(kind==='false-break')drift=(i%190<17?.000014:i%190<42?-.000012:0)-.03*(lp-Math.log(1.1));
  if(kind==='spikes'){
   shock=a<.035?(v<.5?-1:1)*.00009:0;
   drift=shock-.20*last-.025*(lp-Math.log(1.1));
  }
  const delta=noise+drift;
  lp+=delta;last=delta;
  out.push({ts:t0+i*1000,price:Math.exp(lp)});
 }
 return out;
}
function summary(rows){
 const done=rows.filter(x=>x.baseline!==null&&x.shadow!==null);
 const helped=done.filter(x=>!x.baseline&&x.shadow).length,
       hurt=done.filter(x=>x.baseline&&!x.shadow).length;
 return{samples:done.length,baseline:done.filter(x=>x.baseline).length,
 shadow:done.filter(x=>x.shadow).length,helped,hurt,
 changes:done.filter(x=>x.flip).length,
 accuracyBase:done.length?Math.round(done.filter(x=>x.baseline).length*1000/done.length)/10:null,
 accuracyShadow:done.length?Math.round(done.filter(x=>x.shadow).length*1000/done.length)/10:null};
}
test('walk-forward 13.4.67 versus SAME-engine self-correction on heldout synthetic markets',()=>{
 const rows=[],allTypes=['trend','oscillation','reversal','false-break','spikes'];
 for(const kind of allTypes)for(const seed of [87,1909]){
  const full=prices(seed,kind);
  for(const engine of SCENARIO_ENGINES){
   let study=null;
   for(let i=360;i<=1680;i+=55){
    const now=t0+i*1000;
    const quoteHistory=full.slice(Math.max(0,i-1200),i+1);
    const settings={engine:engine.id,asset:'EUR/USD OTC',orderDurationMs:30000};
    const r=futureEntrySchedule({settings,
      snap:{provider:'iq_option',quoteHistory,quoteTs:now},now,delays:[30]})[0];
    study=advanceSelectedEngineResidualStudy({
      previous:study,basePlan:r,quoteHistory,now});
    if(i<1050||!r.side||!study.candidate?.shadowSide)continue;
    const actual=Math.sign(full[i+60].price-full[i+30].price);
    if(!actual)continue;
    const correct=actual>0?'CALL':'PUT';
    rows.push({kind,engine:engine.id,seed,
      baseline:r.side===correct,shadow:study.candidate.shadowSide===correct,
      flip:r.side!==study.candidate.shadowSide,
      observations:study.candidate.observations});
   }
  }
 }
 const heldout=summary(rows);
 const byType=Object.fromEntries(allTypes.map(kind=>[kind,summary(rows.filter(x=>x.kind===kind))]));
 const byEngine=Object.fromEntries(SCENARIO_ENGINES.map(e=>[e.id,summary(rows.filter(x=>x.engine===e.id))]));
 console.log('SENTINEL_RESIDUAL_WALK_FORWARD_RESULT='+JSON.stringify({kind:'synthetic_unseen_continuations_not_live_broker_data',heldout,byType,byEngine}));
 if(!rows.length)throw Error('benchmark produced no heldout observation');
});
