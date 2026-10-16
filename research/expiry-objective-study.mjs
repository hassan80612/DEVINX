// OFFLINE ONLY. No operational Agent imports this module.
// Hypotheses fixed before scoring: classify expiry sign (rather than return
// magnitude), require objective agreement, and expose the 60s learner.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {analyzeNowOpportunity as published,advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {horizonPriceDynamics} from './horizon-price-dynamics.mjs';

const source=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/causal-pattern-direction.mjs',import.meta.url),'utf8');
export const sourceSha256=createHash('sha256').update(source).digest('hex');
if(sourceSha256!=='e6ea685066815869455d92b30ca0322dd5a3505f03a93871f8d1449193cc3870')
 throw Error('Published learner changed: re-review audit instrumentation before running.');
const anchor='return {ready:!!direction,side:direction,';
if(source.split(anchor).length!==2)throw Error('Audit anchor must be unique');
// This adds observability at the existing return only. No feature, selected
// neighbour, weight, label, timing, or decision is changed by instrumentation.
const instrumented=source.replace(anchor,
 'return {diagnostic:{weighted,sum,winsCall,winsPut,selected:top.map(x=>({...x,weight:1/(.18+x.diff)}))},ready:!!direction,side:direction,');
export const {causalPatternDirection:inspectLearning}=await import('data:text/javascript;base64,'+Buffer.from(instrumented).toString('base64'));
const side=x=>x>0?'CALL':x<0?'PUT':null;

export function expiryEvidence(selected){
 let total=0,call=0,put=0,ties=0,expected=0,weightSquares=0;
 for(const x of selected){
  if(!(Number.isFinite(x.weight)&&x.weight>0&&Number.isFinite(x.move)))throw Error('Invalid completed-outcome evidence');
  total+=x.weight;weightSquares+=x.weight*x.weight;expected+=x.weight*x.move;
  if(x.move>0)call+=x.weight;else if(x.move<0)put+=x.weight;else ties+=x.weight;
 }
 const meanSide=side(expected),majoritySide=side(call-put);
 return {meanSide,majoritySide,agreement:!!meanSide&&meanSide===majoritySide,
  // Empirical weighted frequencies from selected, overlapping historical
  // examples. These fields deliberately do NOT claim a calibrated probability.
  callWeightFraction:total?call/total:null,putWeightFraction:total?put/total:null,
  tieWeightFraction:total?ties/total:null,imbalance:total?Math.abs(call-put)/total:0,
  meanSideWeightFraction:total&&meanSide?(meanSide==='CALL'?call:put)/total:null,
  effectiveWeightCount:weightSquares?total*total/weightSquares:0};
}

export function candidate(input,policy='published'){
 if(policy==='published')return published(input);
 if(policy==='horizon_dynamics')return horizonPriceDynamics(input);
 if(!['mean_both_horizons','majority_expiry','coherent_expiry'].includes(policy))throw Error('Unknown policy');
 const structural=published({...input,qualityPolicy:'baseline',engineId:'automatic'});
 const learning=inspectLearning(input);
 if(!(learning.ready&&learning.strength>=.4))return structural;
 const e=expiryEvidence(learning.diagnostic.selected);
 if(policy==='coherent_expiry'&&!e.agreement)return {...structural,researchFallback:'conflicting-expiry-objectives'};
 return {...structural,...learning,
  side:policy==='majority_expiry'?e.majoritySide:learning.side,
  reason:'research-'+policy,expiryEvidence:e};
}
export const policies=['published','mean_both_horizons','majority_expiry','coherent_expiry','horizon_dynamics'];
const inputFor=(history,durationMs)=>{const q=history.at(-1);return {quoteHistory:history,
 price:q.price,quoteAt:q.ts,now:q.ts,durationMs,engineId:'automatic',qualityPolicy:'adaptive-market-v17'};};
const endQuote=(rows,t)=>rows.find(q=>q.ts>=t&&q.ts<=t+1000);
const outcome=(q,exit,s)=>!exit?'unknown':q.price===exit.price?'ties':side(exit.price-q.price)===s?'wins':'losses';
const median=xs=>xs.length?[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)]:null;
function score(rows,entries,durationMs){
 const r={signals:entries.length,wins:0,losses:0,ties:0,unknown:0,maxLossStreak:0,medianExtraWaitMs:null,entries:[]};
 let streak=0;const waits=[];
 for(let i=0;i<entries.length;i++){
  const s=entries[i],exit=endQuote(rows,s.entryAt+durationMs),result=outcome({price:s.entryPrice},exit,s.side);
  r[result]++;streak=result==='losses'?streak+1:0;r.maxLossStreak=Math.max(streak,r.maxLossStreak);
  if(i)waits.push(s.entryAt-entries[i-1].entryAt-durationMs);
  const path=Object.fromEntries([5000,10000,20000,30000,60000].filter(h=>h<=durationMs).map(h=>{
   const observed=endQuote(rows,s.entryAt+h);return [h/1000,{price:observed?.price??null,outcome:outcome({price:s.entryPrice},observed,s.side)}];
  }));
  r.entries.push({at:s.entryAt,side:s.side,reason:s.modelReason,entry:s.entryPrice,exit:exit?.price??null,outcome:result,path,
   predictedPrice:s.predictedPrice??null});
 }
 r.medianExtraWaitMs=median(waits);r.rate=r.wins+r.losses?100*r.wins/(r.wins+r.losses):null;
 r.earlyFavourableThenLost=r.entries.filter(e=>e.outcome==='losses'&&e.path[5]?.outcome==='wins').length;
 r.earlyAdverseThenWon=r.entries.filter(e=>e.outcome==='wins'&&e.path[5]?.outcome==='losses').length;
 const forecasted=r.entries.filter(e=>e.predictedPrice!==null&&e.exit!==null);
 r.priceForecast=forecasted.length?{samples:forecasted.length,
  modelMeanAbsoluteError:forecasted.reduce((s,e)=>s+Math.abs(e.predictedPrice-e.exit),0)/forecasted.length,
  unchangedPriceMeanAbsoluteError:forecasted.reduce((s,e)=>s+Math.abs(e.entry-e.exit),0)/forecasted.length}:null;
 return r;
}

