import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {adaptiveDirectTrajectory} from '../sentinel-trading-lab/agent/src/core/adaptive-direct-trajectory.mjs';
import {jointScenarioForecasts} from '../sentinel-trading-lab/agent/src/core/joint-scenario-research.mjs';
import {generate} from './sentinel-joint-synthetic-streams.mjs';
const HORIZONS=[5,10,30,60,120,300],MODELS=['conditionalMean','representativePath'];
const ALL_SEEDS=[1040027,1040041,1040059,1040073,1040089,1040107,1040123,1040141];
const SHARD=process.argv[4]===undefined?null:Number(process.argv[4]);
const SEEDS=SHARD===null?ALL_SEEDS:ALL_SEEDS.filter((_,i)=>i%2===SHARD);
const KINDS=['trend','range','cycle','reversal','false_breakout','breakout','volatility','random','regime_switch','exhaustion'];
const side=(a,b)=>b>a?'CALL':b<a?'PUT':'DRAW';
const allowed=s=>['CALL','PUT'].includes(s);
const bucket=()=>({n:0,draws:0,baseSignals:0,newSignals:0,baseNonDrawSignals:0,newNonDrawSignals:0,baseWins:0,newWins:0,
 paired:0,basePairedWins:0,newPairedWins:0,rescued:0,harmed:0,reversalCases:0,baseReversalWins:0,newReversalWins:0,
 reversalEvaluationCases:0,actualReversals:0,baseReversalTP:0,baseReversalFP:0,baseReversalFN:0,newReversalTP:0,newReversalFP:0,newReversalFN:0,
 extremaCases:0,baseTopWithin10s:0,newTopWithin10s:0,baseBottomWithin10s:0,newBottomWithin10s:0,
 baseTopTimeError:0,newTopTimeError:0,baseBottomTimeError:0,newBottomTimeError:0,
 baseTopPriceErrorBps:0,newTopPriceErrorBps:0,baseBottomPriceErrorBps:0,newBottomPriceErrorBps:0,
 directionPriceDisagreement:0,invertedExtremaPrices:0,reversalDirectionDisagreement:0});
const pct=(n,d)=>d?Number((100*n/d).toFixed(2)):null;
const summary=b=>({...b,baselineAccuracyPct:pct(b.baseWins,b.baseSignals),candidateAccuracyPct:pct(b.newWins,b.newSignals),
 baselineNonDrawAccuracyPct:pct(b.baseWins,b.baseNonDrawSignals),candidateNonDrawAccuracyPct:pct(b.newWins,b.newNonDrawSignals),
 coveragePct:pct(b.newSignals,b.n),pairedBaselinePct:pct(b.basePairedWins,b.paired),pairedCandidatePct:pct(b.newPairedWins,b.paired),
 baselineDirectionOnReversalPct:pct(b.baseReversalWins,b.reversalCases),candidateDirectionOnReversalPct:pct(b.newReversalWins,b.reversalCases),
 baselineReversalPrecisionPct:pct(b.baseReversalTP,b.baseReversalTP+b.baseReversalFP),candidateReversalPrecisionPct:pct(b.newReversalTP,b.newReversalTP+b.newReversalFP),
 baselineReversalRecallPct:pct(b.baseReversalTP,b.actualReversals),candidateReversalRecallPct:pct(b.newReversalTP,b.actualReversals),
 baselineTopWithin10sPct:pct(b.baseTopWithin10s,b.extremaCases),candidateTopWithin10sPct:pct(b.newTopWithin10s,b.extremaCases),
 baselineBottomWithin10sPct:pct(b.baseBottomWithin10s,b.extremaCases),candidateBottomWithin10sPct:pct(b.newBottomWithin10s,b.extremaCases),
 meanBaselineTopTimeErrorSeconds:b.baseTopTimeError/b.extremaCases,meanCandidateTopTimeErrorSeconds:b.newTopTimeError/b.extremaCases,
 meanBaselineBottomTimeErrorSeconds:b.baseBottomTimeError/b.extremaCases,meanCandidateBottomTimeErrorSeconds:b.newBottomTimeError/b.extremaCases,
 meanBaselineTopPriceErrorBps:b.baseTopPriceErrorBps/b.extremaCases,meanCandidateTopPriceErrorBps:b.newTopPriceErrorBps/b.extremaCases,
 meanBaselineBottomPriceErrorBps:b.baseBottomPriceErrorBps/b.extremaCases,meanCandidateBottomPriceErrorBps:b.newBottomPriceErrorBps/b.extremaCases,
 directionPriceDisagreementPct:pct(b.directionPriceDisagreement,b.newSignals),reversalDirectionDisagreementPct:pct(b.reversalDirectionDisagreement,b.newSignals)});
