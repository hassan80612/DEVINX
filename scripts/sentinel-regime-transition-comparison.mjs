import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {adaptiveDirectTrajectory} from '../sentinel-trading-lab/agent/src/core/adaptive-direct-trajectory.mjs';
import {regimeTransitionForecasts} from '../sentinel-trading-lab/agent/src/core/adaptive-regime-transition-research.mjs';

const START=1800000000000,HORIZONS=[5,10,30,60,120,300];
const MODELS=['global','similar','transition','adaptiveChoice'];
const SEEDS=[710027,710041,710053,710069,710083,710101,710119,710137];
const KINDS=['trend','range','cycle','reversal','false_breakout','breakout','volatility','random','regime_switch','exhaustion'];
export function generate(seed,kind,len=5400){
 let state=seed>>>0,price=Math.log(1.1),last=0,origin=price,age=0,phase=0,nextSwitch=0,regime=0;
 const u=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)+1)/4294967297;
 const samples=[];
 for(let i=0;i<len;i++){
  const x=u(),y=u(),z=u(),g=Math.sqrt(-2*Math.log(x))*Math.cos(2*Math.PI*y);
  let move=g*.000011;
  if(kind==='trend')move+=(i%1400<850?.000006:-.000005)+.24*last;
  if(kind==='range')move+=-.09*(price-origin)-.25*last;
  if(kind==='cycle'){
   const period=72+seed%53;
   const wave=t=>.0007*Math.sin(2*Math.PI*t/period+seed*.2)+.00019*Math.sin(2*Math.PI*t/(period*.43));
   move+=wave(i)-wave(i-1);
  }
  if(kind==='reversal')move+=(Math.floor(i/175)%2?.000006:-.000006)+.13*last;
  if(kind==='false_breakout')move+=(i%240<24?.000014:i%240<70?-.000013:0)-.04*(price-origin);
  if(kind==='breakout')move+=(i%415<85?.0000003:i%415<178?.000007:0)+.13*last;
  if(kind==='volatility')move+=g*((i%680>240&&i%680<490)?.000023:.000002)+(z<.022?(y<.5?-.00008:.00008):0)-.28*last-.015*(price-origin);
  if(kind==='random')move+=g*.000005;
  if(kind==='regime_switch'){
   if(i>=nextSwitch){regime=Math.floor(u()*4);nextSwitch=i+120+Math.floor(u()*600);origin=price;age=0;phase=u()*Math.PI*2;}
   if(regime===0)move+=.000007+.25*last;
   if(regime===1)move+=-.000007+.25*last;
   if(regime===2){const w=t=>.0005*Math.sin(t*.065+phase);move+=w(age)-w(age-1);}
   if(regime===3)move+=-.035*(price-origin)-.3*last+g*.000012;
   age++;
  }
  if(kind==='exhaustion'){
   const period=350+seed%101,t=i%period,sign=Math.floor(i/period)%2?1:-1;
   move+=sign*(t<180?.000010*(1-t/230):t<280?-.000008:0)+.15*last;
  }
  price+=move;last=move;samples.push({ts:START+i*1000,price:Math.exp(price)});
 }
 return samples;
}
const side=(a,b)=>b>a?'CALL':b<a?'PUT':'DRAW';
const bucket=()=>({opportunities:0,draws:0,baseSignals:0,newSignals:0,baseWins:0,newWins:0,
 paired:0,basePairedWins:0,newPairedWins:0,rescued:0,harmed:0,
 reversals:0,baseReversalWins:0,newReversalWins:0,
 topWithin10s:0,baseTopWithin10s:0,bottomWithin10s:0,baseBottomWithin10s:0,
 baseTopTimeError:0,newTopTimeError:0,baseBottomTimeError:0,newBottomTimeError:0,
 baseTopPriceErrorBps:0,newTopPriceErrorBps:0,baseBottomPriceErrorBps:0,newBottomPriceErrorBps:0});
