import test from 'node:test';
import assert from 'node:assert/strict';
import {SCENARIO_ENGINES}
 from '../sentinel-trading-lab/agent/src/core/scenario-engine-catalog.mjs';
import {futureEntrySchedule}
 from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';
import {oscillatoryPhaseForecast}
 from '../sentinel-trading-lab/agent/src/core/vnext-oscillation-phase-research.mjs';

const EPOCH=1800000000000;
const HS=[5,10,30,60,120,300];
function produce(seed,regime,length=4800){
 let x=seed>>>0,p=Math.log(1.1),prev=0,prevSpike=0;
 const rand=()=>((x=(1664525*x+1013904223)>>>0)+1)/4294967297;
 const out=[];
 const cycle=regime==='periodic'? [38,74,132,280][seed%4]:
   regime==='evolving-cycle'?[61,121,226][seed%3]:90;
 const phase=(seed%19)*.21;
 for(let i=0;i<length;i++){
  const u=rand(),v=rand(),w=rand();
  const eps=Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
  let move=eps*.000013;
  if(regime==='periodic'){
   // true but noisy phase, optionally slight drift, hidden from the model
   const pos=i=>.0007*Math.sin(i*2*Math.PI/cycle+phase)
    +.00015*Math.sin(i*2*Math.PI/(cycle*.47)+phase*.8);
   move+=(pos(i)-pos(i-1))+(i%1400<900?.00000012:-.00000012);
  }
  if(regime==='evolving-cycle'){
   // Changing cycle frequency and amplitude: not the trivial perfect sine
   const theta=i=>2*Math.PI*(i/cycle+.14*Math.sin(i/1700)) +phase;
   const pos=i=>.00045*Math.sin(theta(i))+
    .00018*Math.sin(theta(i)*.55);
   move+=pos(i)-pos(i-1);
  }
  if(regime==='choppy')move+=-.08*(p-Math.log(1.1))-.47*prev;
  if(regime==='turn')move+=(Math.floor(i/170)%2?-.000006:.000006)+.18*prev;
  if(regime==='false-break')move+=(i%220<21?.000014:i%220<48?-.000011:0)-.042*(p-Math.log(1.1));
  if(regime==='spikes'){
   const spike=w<.027?(v<.5?-1:1)*.00012:0;
   move+=spike-.25*prevSpike-.025*(p-Math.log(1.1));
   prevSpike=spike;
  }
  if(regime==='trend')move+=(i%1700<1150?.000004:-.000004)+.23*prev;
  p+=move;prev=move;
  out.push({ts:EPOCH+i*1000,price:Math.exp(p)});
 }
 return out;
}
function score(a){
 const correct=x=>a.filter(e=>e[x]).length;
 const changed=a.filter(e=>e.changed);
 return {
  n:a.length,baseline:correct('baseline'),phase:correct('phase'),
  helped:changed.filter(e=>e.phase).length,
  harmed:changed.filter(e=>e.baseline).length,
  changed:changed.length,
  engaged:a.filter(e=>e.weight>0).length,
  avgWeight:a.length?Number((a.reduce((s,r)=>s+r.weight,0)/a.length).toFixed(3)):0
 };
}
test('independent holdout: phase-aware vs original selected 67 on 9 engines, six horizons, 7 untouched regimes',()=>{
 const regimes=['periodic','evolving-cycle','choppy','turn','false-break','spikes','trend'];
 const all=[];
 for(const type of regimes)for(const seed of [83,2759]){
  const quotes=produce(seed,type);
  for(const h of HS){
   const step=Math.max(140,2*h+12);
   for(const engine of SCENARIO_ENGINES){
    for(let i=1650;i<=4190;i+=step){
     const now=EPOCH+i*1000;
     const history=quotes.slice(Math.max(0,i-3300),i+1);
     const plan=futureEntrySchedule({
      settings:{engine:engine.id,asset:'EUR/USD OTC',orderDurationMs:h*1000},
      snap:{provider:'iq_option',quoteTs:now,quoteHistory:history},
      now,delays:[h]
     })[0];
     if(!plan?.side||i+2*h>=quotes.length)continue;
     const candidate=oscillatoryPhaseForecast({basePlan:plan,quoteHistory:history,now});
     assert.equal(candidate.baselineSide,plan.side);
     assert.equal(plan.actionable,false);
     const actual=Math.sign(quotes[i+2*h].price-quotes[i+h].price);
     if(!actual)continue;
     const outcome=actual>0?'CALL':'PUT';
     all.push({
      type,seed,h,engine:engine.id,
      baseline:plan.side===outcome,phase:candidate.phaseSide===outcome,
      changed:plan.side!==candidate.phaseSide,weight:candidate.weight,
      phasePeriod:candidate.periodSeconds
     });
    }
   }
  }
 }
 const overall=score(all);
 const byH=Object.fromEntries(HS.map(h=>[h,score(all.filter(x=>x.h===h))]));
 const byRegime=Object.fromEntries(regimes.map(k=>[k,score(all.filter(x=>x.type===k))]));
 const byEngine=Object.fromEntries(SCENARIO_ENGINES.map(e=>
  [e.id,score(all.filter(x=>x.engine===e.id))]));
 console.log('SENTINEL_PHASE_VS_67_HELDOUT='+JSON.stringify({
  evidence:'synthetic-chronological-unique-issue-times-per-horizon-not-real-OTC',
  overall,byH,byRegime,byEngine
 }));
 for(const h of HS)assert.ok(byH[h].n>0);
});
