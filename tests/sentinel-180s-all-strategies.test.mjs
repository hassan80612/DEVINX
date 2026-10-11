import test from 'node:test';
import assert from 'node:assert/strict';
import {SCENARIO_ENGINES} from '../sentinel-trading-lab/agent/src/core/scenario-engine-catalog.mjs';
import {singleEngineForecast as forecast67} from '../sentinel-trading-lab/agent/src/core/research-baseline-13467/vnext-single-engine.mjs';
import {singleEngineForecast as forecast70} from '../sentinel-trading-lab/agent/src/core/vnext-single-engine.mjs';
import {historicalFuturePath,conditionalPathWindow} from '../sentinel-trading-lab/agent/src/core/forward-path-research.mjs';
import {marketRegimeEvidence} from '../sentinel-trading-lab/agent/src/core/market-regime-evidence.mjs';
import {FORWARD_HORIZONS} from '../sentinel-trading-lab/agent/src/core/forward-horizon-matrix.mjs';
const TYPES=['trend','range','cycle','reversal','false-break','breakout','volatility','random'];
const EPOCH=1800000000000;
function make(seed,type,n=3300){
 let state=seed>>>0,p=Math.log(1.1),d=0,origin=p;
 const rand=()=>((state=(1664525*state+1013904223)>>>0)+1)/4294967297;
 const quotes=[];
 for(let t=0;t<n;t++){
  const u=rand(),v=rand(),w=rand(),z=Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
  let m=z*.000012;
  if(type==='trend')m+=(t%1430<850?.0000036:-.0000045)+.28*d;
  if(type==='range')m+=-.085*(p-origin)-.4*d;
  if(type==='cycle'){
   const per=68+seed%40, f=i=>.00054*Math.sin(i*2*Math.PI/per+.3*seed)+.00014*Math.sin(i*2*Math.PI/(per*.52));
   m+=f(t)-f(t-1);
  }
  if(type==='reversal')m+=(Math.floor(t/164)%2?-.000006:.000006)+.16*d;
  if(type==='false-break')m+=((t%210)<21?.000013:(t%210)<53?-.000012:0)-.035*(p-origin);
  if(type==='breakout')m+=((t%390)<70?.00000015:(t%390)<150?.000007:0)+.12*d;
  if(type==='volatility'){const phase=t%700;
   m+=z*(phase>250&&phase<510?.000023:.000002)+(w<.022?(v<.5?-1:1)*.00010:0)-.29*d-.025*(p-origin);
  }
  d=m;p+=m;quotes.push({ts:EPOCH+t*1000,price:Math.exp(p)});
 }
 return quotes;
}
function stat(){return {signals:0,wins:0,byType:Object.fromEntries(TYPES.map(x=>[x,{signals:0,wins:0}]))}}
function add(z,side,truth,type){if(!['CALL','PUT'].includes(side))return;z.signals++;z.byType[type].signals++;if(side===truth){z.wins++;z.byType[type].wins++}}
const rate=(w,n)=>n?Number((100*w/n).toFixed(2)):null;
function summarize(z,n){return {signals:z.signals,wins:z.wins,accuracy:rate(z.wins,z.signals),coverage:rate(z.signals,n),
 byType:Object.fromEntries(Object.entries(z.byType).map(([k,v])=>[k,{signals:v.signals,accuracy:rate(v.wins,v.signals)}]))}}
test('180s dedicated verification for ALL 9 independent Sentinel engines, with unseen market trajectories',()=>{
 const ids=SCENARIO_ENGINES.map(x=>x.id),results={};
 for(const id of ids)results[id]={v67:stat(),v70:stat(),pathAgreement:stat(),directionalPath:stat(),trendGuard:stat()};
 let total=0,pathReady=0,regimes={},misses={};
 for(const type of TYPES)for(const seed of [7811,8093,9269]){
  const prices=make(seed,type);
  for(const i of [1200,1800,2500]){
   total++;
   const snap={quoteHistory:prices.slice(Math.max(0,i-2400),i+1),
    quoteTs:prices[i].ts,provider:'iq_option'};
   const now=prices[i].ts;
   const truth=prices[i+180].price>prices[i].price?'CALL':
      prices[i+180].price<prices[i].price?'PUT':'DRAW';
   const longer=prices.slice(Math.max(0,i-6800),i+1);
   const path=historicalFuturePath({quoteHistory:longer,asOf:now,horizonSeconds:180,requestedOffsets:[0,180]});
   const outcome=conditionalPathWindow(path,0,180);
   if(path.ready)pathReady++;
   const regime=marketRegimeEvidence({quoteHistory:longer,asOf:now});
   regimes[regime.phase]=(regimes[regime.phase]||0)+1;
   if(!path.ready)misses[path.status]=(misses[path.status]||0)+1;
   for(const id of ids){
    const settings={asset:'EUR/USD OTC',engine:id,orderDurationMs:180000};
    const a=forecast67({settings,snap,now,provider:'iq_option'}).receipt?.side||null;
    const b=forecast70({settings,snap,now,provider:'iq_option'}).receipt?.side||null;
    const z=results[id];
    add(z.v67,a,truth,type);add(z.v70,b,truth,type);
    add(z.directionalPath,outcome.side,truth,type);
    // Compare a reproducible candidate using no future price information:
    // require 70 forecast + historical path to agree.
    const agreement=b&&b===outcome.side?b:null;
    add(z.pathAgreement,agreement,truth,type);
    // Directional constraint can only withhold a prediction, not forge one.
    const guard=regime.trendSide&&b!==regime.trendSide?null:
      (regime.volatilityShock&&path.ready&&outcome.referenceSide!==b)?null:b;
    add(z.trendGuard,guard,truth,type);
   }
  }
 }
 const output={warnings:['SYNTHETIC market paths, not real IQ Option/Xnova accuracy',
  'Overlapping issue times and reused seeds across engines: correlated observations'],
  horizonSeconds:180,independentEngines:ids.length,totalScenarios:total,
  pathReady,regimes,missingPathReasons:misses,
  results:Object.fromEntries(ids.map(id=>[id,Object.fromEntries(Object.entries(results[id]).map(([k,v])=>[k,summarize(v,total)]))]))};
 console.log('SENTINEL_180S_FORECAST_BENCHMARK='+JSON.stringify(output));
 assert.equal(ids.length,9);
 assert.equal(total,8*3*3);
 assert.ok(output.results.automatic.v70.signals>0);
 assert.ok(FORWARD_HORIZONS.includes(180),'180s must always be in the global horizon matrix');
});
