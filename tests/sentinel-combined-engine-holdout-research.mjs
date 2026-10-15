// RESEARCH-ONLY comparison. Never imports this policy into production.
// Chronological quotes; no future price is seen before each signal. This is
// stress-testing on synthetic prices plus a short recorded fixture, NOT proof
// of real-world win rate or execution at the broker.
import {readFileSync} from 'node:fs';
import {analyzeNowOpportunity,advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const start=Date.UTC(2026,9,1,0,0,0);
const durations=[30000,60000];
const policies=['production_auto','auto_plus_trend_mean','auto_plus_trend_support','auto_plus_either','auto_plus_trend_only','auto_plus_mean_only'];
function chooseCandidate(sample,policy){
 const baseline=analyzeNowOpportunity({...sample,engineId:'automatic'});
 if(policy==='production_auto'||!baseline.ready)return baseline;
 const review=id=>analyzeNowOpportunity({...sample,engineId:id});
 const trend=review('trend'),mean=review('mean_reversion'),support=review('support_resistance');
 const matches=x=>x.ready===true&&x.side===baseline.side;
 let ok=false;
 switch(policy){
  case 'auto_plus_trend_mean':
    ok=baseline.regime==='observed-range-turn'?matches(mean):matches(trend);break;
  case 'auto_plus_trend_support':
    ok=baseline.regime==='observed-range-turn'?matches(support):matches(trend);break;
  case 'auto_plus_either':
    ok=matches(trend)||matches(mean);break;
  case 'auto_plus_trend_only':
    ok=baseline.regime==='observed-range-turn'||matches(trend);break;
  case 'auto_plus_mean_only':
    ok=baseline.regime!=='observed-range-turn'||matches(mean);break;
 }
 return ok?baseline:{...baseline,ready:false,side:null,entryPrice:null,reason:'research-confirmation-not-met'};
}
function samples(kind,seed,count=420){
 let state=(seed*103^0xa21bd)>>>0;
 const random=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/2**32};
 const q=[],phase=seed*.41,period=26+seed%6*9,ref=1.078;
 let noise=0;
 for(let i=0;i<count;i++){
  const t=i/count,sub=i%37;
  const drift=
    kind==='up'?i*.000010:
    kind==='down'?-i*.000010:
    kind==='weak-up'?i*.0000028:
    kind==='weak-down'?-i*.0000028:
    kind==='up-failure'?(i<230?i*.000010:230*.000010-(i-230)*.000011):
    kind==='down-failure'?(i<230?-i*.000010:-230*.000010+(i-230)*.000011):
    kind==='rise-then-fall'?(i<210?i*.000013:210*.000013-(i-210)*.000025):
    kind==='fall-then-rise'?(i<210?-i*.000013:-210*.000013+(i-210)*.000025):
    kind==='late-jump'?(i>280?(i-280)*.000025:0):
    kind==='breakout'?(i<225?0:(i-225)*.000017):
    kind==='counter-spike'?(i<245?i*.000008:i<258?245*.000008+(i-245)*.000065:245*.000008+13*.000065-(i-258)*.000015):
    kind==='step-down'?(i<240?0:-.0012-(i-240)*.000004):0;
  const swing=['range-fast','range-slow','range-irregular','chop','breakout','step-down','late-jump'].includes(kind)?
    (kind==='range-irregular'?.00055*(Math.sin(i*2*Math.PI/period+phase)+.22*Math.sin(i*2*Math.PI/17+phase)):
    kind==='chop'?.00072*(Math.sin(i*2*Math.PI/33+phase)+.34*Math.sin(i*2*Math.PI/15)):
    .00062*Math.sin(i*2*Math.PI/(kind==='range-fast'?23:kind==='range-slow'?66:46)+phase)):0;
  noise=.83*noise+(random()-.5)*.000027;
  const jumps=random()<.007?(random()<.5?-.00012:.00012):0;
  const local=(sub<4&&['up-failure','down-failure','counter-spike'].includes(kind))?.00007*Math.sin(sub*Math.PI/5):0;
  const price=ref*Math.exp(drift+swing+noise+jumps+local+.000018*Math.sin(i*.31+phase));
  q.push({ts:start+i*1000,receivedAt:start+i*1000,price});
 }
 return q;
}
const recorded=JSON.parse(readFileSync(new URL('./fixtures/sentinel-continuation-prices.json',import.meta.url),'utf8')).quoteHistory
 .filter(x=>Number.isFinite(x.ts)&&Number.isFinite(x.price)).map(x=>({...x,receivedAt:x.receivedAt??x.ts}))
 .sort((a,b)=>a.ts-b.ts);