const pct=(n,d)=>d?Number((100*n/d).toFixed(2)):null;
const summary=s=>({...s,baselineAccuracyPct:pct(s.baseWins,s.baseSignals),
 candidateAccuracyPct:pct(s.newWins,s.newSignals),coveragePct:pct(s.newSignals,s.opportunities),
 pairedBaselinePct:pct(s.basePairedWins,s.paired),pairedCandidatePct:pct(s.newPairedWins,s.paired),
 baselineNonDrawAccuracyPct:pct(s.baseWins,s.baseSignals-s.draws),
 candidateNonDrawAccuracyPct:pct(s.newWins,s.newSignals-s.draws),
 baselineReversalPct:pct(s.baseReversalWins,s.reversals),candidateReversalPct:pct(s.newReversalWins,s.reversals),
 baselineTopWithin10sPct:pct(s.baseTopWithin10s,s.paired),candidateTopWithin10sPct:pct(s.topWithin10s,s.paired),
 baselineBottomWithin10sPct:pct(s.baseBottomWithin10s,s.paired),candidateBottomWithin10sPct:pct(s.bottomWithin10s,s.paired),
 meanBaselineTopTimeErrorSeconds:s.baseTopTimeError/s.paired,meanCandidateTopTimeErrorSeconds:s.newTopTimeError/s.paired,
 meanBaselineBottomTimeErrorSeconds:s.baseBottomTimeError/s.paired,meanCandidateBottomTimeErrorSeconds:s.newBottomTimeError/s.paired,
 meanBaselineTopPriceErrorBps:s.baseTopPriceErrorBps/s.paired,meanCandidateTopPriceErrorBps:s.newTopPriceErrorBps/s.paired,
 meanBaselineBottomPriceErrorBps:s.baseBottomPriceErrorBps/s.paired,meanCandidateBottomPriceErrorBps:s.newBottomPriceErrorBps/s.paired});
