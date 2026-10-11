import test from 'node:test';
import assert from 'node:assert/strict';
import {SCENARIO_ENGINES} from '../sentinel-trading-lab/agent/src/core/scenario-engine-catalog.mjs';
import {futureEntrySchedule as schedule67} from '../sentinel-trading-lab/agent/src/core/research-baseline-13467/future-entry-schedule.mjs';
import {futureEntrySchedule as schedule70} from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';

// Research only. Not imported by the Agent or website.
// Every quote fed to any strategy is at/before the decision instant.
const HS=[5,10,30,60,120,300];
const TYPES=['trend','range','cycle','reversal','false-break','breakout','volatility','random'];
const EPOCH=1800000000000;
const ENGINES=SCENARIO_ENGINES.map(x=>x.id);
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const percent=(n,d)=>d?Number((100*n/d).toFixed(2)):null;

function sample(seed,regime,length=3800){
 let randomSeed=seed>>>0,p=Math.log(1.1),d=0,rangeOrigin=Math.log(1.1);
 const rand=()=>((randomSeed=(1664525*randomSeed+1013904223)>>>0)+1)/4294967297;
 const out=[];
 for(let t=0;t<length;t++){
  const u=rand(),v=rand(),w=rand();
  const z=Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
  let move=z*.000012;
  if(regime==='trend')move+=(t%1430<850?.0000036:-.0000045)+.28*d;
  if(regime==='range')move+=-.085*(p-rangeOrigin)-.4*d;
  if(regime==='cycle'){
   const per=68+seed%40;
   const f=i=>.00054*Math.sin(i*2*Math.PI/per+.3*seed)+.00014*Math.sin(i*2*Math.PI/(per*.52));
   move+=f(t)-f(t-1)
  }
  if(regime==='reversal')move+=(Math.floor(t/164)%2?-.000006:.000006)+.16*d;
  if(regime==='false-break')move+=((t%210)<21?.000013:(t%210)<53?-.000012:0)-.035*(p-rangeOrigin);
  if(regime==='breakout')move+=((t%390)<70?.00000015:(t%390)<150?.000007:0)+.12*d;
  if(regime==='volatility'){
   const phase=t%700;
   move+=z*(phase>250&&phase<510?.000023:.000002)+(w<.022?(v<.5?-1:1)*.00010:0)-.29*d-.025*(p-rangeOrigin)
  }
  d=move;p+=move;out.push({ts:EPOCH+t*1000,price:Math.exp(p)})
 }
 return out
}
function knownState(q){
 const recent=q.slice(-180),p=recent.map(x=>Math.log(x.price));
 const total=p.slice(1).reduce((x,v,i)=>x+Math.abs(v-p[i]),0);
 const efficiency=total?Math.abs(p.at(-1)-p[0])/total:0;
 const max=Math.max(...p),min=Math.min(...p),pos=(p.at(-1)-min)/Math.max(1e-12,max-min);
 // Classification may use PAST quotes only, never the simulator's regime label.
 return pos<=.13||pos>=.87?'past-edge':efficiency>=.3?'past-trend':efficiency<=.09?'past-range':'past-mixed'
}
function sanitized(row){
 const entry=Number(row?.projectedEntryPrice),exit=Number(row?.projectedExitPrice);
 const side=['CALL','PUT'].includes(row?.side)?row.side:null;
 return {side,delta:side&&entry>0&&exit>0?Math.log(exit/entry):0};
}
function build(seeds){
 const all=[];
 for(const kind of TYPES)for(const seed of seeds){
  const prices=sample(seed,kind);
  for(const i of [940,1750,2650]){
   const now=prices[i].ts,q=prices.slice(Math.max(0,i-1950),i+1),snap={quoteHistory:q,quoteTs:now,provider:'iq_option'};
   const predicted={};
   for(const id of ENGINES){
    const settings={engine:id,asset:'EUR/USD OTC',orderDurationMs:60000};
    const by67=schedule67({settings,snap,now,delays:HS});
    const by70=schedule70({settings,snap,now,delays:HS});
    predicted[id]={v67:Object.fromEntries(by67.map(r=>[r.delaySeconds,sanitized(r)])),
     v70:Object.fromEntries(by70.map(r=>[r.delaySeconds,sanitized(r)]))}
   }
   for(const h of HS){
    const truth=prices[i+2*h].price>prices[i+h].price?'CALL':
      prices[i+2*h].price<prices[i+h].price?'PUT':'DRAW';
    all.push({kind,seed,i,h,truth,state:knownState(q),p:
     Object.fromEntries(ENGINES.map(e=>[e,{v67:predicted[e].v67[h],v70:predicted[e].v70[h]}]))})
   }
  }
 }
 return all
}
function choiceVersion(train){
 const result={};
 for(const e of ENGINES){
  const wins={v67:0,v70:0},coverage={v67:0,v70:0};
  for(const r of train)for(const v of ['v67','v70']){
   if(r.p[e][v].side){coverage[v]++;if(r.p[e][v].side===r.truth)wins[v]++}
  }
  // Versions are selected on training ONLY. Prefer 67 on near ties.
  result[e]=wins.v70>=wins.v67+3?'v70':'v67';
 }
 return result
}
function forecast(r,e,versions){return r.p[e][versions[e]]}
function quality(train,e,versions,h,state){
 let total=0,wins=0,n=0,localWins=0;
 for(const r of train){
  if(r.h!==h)continue;
  const side=forecast(r,e,versions).side;
  if(!side||r.truth==='DRAW')continue;
  total++;if(side===r.truth)wins++;
  if(r.state===state){n++;if(side===r.truth)localWins++}
 }
 const global=(wins+22)/(total+44);
 return (localWins+global*45)/(n+45);
}
function absScale(train,e,versions,h){
 let sum=0,count=0;
 for(const r of train)if(r.h===h){const f=forecast(r,e,versions);if(f.side){sum+=Math.abs(f.delta);count++}}
 return Math.max(1e-11,count?sum/count:1e-11)
}
function pick(r,a,b,policy,fit){
 const f=forecast(r,a,fit.versions),g=forecast(r,b,fit.versions);
 if(!f.side||!g.side)return null;
 // A confirmed agreement can still be two strategies making the SAME error.
 // Check ex-ante conditional reliability using past-only market features.
 const guarded=policy.endsWith('_guard');
 const base=guarded?policy.replace('_guard',''):policy;
 const qa=fit.qualities[a][r.h][r.state],qb=fit.qualities[b][r.h][r.state];
 if(guarded&&(qa+qb)/2<.595)return null;
 if(f.side===g.side)return f.side;
 if(base==='agreement')return null;
 if(base==='adaptive'){
  if(guarded&&Math.max(qa,qb)<.63)return null;
  const better=qa>=qb?{side:f.side,q:qa,other:qb}:{side:g.side,q:qb,other:qa};
  return better.q>=.585&&better.q-better.other>=.035?better.side:null
 }
 if(base==='evidence'){
  // Compare conditional historical accuracy AND normalized forecast displacement,
  // NOT raw percent figures or uncalibrated model confidences.
  const sa=Math.sign(f.delta)*clamp((qa-.5)*2,.05,1)*Math.abs(f.delta)/fit.scales[a][r.h];
  const sb=Math.sign(g.delta)*clamp((qb-.5)*2,.05,1)*Math.abs(g.delta)/fit.scales[b][r.h];
  const strength=Math.abs(sa+sb)/(Math.abs(sa)+Math.abs(sb)+1e-12);
  const side=sa+sb>0?'CALL':'PUT',q=side===f.side?qa:qb;
  return strength>=(guarded?.48:.35)&&q>=(guarded?.62:.55)?side:null
 }
 throw Error('unknown policy')
}
function stats(data,a,b,policy,fit){
 let offered=0,wins=0,draws=0,agree=0,conflict=0,rescue=0,harm=0;
 const regimes={};
 for(const r of data){
  const first=forecast(r,a,fit.versions),second=forecast(r,b,fit.versions);
  const same=first.side&&first.side===second.side;
  const side=pick(r,a,b,policy,fit);
  if(!side)continue;
  offered++;if(same)agree++;else conflict++;
  const won=side===r.truth;if(won)wins++;if(r.truth==='DRAW')draws++;
  if(won&&(![first.side,second.side].includes(r.truth)))throw Error('cannot win without one correct');
  if(won&&(first.side!==r.truth||second.side!==r.truth))rescue++;
  if(!won&&(first.side===r.truth||second.side===r.truth))harm++;
  const k=r.kind;const z=regimes[k]||(regimes[k]={n:0,wins:0});z.n++;if(won)z.wins++;
 }
 const accuracy=percent(wins,offered),coverage=percent(offered,data.length);
 return {n:data.length,signals:offered,wins,accuracy,coverage,draws,
  agreements:agree,disagreementDecisions:conflict,rescuedRelativeToOne:rescue,
  harmedRelativeToOne:harm,
  byMarket:Object.fromEntries(Object.entries(regimes).map(([k,x])=>[k,{signals:x.n,accuracy:percent(x.wins,x.n)}]))}
}
function soloStats(data,e,fit){
 let offered=0,wins=0;
 for(const r of data){const f=forecast(r,e,fit.versions);if(f.side){offered++;wins+=Number(f.side===r.truth)}}
 return {signals:offered,accuracy:percent(wins,offered),coverage:percent(offered,data.length)}
}
function prepare(train){
 const versions=choiceVersion(train),states=['past-edge','past-trend','past-range','past-mixed'];
 const qualities={},scales={};
 for(const e of ENGINES){
  qualities[e]={};scales[e]={};
  for(const h of HS){
   qualities[e][h]=Object.fromEntries(states.map(state=>[state,quality(train,e,versions,h,state)]));
   scales[e][h]=absScale(train,e,versions,h)
  }
 }
 return {versions,qualities,scales}
}
function rank(pair,trainingStats){
 if(trainingStats.signals<Math.max(80,Math.ceil(trainingStats.n*.35))||trainingStats.coverage<35)return -Infinity;
 const p=trainingStats.wins/trainingStats.signals;
 // Penalize low-coverage, small samples and optimistic noisy training hits.
 const conservative=p-1.65*Math.sqrt(p*(1-p)/trainingStats.signals);
 return conservative+0.025*(trainingStats.coverage/100)
}
export function evaluateTwoStrategies(){
 const train=build([41,731,83,1201,211,1049,1601,2027]),hold=build([3001,4001,5021,6007]);
 const fit=prepare(train),policies=['agreement','adaptive','evidence','agreement_guard','adaptive_guard','evidence_guard'],candidates=[];
 for(let i=0;i<ENGINES.length;i++)for(let j=i+1;j<ENGINES.length;j++)
 for(const policy of policies){
  const a=ENGINES[i],b=ENGINES[j],training=stats(train,a,b,policy,fit);
  candidates.push({a,b,policy,training,rank:rank(null,training)})
 }
 candidates.sort((a,b)=>b.rank-a.rank);
 const pickBest=candidates[0];
 const validation=stats(hold,pickBest.a,pickBest.b,pickBest.policy,fit);
 const solos=Object.fromEntries(ENGINES.map(e=>[e,soloStats(hold,e,fit)]));
 const soloTop=Object.entries(solos).sort((a,b)=>b[1].accuracy-a[1].accuracy)[0];
 const qualified=validation.accuracy>=70&&validation.coverage>=30&&
  validation.accuracy>soloTop[1].accuracy&&validation.signals>=Math.ceil(hold.length*.35);
 return {
  warning:'synthetic deterministic generator only, NOT validated broker accuracy; scenarios repeated by engine and horizon',
  trainingSize:train.length,holdoutSize:hold.length,
  trainSeeds:[41,731,83,1201,211,1049,1601,2027],unusedHoldoutSeeds:[3001,4001,5021,6007],
  versionByStrategy:fit.versions,
  policiesEvaluated:policies,
  configurationsCompared:candidates.length,
  trainingWinner:{a:pickBest.a,b:pickBest.b,policy:pickBest.policy,score:Number(pickBest.rank.toFixed(4)),...pickBest.training},
  untouchedHoldout:{...validation},
  bestSoloHoldout:{name:soloTop[0],...soloTop[1]},
  soloHoldout:solos,
  top5ByTraining:candidates.slice(0,5).map(x=>({a:x.a,b:x.b,policy:x.policy,score:Number(x.rank.toFixed(4)),trainingAccuracy:x.training.accuracy,trainingCoverage:x.training.coverage,
   holdout:stats(hold,x.a,x.b,x.policy,fit)})),
  qualifiedForRealTrading:false,
  candidatePassedSyntheticThreshold:qualified,
  defaultForPossibleFutureExperimentalUI:qualified?
    {mode:'two',first:pickBest.a,second:pickBest.b,policy:pickBest.policy}:null,
  doNotDeploy:true
 }
}
test('third independent seed set; no production code changed',()=>{
 const r=evaluateTwoStrategies();
 console.log('SENTINEL_TWO_STRATEGY_BENCHMARK='+JSON.stringify(r));
 assert.equal(r.trainingSize,8*8*3*6);
 assert.equal(r.holdoutSize,8*4*3*6);
 assert.equal(r.configurationsCompared,36*6);
 assert.equal(r.doNotDeploy,true);
});