const examples=[{type:'recorded-short',regime:'recorded',seed:0,rows:recorded}];
const kinds=['up','down','weak-up','weak-down','up-failure','down-failure','rise-then-fall','fall-then-rise','late-jump','breakout','counter-spike','range-fast','range-slow','range-irregular','chop','step-down'];
for(const kind of kinds)for(const seed of [7,19]){
 examples.push({type:kind,regime:/range|chop/.test(kind)?'range':/failure|then|spike|jump/.test(kind)?'turn':/up|down|breakout/.test(kind)?'directional':'mixed',seed,rows:samples(kind,seed)});
}
const memo=new WeakMap();
function replay(rows,policy,duration,slipSeconds=0){
 const key=policy+'|'+duration;
 let cached=memo.get(rows);
 if(!cached){cached=new Map();memo.set(rows,cached);}
 let signals=cached.get(key);
 if(!signals){
  let state=null;signals=[];
  for(let i=0;i<rows.length;i++){
   const q=rows[i],history=rows.slice(0,i+1),now=q.ts;
   const baselineInput={quoteHistory:history,price:q.price,quoteAt:q.ts,now,durationMs:duration};
   const candidate=chooseCandidate(baselineInput,policy);
   const next=advanceNowOpportunity({previous:state,candidate,quoteAt:q.ts,now,asset:'RESEARCH',durationMs:duration,engineId:policy});
   if(next?.phase==='fired'&&next.entryTriggeredAt!==state?.entryTriggeredAt){
    signals.push({t:q.ts,side:next.side,reason:candidate.reason});
   }
   state=next;
  }
  cached.set(key,signals);
 }
 let wins=0,losses=0,ties=0,unknown=0;
 for(const s of signals){
  const entryAt=s.t+slipSeconds*1000,expiryAt=entryAt+duration;
  const entry=rows.find(x=>x.ts>=entryAt&&x.ts<=entryAt+1000);
  const exit=rows.find(x=>x.ts>=expiryAt&&x.ts<=expiryAt+1000);
  if(!entry||!exit){unknown++;continue}
  const move=(s.side==='CALL'?exit.price-entry.price:entry.price-exit.price);
  if(move>0)wins++;else if(move<0)losses++;else ties++;
 }
 return {signals:signals.length,completed:wins+losses,wins,losses,unknown};
}
const merged={};
for(const duration of durations){
 for(const slip of [0,1,2]){
  for(const policy of policies)for(const ex of examples){
   const metrics=replay(ex.rows,policy,duration,slip);
   const key=[duration/1000,slip,ex.regime,policy].join('|');
   const o=merged[key]||{n:0,scored:0,wins:0,losses:0,unknown:0,cases:0};
   o.n+=metrics.signals;o.scored+=metrics.completed;o.wins+=metrics.wins;o.losses+=metrics.losses;o.unknown+=metrics.unknown;o.cases++;
   merged[key]=o;
  }
 }
}
const rows=Object.entries(merged).map(([key,v])=>{
 const [duration,slip,regime,policy]=key.split('|');
 return {duration:Number(duration),slip:Number(slip),regime,policy,
   ...v,rate:v.scored?+(v.wins*100/v.scored).toFixed(2):null,
   net086:+(v.wins*.86-v.losses).toFixed(2)};
});
for(const row of rows)console.log('COMBO_COMPARE '+JSON.stringify(row));
for(const duration of [30,60])for(const slip of [0,1,2]){
 const chosen=rows.filter(x=>x.duration===duration&&x.slip===slip&&x.regime!=='recorded');
 for(const policy of policies){
  const a=chosen.filter(x=>x.policy===policy);
  const v=a.reduce((p,r)=>({n:p.n+r.n,scored:p.scored+r.scored,wins:p.wins+r.wins,losses:p.losses+r.losses,unknown:p.unknown+r.unknown}),{n:0,scored:0,wins:0,losses:0,unknown:0});
  console.log('COMBO_TOTAL '+JSON.stringify({duration,slip,policy,...v,
   rate:v.scored?+(v.wins*100/v.scored).toFixed(2):null,
   theoreticalPayout086:+(v.wins*.86-v.losses).toFixed(2)}));
 }
}
console.log('METHOD','Synthetic market paths (seeds 7/19), 1 short recorded fixture; no real broker orders; no claims of real win rates. Expiry 30/60s, execution slippage 0/1/2s; payout hypothetical 86%.');
