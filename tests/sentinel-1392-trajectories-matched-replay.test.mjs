import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {causalForwardPath as baseline1390} from './fixtures/sentinel-1390-causal-baseline.mjs';
import {causalForwardPath as candidate} from '../sentinel-trading-lab/agent/src/core/causal-closed-structure-1379.mjs';
import {planEntryWindow} from '../sentinel-trading-lab/agent/src/core/entry-window-planner.mjs';
const sign=v=>v>0?'CALL':v<0?'PUT':null;
const priceAt=(quotes,target)=>quotes.find(x=>Number(x.ts)>=target&&Number(x.ts)-target<=2200)?.price||null;
function compareSeries(quotes,candles=[],seconds=30,strideSeconds=30){
 const sorted=[...quotes].sort((a,b)=>a.ts-b.ts);
 const start=sorted[0].ts+101000,stop=sorted.at(-1).ts-seconds*1000;
 const outcomes=[];
 for(let t=start;t<=stop;t+=strideSeconds*1000){
  const history=sorted.filter(q=>q.ts<=t);
  const last=history.at(-1),exitPrice=priceAt(sorted,t+seconds*1000);
  if(!last||!exitPrice)continue;
  const closed=candles.filter(c=>c.to*1000<=t);
  const versions=[['13.9.0',baseline1390],['candidate',candidate]];
  const realized=sign(Math.log(exitPrice/last.price));
  const rows=versions.map(([name,fit])=>{
   const result=fit({quoteHistory:history,candles:closed,asOf:last.ts,
     holdingSeconds:seconds,maxSeconds:seconds});
   const pred=result.status==='causal-forward-path'?result.priceAt(seconds):null;
   return {name,pred,status:result.status,side:pred?sign(Math.log(pred/last.price)):null,
     error:pred?Math.abs(Math.log(pred/exitPrice)):null,
     correct:pred?sign(Math.log(pred/last.price))===realized:null};
  });
  outcomes.push({t,realized,rows});
 }
 return outcomes;
}
function stats(rows,name){
 const a=rows.flatMap(r=>r.rows.filter(x=>x.name===name));
 const valid=a.filter(x=>x.correct!==null);
 return {count:valid.length,correct:valid.filter(x=>x.correct).length,
  meanAbsLogError:valid.length?valid.reduce((s,x)=>s+x.error,0)/valid.length:null,
  predicted:valid.filter(x=>x.side!==null).length};
}
function synthetic(kind,count=800){
 const T=1791500000000,series=[];let lp=Math.log(1.1);
 for(let i=0;i<count;i++){
  const base=kind==='up'?.000008:kind==='down'?-.000008:
   kind==='range'? .000013*Math.cos(i/8):
   kind==='reversal'?(i<590?.000008:-.00002):
   kind==='pullback'?(i<600?.000007:i<635?-.000008:.000007):
   kind==='fading-up'?(i<600?.000009:.000002):0;
  lp+=base+Math.sin(i*.91)*.00000035;
  series.push({ts:T+i*1000,receivedAt:T+i*1000,price:Math.exp(lp)});
 }
 return series;
}
test('13.9.2: trajectory stays causal and healthy completed trends still project forward',()=>{
 for(const kind of ['up','down','reversal','range','pullback','fading-up']){
  const q=synthetic(kind,690),now=q[630].ts,part=q.slice(0,631);
  const model=candidate({quoteHistory:part,asOf:now,holdingSeconds:30,maxSeconds:120});
  assert.equal(model.status,'causal-forward-path',kind);
  assert.equal(model.priceAt(0),Number(part.at(-1).price.toPrecision(12)),kind);
  assert.ok(model.priceAt(30)>0&&model.priceAt(120)>0,kind);
  if(['up','down'].includes(kind))
    assert.equal(sign(model.priceAt(120)-model.priceAt(60)),kind==='up'?'CALL':'PUT',kind);
  const futureSpoof=[...part,...q.slice(631).map(x=>({...x,receivedAt:x.ts}))];
  const refit=candidate({quoteHistory:futureSpoof,asOf:now,holdingSeconds:30,maxSeconds:120});
  assert.equal(refit.priceAt(120),model.priceAt(120),kind);
 }
});
test('13.9.2: unchanged entry planner has no candle streak score, wait or veto',()=>{
 const s=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/entry-window-planner.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(s,/lateEntryRisk|observedStreakRejection/);
 const forecast=()=>({side:'CALL',projectedEntryPrice:1.1,
  projectedExitPrice:1.1005,selectionStrength:1});
 const p=planEntryWindow({windowSeconds:30,evaluateLead:forecast});
 assert.equal(p.side,'CALL');
 assert.equal(p.entryOffsetSeconds,1);
});
test('same past quotes, objective holdout comparison, independent of video screenshots',()=>{
 const cases=['up','down','range','reversal','pullback','fading-up'];
 const result=cases.map(kind=>{
  const rows=compareSeries(synthetic(kind),[],30,30);
  return {kind,baseline:stats(rows,'13.9.0'),candidate:stats(rows,'candidate')};
 });
 console.log('[1392 synthetic matched holdout—not live accuracy] '+JSON.stringify(result));
 assert.ok(result.every(x=>x.candidate.count>=3),JSON.stringify(result));
});
test('existing recorded broker quotes: compare without claiming representative win rate',()=>{
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/sentinel-continuation-prices.json',import.meta.url)));
 const observations=compareSeries(fixture.quoteHistory,fixture.candles,30,15);
 const summary={quoteCount:fixture.quoteHistory.length,
  start:fixture.quoteHistory[0]?.ts,end:fixture.quoteHistory.at(-1)?.ts,
  observations:observations.length,
  baseline:stats(observations,'13.9.0'),candidate:stats(observations,'candidate'),
  insufficientForWinRateValidation:true};
 console.log('[1392 REAL quote sample, short/overlapping, insufficient for promotion] '+JSON.stringify(summary));
 assert.ok(fixture.quoteHistory.length>=150);
 assert.ok(observations.length>=2,JSON.stringify(summary));
 assert.equal(summary.insufficientForWinRateValidation,true);
});
