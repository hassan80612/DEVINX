import test from 'node:test';
import assert from 'node:assert/strict';
import {pairedEntryResearch,RESEARCH_PAIRS} from '../sentinel-trading-lab/agent/src/core/paired-entry-research.mjs';
import {singleEngineForecast as forecast67} from '../sentinel-trading-lab/agent/src/core/research-baseline-13467/vnext-single-engine.mjs';
import {singleEngineForecast as forecast70} from '../sentinel-trading-lab/agent/src/core/vnext-single-engine.mjs';
const types=['trend','range','cycle','reversal','false-break','breakout','volatility','random'];
const EPOCH=1800000000000;
function simulated(seed,regime,n=2900){
 let randomSeed=seed>>>0,p=Math.log(1.1),d=0,rangeOrigin=Math.log(1.1);
 const rand=()=>((randomSeed=(1664525*randomSeed+1013904223)>>>0)+1)/4294967297;
 const quotes=[];
 for(let t=0;t<n;t++){
  const u=rand(),v=rand(),w=rand(),z=Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
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
  d=move;p+=move;quotes.push({ts:EPOCH+t*1000,price:Math.exp(p)})
 }
 return quotes;
}
function stat(){return{signals:0,wins:0,opportunities:0,byRegime:Object.fromEntries(types.map(x=>[x,{signals:0,wins:0,opportunities:0}]))}}
function add(statistic,side,truth,regime){
 statistic.opportunities++;statistic.byRegime[regime].opportunities++;
 if(side==='CALL'||side==='PUT'){
  statistic.signals++;statistic.byRegime[regime].signals++;
  if(side===truth){statistic.wins++;statistic.byRegime[regime].wins++}
 }
}
function reduce(statistic){
 const r={signals:statistic.signals,wins:statistic.wins,opportunities:statistic.opportunities,
 accuracy:statistic.signals?Number((100*statistic.wins/statistic.signals).toFixed(2)):null,
 coverage:statistic.opportunities?Number((100*statistic.signals/statistic.opportunities).toFixed(2)):null,
 byRegime:{}};
 for(const [key,x] of Object.entries(statistic.byRegime)){
  r.byRegime[key]={accuracy:x.signals?Number((100*x.wins/x.signals).toFixed(2)):null,
   signals:x.signals,coverage:x.opportunities?Number((100*x.signals/x.opportunities).toFixed(2)):null}
 }
 return r
}
test('real archived Sentinel 67/70 forecasts vs independent pairs: novel synthetic seeds, exact entry-to-expiry outcomes',()=>{
 const version67=Object.fromEntries(RESEARCH_PAIRS.map(p=>[p.id,stat()]));
 const version70=Object.fromEntries(RESEARCH_PAIRS.map(p=>[p.id,stat()]));
 const combined=Object.fromEntries(RESEARCH_PAIRS.map(p=>[p.id,stat()]));
 const extrema={peaks:{count:0,hitWithin10s:0,absoluteErrorSeconds:0},
  troughs:{count:0,hitWithin10s:0,absoluteErrorSeconds:0}};
 let examined=0,exceptions=0,pathAvailable=0;
 for(const kind of types)for(const seed of [6101,8707]){
  const q=simulated(seed,kind);
  for(const i of [1400,2250]){
   const now=q[i].ts,hist=q.slice(Math.max(0,i-2300),i+1);
   assert.equal(hist.at(-1).ts,now);
   const snap={quoteHistory:hist,quoteTs:now,price:q[i].price,provider:'iq_option'};
   for(const lead of [15,60])for(const holding of [30,60]){
    const truth=q[i+lead+holding].price>q[i+lead].price?'CALL':
     q[i+lead+holding].price<q[i+lead].price?'PUT':'DRAW';
    let firstPath=true;
    for(const pair of RESEARCH_PAIRS){
     const settings={engine:pair.first.engine,asset:'EUR/USD OTC',orderDurationMs:holding*1000};
     const infer=predict=>{
      const entry=predict({settings:{...settings,orderDurationMs:lead*1000},snap,now}).receipt;
      const exit=predict({settings:{...settings,orderDurationMs:(lead+holding)*1000},snap,now}).receipt;
      if(!entry||!exit||!(entry.projectedPrice>0)||!(exit.projectedPrice>0))return null;
      return exit.projectedPrice>entry.projectedPrice?'CALL':
       exit.projectedPrice<entry.projectedPrice?'PUT':null;
     };
     const first67=infer(forecast67),first70=infer(forecast70);
     add(version67[pair.id],first67,truth,kind);
     add(version70[pair.id],first70,truth,kind);
     const model=pairedEntryResearch({settings,snap,now,mode:'fixed',pairId:pair.id,
      leadSeconds:lead,holdingSeconds:holding});
     assert.equal(model.actionable,false);
     assert.equal(model.calibrated,false);
     assert.equal(model.alternatives[0].entryAt,now+lead*1000);
     assert.equal(model.alternatives[0].exitAt,now+(lead+holding)*1000);
     add(combined[pair.id],model.selected?.side,truth,kind);
     examined++;
     if(model.status==='research-unavailable')exceptions++;
     if(firstPath&&model.extremeTimes){
      pathAvailable++;
      const until=i+lead+holding;
      const section=q.slice(i,until+1),peak=Math.max(...section.map(x=>x.price)),
       trough=Math.min(...section.map(x=>x.price));
      const actualPeak=section.findIndex(x=>x.price===peak),actualLow=section.findIndex(x=>x.price===trough);
      const peakDifference=Math.abs(actualPeak-model.extremeTimes.peak.estimateSeconds),
       lowDifference=Math.abs(actualLow-model.extremeTimes.trough.estimateSeconds);
      extrema.peaks.count++;extrema.peaks.absoluteErrorSeconds+=peakDifference;
      if(peakDifference<=10)extrema.peaks.hitWithin10s++;
      extrema.troughs.count++;extrema.troughs.absoluteErrorSeconds+=lowDifference;
      if(lowDifference<=10)extrema.troughs.hitWithin10s++;
     }
     firstPath=false;
    }
   }
  }
 }
 const output={
  warning:'REPLAY OF REAL 13.4.67/13.4.70 FORECAST CODE ON ARTIFICIAL PRICE PATHS, NOT LIVE BROKER TRADING',
  novelSeeds:[6101,8707],regimes:types,
  combinations:Object.fromEntries(RESEARCH_PAIRS.map(p=>[p.id,reduce(combined[p.id])])),
  baselines67FirstStrategySameExpiry:Object.fromEntries(RESEARCH_PAIRS.map(p=>[p.id,reduce(version67[p.id])])),
  baselines70FirstStrategySameExpiry:Object.fromEntries(RESEARCH_PAIRS.map(p=>[p.id,reduce(version70[p.id])])),
  extrema:Object.fromEntries(Object.entries(extrema).map(([k,v])=>[k,{
   count:v.count,within10sPct:v.count?Number((100*v.hitWithin10s/v.count).toFixed(2)):null,
   maeSeconds:v.count?Number((v.absoluteErrorSeconds/v.count).toFixed(2)):null}])),
  evaluatedPairSnapshots:examined,pathAvailableSnapshots:pathAvailable,
  exceptions,approvedForLiveUse:false
 };
 console.log('SENTINEL_V1374_SAME_MARKET_WALKFORWARD='+JSON.stringify(output));
 assert.equal(output.evaluatedPairSnapshots,8*2*2*2*2*RESEARCH_PAIRS.length);
 assert.equal(exceptions,0);
 assert.equal(output.approvedForLiveUse,false);
});