export function horizonStudy(rows,durationMs){
 const states={},entries=Object.fromEntries(policies.map(p=>[p,[]]));
 const audit={ticks:rows.length,learnerReady:0,learnerAdmitted:0,conflictingObjectives:0,
  admittedConflicts:0,usedByPublished:0,conflictSamples:[],publishedEntryConflicts:0};
 const timings=Object.fromEntries(policies.map(p=>[p,[]]));
 for(let i=0;i<rows.length;i++){
  const input=inputFor(rows.slice(0,i+1),durationMs),learning=inspectLearning(input);
  const evidence=learning.diagnostic?expiryEvidence(learning.diagnostic.selected):null;
  if(learning.ready)audit.learnerReady++;
  if(evidence&&!evidence.agreement)audit.conflictingObjectives++;
  const admitted=learning.ready&&learning.strength>=.4;
  if(admitted){
   audit.learnerAdmitted++;if(durationMs===30000)audit.usedByPublished++;
   if(!evidence.agreement){audit.admittedConflicts++;
    if(audit.conflictSamples.length<5)audit.conflictSamples.push({at:input.now,side:learning.side,strength:learning.strength,evidence});}
  }
  for(const policy of policies){
   const start=performance.now(),choice=candidate(input,policy);
   timings[policy].push(performance.now()-start);
   const next=advanceNowOpportunity({previous:states[policy],candidate:choice,
    now:input.now,quoteAt:input.quoteAt,asset:'SAME-VIDEO',engineId:'automatic',durationMs});
   if(next.phase==='fired'&&next.entryTriggeredAt!==states[policy]?.entryTriggeredAt){
    entries[policy].push({...next,modelReason:choice.reason,predictedPrice:choice.predictedPrice});
    if(policy==='published'&&durationMs===30000&&admitted&&!evidence.agreement)audit.publishedEntryConflicts++;
   }
   states[policy]=next;
  }
 }
 const results=Object.fromEntries(policies.map(p=>[p,score(rows,entries[p],durationMs)]));
 const matched={};
 for(const policy of policies){
  const r={wins:0,losses:0,ties:0,unknown:0,abstained:0,decisions:[]};
  for(const s of results.published.entries){
   const input=inputFor(rows.filter(q=>q.ts<=s.at),durationMs),choice=candidate(input,policy),exit=endQuote(rows,s.at+durationMs);
   const result=choice.ready?outcome({price:input.price},exit,choice.side):'abstained';r[result]++;
   r.decisions.push({at:s.at,side:choice.side,outcome:result});
  }
  r.rate=r.wins+r.losses?100*r.wins/(r.wins+r.losses):null;matched[policy]=r;
 }
 const computationMs=Object.fromEntries(Object.entries(timings).map(([p,values])=>{
  values.sort((a,b)=>a-b);return [p,{p50:median(values),p95:values[Math.floor(values.length*.95)],max:values.at(-1)}];
 }));
 return {durationMs,audit,results,matched,computationMs};
}

export function dynamicsPhaseSensitivity(rows,durationMs){
 const predictions=rows.map((q,i)=>({q,choice:horizonPriceDynamics(inputFor(rows.slice(0,i+1),durationMs))}));
 const first=predictions.find(p=>p.choice.ready)?.q.ts;if(!first)return [];
 // Diagnostic cohorts ONLY: don't select the best phase or add this scheduling
 // to the product. Cohorts overlap each other and must never be pooled.
 return Array.from({length:durationMs/5000},(_,i)=>i*5000).map(offsetMs=>{
  let due=first+offsetMs;const entries=[];
  for(const {q,choice}of predictions)if(q.ts>=due&&choice.ready){
   entries.push({entryAt:q.ts,entryPrice:q.price,side:choice.side,modelReason:choice.reason,predictedPrice:choice.predictedPrice});
   due=q.ts+durationMs;
  }
  const {entries:ignored,...result}=score(rows,entries,durationMs);return {offsetMs,...result};
 });
}

export function study(){
 const files=['sentinel-user-video-20261016.json','sentinel-user-video-broker-6dp-20261016.json'];
 return {sourceSha256,scope:'Same user video; retrospective exploratory analysis, not independent performance validation.',
  hypotheses:policies,fixtures:Object.fromEntries(files.map(file=>{
   const f=JSON.parse(readFileSync(new URL('../tests/fixtures/'+file,import.meta.url)));
   return [file,{quotes:f.quoteHistory.length,thirtySeconds:horizonStudy(f.quoteHistory,30000),sixtySeconds:horizonStudy(f.quoteHistory,60000),
    dynamicsPhaseSensitivity:{thirtySeconds:dynamicsPhaseSensitivity(f.quoteHistory,30000),sixtySeconds:dynamicsPhaseSensitivity(f.quoteHistory,60000)}}];
  }))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(study(),null,2));
