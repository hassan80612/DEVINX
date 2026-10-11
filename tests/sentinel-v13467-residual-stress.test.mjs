import test from 'node:test';
import {SCENARIO_ENGINES} from '../sentinel-trading-lab/agent/src/core/scenario-engine-catalog.mjs';
import {futureEntrySchedule} from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';
import {advanceSelectedEngineResidualStudy} from '../sentinel-trading-lab/agent/src/core/vnext-residual-reversal-research.mjs';
// Hold-out by DESIGN, not used to tune weights or parameters.
const base=1800000000000;
function sample(seed,kind){
 let s=seed>>>0,p=Math.log(1.1),prior=0,priorShock=0;
 const rand=()=>((s=(1664525*s+1013904223)>>>0)+1)/4294967297,quotes=[];
 for(let t=0;t<1940;t++){
  const u=rand(),v=rand(),w=rand();
  const noise=Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)*
   (kind==='volatility-shift'&&t>=990?.000029:.000011);
  let drift=0;
  if(kind==='volatility-shift')drift=t>=990?-.05*(p-Math.log(1.1))-.27*prior:.0000025;
  if(kind==='clustered-spikes'){
   const shock=(t%63<4&&w<.38)?(v<.5?-1:1)*.00014:0;
   drift=shock-.15*priorShock-.04*(p-Math.log(1.1));priorShock=shock;
  }
  if(kind==='fast-whipsaw')drift=(Math.floor(t/16)%2?.000013:-.000013)-.2*prior;
  if(kind==='mixed-breakouts'){
   const phase=t%180;
   drift=phase<14?.000013:phase<31?-.000012:
     phase>90&&phase<135?.0000025:-.023*(p-Math.log(1.1));
  }
  const ret=noise+drift;p+=ret;prior=ret;
  quotes.push({ts:base+t*1000,price:Math.exp(p)});
 }
 return quotes;
}
const score=a=>({samples:a.length,original:a.filter(x=>x.base).length,
 correction:a.filter(x=>x.shadow).length,
 rescued:a.filter(x=>!x.base&&x.shadow).length,
 harmed:a.filter(x=>x.base&&!x.shadow).length,
 flipped:a.filter(x=>x.flip).length});
test('independent stress regimes: evaluate same fixed future entry time with immutable approved baseline',()=>{
 const types=['volatility-shift','clustered-spikes','fast-whipsaw','mixed-breakouts'];
 const results=[];
 for(const kind of types)for(const seed of [791,24111]){
  const quotes=sample(seed,kind);
  for(const e of SCENARIO_ENGINES){
   let previous=null;
   for(let i=360;i<=1680;i+=55){
    const now=base+i*1000,history=quotes.slice(Math.max(0,i-1200),i+1);
    const plan=futureEntrySchedule({
     settings:{engine:e.id,asset:'EUR/USD OTC',orderDurationMs:30000},
     snap:{provider:'iq_option',quoteHistory:history,quoteTs:now},
     now,delays:[30]
    })[0];
    previous=advanceSelectedEngineResidualStudy({previous,basePlan:plan,
     quoteHistory:history,now});
    if(i<1050||!plan?.side||!previous?.candidate?.shadowSide)continue;
    const actual=quotes[i+60].price>quotes[i+30].price?'CALL':'PUT';
    results.push({kind,engine:e.id,base:plan.side===actual,
      shadow:previous.candidate.shadowSide===actual,
      flip:plan.side!==previous.candidate.shadowSide});
   }
  }
 }
 const all=score(results);
 const byMarket=Object.fromEntries(types.map(k=>[k,score(results.filter(r=>r.kind===k))]));
 const byEngine=Object.fromEntries(SCENARIO_ENGINES.map(e=>[e.id,score(results.filter(r=>r.engine===e.id))]));
 console.log('SENTINEL_RESIDUAL_STRESS_RESULT='+JSON.stringify({mode:'synthetic_new_regimes_no_broker_evidence',all,byMarket,byEngine}));
 if(all.samples===0)throw Error('stress holdout empty');
});