const extreme=items=>({top:items.reduce((a,b)=>b.price>a.price?b:a),bottom:items.reduce((a,b)=>b.price<a.price?b:a)});
function score(s,base,newer,truth,reversal,actual,h){
 s.opportunities++;s.draws+=truth==='DRAW';
 const bs=['CALL','PUT'].includes(base.side),ns=['CALL','PUT'].includes(newer.side);
 if(bs){s.baseSignals++;s.baseWins+=base.side===truth;}
 if(ns){s.newSignals++;s.newWins+=newer.side===truth;}
 if(reversal){s.reversals++;s.baseReversalWins+=base.side===truth;s.newReversalWins+=newer.side===truth;}
 if(!bs||!ns)return;
 s.paired++;s.basePairedWins+=base.side===truth;s.newPairedWins+=newer.side===truth;
 s.rescued+=base.side!==truth&&newer.side===truth;s.harmed+=base.side===truth&&newer.side!==truth;
 const b=extreme(base.expectedPath.filter(p=>p.secondsFromNow>=h)),n=extreme(newer.expectedPath.filter(p=>p.secondsFromNow>=h));
 for(const [tag,p] of [['base',b],['new',n]]){
  const te=Math.abs(p.top.secondsFromNow-actual.top.secondsFromNow),be=Math.abs(p.bottom.secondsFromNow-actual.bottom.secondsFromNow);
  s[tag==='base'?'baseTopWithin10s':'topWithin10s']+=te<=10;s[tag==='base'?'baseBottomWithin10s':'bottomWithin10s']+=be<=10;
  s[tag+'TopTimeError']+=te;s[tag+'BottomTimeError']+=be;
  s[tag+'TopPriceErrorBps']+=Math.abs(Math.log(p.top.price/actual.top.price))*10000;
  s[tag+'BottomPriceErrorBps']+=Math.abs(Math.log(p.bottom.price/actual.bottom.price))*10000;
 }
}
function clusteredInterval(blocks){
 const keys=Object.keys(blocks);if(keys.length<4)return null;
 let state=919021;const draw=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
 const estimates=[];
 for(let i=0;i<4000;i++){let delta=0,n=0;for(let k=0;k<keys.length;k++){
  const b=blocks[keys[Math.floor(draw()*keys.length)]];delta+=b.newWins-b.baseWins;n+=b.opportunities;
 }estimates.push(100*delta/n);}
 estimates.sort((a,b)=>a-b);return {lower:estimates[100],upper:estimates[3899],
  meaning:'95% descriptive bootstrap across source files; horizons within an issue are correlated',clusters:keys.length};
}
const directory=process.argv[2],output=process.argv[3],mode=directory==='synthetic'?'synthetic':'external';
const totals=Object.fromEntries(MODELS.map(m=>[m,bucket()]));
const byH={},bySource={},byDetectedContext={},bySyntheticKind={},rowsReport=[],choices={};
function evaluate(rows,i,source,kind=null){
 const history=rows.slice(Math.max(0,i-3599),i+1),now=rows[i].ts;
 for(const h of HORIZONS){
  const options={quoteHistory:history,asOf:now,entryDelaySeconds:h,holdingSeconds:h};
  const base=adaptiveDirectTrajectory(options),experiment=regimeTransitionForecasts(options);
  assert.equal(base.status,'adaptive-direct-trajectory');assert.equal(experiment.status,'regime-transition-research');
  const actual=extreme(rows.slice(i+h,i+2*h+1).map(q=>({price:q.price,secondsFromNow:(q.ts-now)/1000})));
  const truth=side(rows[i+h].price,rows[i+2*h].price),prior=side(rows[i-30].price,rows[i].price);
  const turn=truth!=='DRAW'&&prior!=='DRAW'&&truth!==prior;
  choices[experiment.selectedMode]=(choices[experiment.selectedMode]||0)+1;
  const record={source,issueAt:now,horizon:h,truth,base:base.side,context:experiment.detectedContext,selectedMode:experiment.selectedMode};
  for(const model of MODELS){
   const candidate=experiment.predictions[model];
   assert.equal(candidate.entryAt,base.entryAt);assert.equal(candidate.exitAt,base.exitAt);
   assert.ok(candidate.latestTrainingOutcomeAt<=now);
   if(candidate.validation.examples)assert.ok(candidate.tuningTrainLatestOutcomeAt<candidate.tuningValidationFirstIssueAt);
   if(model==='global'){
    assert.equal(candidate.side,base.side);assert.equal(candidate.expectedPairedLogReturn,base.expectedPairedLogReturn);
    assert.deepEqual(candidate.expectedPath,base.expectedPath);
   }
   record[model]=candidate.side;
   byH[h]??={};bySource[source]??={};byDetectedContext[experiment.detectedContext]??={};
   const groups=[totals,byH[h],bySource[source],byDetectedContext[experiment.detectedContext]];
   if(kind){bySyntheticKind[kind]??={};groups.push(bySyntheticKind[kind]);}
   for(const group of groups){group[model]??=bucket();score(group[model],base,candidate,truth,turn,actual,h);}
  }
  rowsReport.push(record);
 }
}
const sources=[];
if(mode==='synthetic'){
 for(const kind of KINDS)for(const seed of SEEDS){
  const rows=generate(seed,kind);sources.push({source:kind+':'+seed,kind,seed});
  for(const i of [1850,3300,4700])evaluate(rows,i,kind+':'+seed,kind);
 }
}else{
 if(!directory)throw Error('Provide CSV directory or synthetic');
 for(const file of fs.readdirSync(directory).filter(x=>x.endsWith('.csv')).sort()){
  const content=fs.readFileSync(path.join(directory,file),'utf8').trim().split(/\r?\n/);
  const rows=content.map(line=>{const f=line.split(','),t=Number(f[0]);return {ts:(t>1e15?t/1000:t)+1000,price:Number(f[4])};});
  assert.ok(rows.length>=80000);assert.ok(rows.every((q,i)=>q.price>0&&Number.isFinite(q.ts)&&(!i||q.ts-rows[i-1].ts===1000)));
  sources.push({file,quotes:rows.length,firstCloseAt:rows[0].ts,lastCloseAt:rows.at(-1).ts});
  for(let i=3600;i+600<rows.length;i+=1800)evaluate(rows,i,file);
 }
}
const groupSummary=group=>Object.fromEntries(Object.entries(group).map(([k,v])=>[k,Object.fromEntries(Object.entries(v).map(([m,b])=>[m,summary(b)]))]));
const report={source:mode==='synthetic'?'1440 synthetic cases; NOT real broker accuracy':'Archived real Binance spot 1s closes; NOT IQ Option/Exnova',
 baselineVersion:'13.4.67.2',baselineCommit:'66c42ff6da4e7af7268a933b9ff83ddfe0b9be90',baselineModel:'adaptive-direct-trajectory-v1',
 hypothesesFrozen:true,modelVersion:'regime-transition-research-v1',historyPoints:3600,issueSpacingSeconds:mode==='external'?1800:null,
 target:'T+H entry to T+2H expiry; same prices and issue times',
 drawPolicy:'unchanged price is reported and never counted as a win',
 quoteAvailability:'1s bar close timestamp = archive bar open + 1000ms',productionChanged:false,brokerExecutionWinRate:false,
 oracleSyntheticKindUsedForPrediction:false,extremaToleranceSeconds:10,selectedModes:choices,sources,
 totals:Object.fromEntries(Object.entries(totals).map(([m,b])=>[m,summary(b)])),
 improvementInterval:Object.fromEntries(MODELS.map(m=>[m,clusteredInterval(Object.fromEntries(Object.entries(bySource).map(([k,v])=>[k,v[m]])))])),
 byHorizon:groupSummary(byH),bySource:groupSummary(bySource),byDetectedContext:groupSummary(byDetectedContext),bySyntheticKind:groupSummary(bySyntheticKind)};
console.log('SENTINEL_REGIME_TRANSITION_RESULT='+JSON.stringify(report));
if(output){fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');fs.writeFileSync(output.replace(/\.json$/,'.rows.jsonl'),rowsReport.map(x=>JSON.stringify(x)).join('\n')+'\n');}