const extrema=items=>({top:items.reduce((a,b)=>b.price>a.price?b:a),bottom:items.reduce((a,b)=>b.price<a.price?b:a)});
function score(b,baseline,candidate,truth,prior,actual,h){
 b.n++;b.draws+=truth==='DRAW';const bs=allowed(baseline.side),cs=allowed(candidate.side);
 if(bs){b.baseSignals++;b.baseNonDrawSignals+=truth!=='DRAW';b.baseWins+=baseline.side===truth;}
 if(cs){b.newSignals++;b.newNonDrawSignals+=truth!=='DRAW';b.newWins+=candidate.side===truth;}
 if(bs&&cs){b.paired++;b.basePairedWins+=baseline.side===truth;b.newPairedWins+=candidate.side===truth;
  b.rescued+=baseline.side!==truth&&candidate.side===truth;b.harmed+=baseline.side===truth&&candidate.side!==truth;}
 if(prior!=='DRAW'&&truth!=='DRAW'){
  const reversed=truth!==prior;b.reversalEvaluationCases++;b.actualReversals+=reversed;
  if(reversed){b.reversalCases++;b.baseReversalWins+=baseline.side===truth;b.newReversalWins+=candidate.side===truth;}
  const oldWarn=bs&&baseline.side!==prior,newWarn=candidate.events.reversal.predicted===true;
  b.baseReversalTP+=oldWarn&&reversed;b.baseReversalFP+=oldWarn&&!reversed;b.baseReversalFN+=!oldWarn&&reversed;
  b.newReversalTP+=newWarn&&reversed;b.newReversalFP+=newWarn&&!reversed;b.newReversalFN+=!newWarn&&reversed;
  b.reversalDirectionDisagreement+=cs&&candidate.events.reversal.predicted!==null&&candidate.events.reversal.predicted!==(candidate.side!==prior);
 }
 b.directionPriceDisagreement+=cs&&side(candidate.projectedEntryPrice,candidate.projectedExitPrice)!==candidate.side;
 b.invertedExtremaPrices+=candidate.events.top.price<candidate.events.bottom.price;
 if(h<30)return;
 b.extremaCases++;const old=extrema(baseline.expectedPath.filter(p=>p.secondsFromNow>=h)),newer=candidate.events;
 for(const [name,events] of [['base',old],['new',newer]]){
  const te=Math.abs(events.top.secondsFromNow-actual.top.secondsFromNow),be=Math.abs(events.bottom.secondsFromNow-actual.bottom.secondsFromNow);
  b[name+'TopWithin10s']+=te<=10;b[name+'BottomWithin10s']+=be<=10;
  b[name+'TopTimeError']+=te;b[name+'BottomTimeError']+=be;
  b[name+'TopPriceErrorBps']+=Math.abs(Math.log(events.top.price/actual.top.price))*10000;
  b[name+'BottomPriceErrorBps']+=Math.abs(Math.log(events.bottom.price/actual.bottom.price))*10000;
 }
}
function bootstrap(group,model){
 const keys=Object.keys(group);let state=921047;const draws=[];
 for(let i=0;i<4000;i++){let n=0,delta=0;for(let j=0;j<keys.length;j++){
  state=(Math.imul(state,1664525)+1013904223)>>>0;
  const b=group[keys[Math.floor(state/4294967296*keys.length)]][model];n+=b.n;delta+=b.newWins-b.baseWins;
 }draws.push(100*delta/n);}
 draws.sort((a,b)=>a-b);return {lower:draws[100],upper:draws[3899],clusters:keys.length,
  meaning:'95% descriptive clustered bootstrap; not adjusted for testing multiple hypotheses'};
}
const directory=process.argv[2],output=process.argv[3],mode=directory==='synthetic'?'synthetic':'external';
const totals=Object.fromEntries(MODELS.map(m=>[m,bucket()])),byHorizon={},bySource={},byKind={},decisions=[],sources=[];
function evaluate(rows,i,source,kind=null){
 const history=rows.slice(Math.max(0,i-3599),i+1),now=rows[i].ts;
 for(const h of HORIZONS){
  const options={quoteHistory:history,asOf:now,entryDelaySeconds:h,holdingSeconds:h};
  const base=adaptiveDirectTrajectory(options),newer=jointScenarioForecasts(options);
  assert.equal(base.status,'adaptive-direct-trajectory');assert.equal(newer.status,'joint-scenario-research');
  const truth=side(rows[i+h].price,rows[i+2*h].price),prior=side(rows[i-30].price,rows[i].price);
  const actual=extrema(rows.slice(i+h,i+2*h+1).map(q=>({price:q.price,secondsFromNow:(q.ts-now)/1000})));
  byHorizon[h]??={};bySource[source]??={};if(kind)byKind[kind]??={};
  const record={source,issueAt:now,horizon:h,truth,prior,base:base.side};
  for(const m of MODELS){
   const c=newer.models[m];
   const path=c.expectedPath.slice(h);
   assert.equal(c.events.top.price,Math.max(...path.map(p=>p.price)));
   assert.equal(c.events.bottom.price,Math.min(...path.map(p=>p.price)));
   assert.equal(c.projectedEntryPrice,path[0].price);
   assert.equal(c.projectedExitPrice,path.at(-1).price);
   assert.equal(c.side,side(c.projectedEntryPrice,c.projectedExitPrice));
   assert.equal(c.entryAt,base.entryAt);assert.equal(c.exitAt,base.exitAt);assert.ok(c.latestTrainingOutcomeAt<=now);
   if(c.validation.examples)assert.ok(c.tuningTrainLatestOutcomeAt<c.tuningValidationFirstIssueAt);
   record[m]={side:c.side,rawCallProbability:c.rawCallProbability,priceDisagreement:c.directionPriceDisagreement,
    predictedTop:c.events.top,predictedBottom:c.events.bottom,reversal:c.events.reversal.predicted};
   for(const group of [totals,byHorizon[h],bySource[source],...(kind?[byKind[kind]]:[])]){
    group[m]??=bucket();score(group[m],base,c,truth,prior,actual,h);
   }
  }
  decisions.push(record);
 }
}
if(mode==='synthetic'){
 for(const kind of KINDS)for(const seed of SEEDS){const rows=generate(seed,kind,5400);sources.push({kind,seed});
  for(const i of [1850,3300,4700])evaluate(rows,i,kind+':'+seed,kind);}
}else{
 if(!directory)throw Error('Provide CSV directory or synthetic');
 for(const file of fs.readdirSync(directory).filter(f=>f.endsWith('.csv')).sort()){
  const rows=fs.readFileSync(path.join(directory,file),'utf8').trim().split(/\r?\n/).map(l=>{const f=l.split(','),t=Number(f[0]);return {ts:(t>1e15?t/1000:t)+1000,price:Number(f[4])};});
  assert.ok(rows.length>=80000);assert.ok(rows.every((q,i)=>q.price>0&&Number.isFinite(q.ts)&&(!i||q.ts-rows[i-1].ts===1000)));
  sources.push({file,quotes:rows.length,firstCloseAt:rows[0].ts,lastCloseAt:rows.at(-1).ts});
  for(let i=3600;i+600<rows.length;i+=1800)evaluate(rows,i,file);
 }
}
const groups=g=>Object.fromEntries(Object.entries(g).map(([key,value])=>[key,Object.fromEntries(Object.entries(value).map(([m,b])=>[m,summary(b)]))]));
const report={source:mode==='synthetic'?'Independent new synthetic cases; NOT broker accuracy':'New archived real Binance spot 1s closes; NOT IQ Option/Exnova',
 baselineVersion:'13.4.67.2',baselineCommit:'66c42ff6da4e7af7268a933b9ff83ddfe0b9be90',candidateModel:'joint-scenario-research-v1',
 hypothesesFrozen:true,productionChanged:false,brokerExecutionWinRate:false,historyPoints:3600,
 target:'one conditional future path supplies direction T+H to T+2H and all extremes in the holding interval',
 directionPriceConsistencyChecked:true,allEventsAndPricesComeFromSamePath:true,forecastNotSuppressedToInflateAccuracy:true,
 drawPolicy:'draws are never wins; alternate denominator counts only non-draw cases with a forecast',
 extremeTimingToleranceSeconds:10,extremeScoringOnlyHorizonsAtLeastSeconds:30,
 availability:'archive close observable at bar-open timestamp + 1000ms',
 sourceIssueSpacingSeconds:mode==='external'?1800:null,sources,
 totals:Object.fromEntries(Object.entries(totals).map(([m,b])=>[m,summary(b)])),
 improvementInterval:Object.fromEntries(MODELS.map(m=>[m,bootstrap(bySource,m)])),
 byHorizon:groups(byHorizon),bySource:groups(bySource),bySyntheticKind:groups(byKind)};
console.log('SENTINEL_JOINT_SCENARIO_RESULT='+JSON.stringify(report));
if(output){fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');fs.writeFileSync(output.replace(/\.json$/,'.rows.jsonl'),decisions.map(x=>JSON.stringify(x)).join('\n')+'\n');}
