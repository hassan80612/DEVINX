import test from 'node:test';
import assert from 'node:assert/strict';
import {SCENARIO_ENGINES} from '../sentinel-trading-lab/agent/src/core/scenario-engine-catalog.mjs';
import {futureEntrySchedule as original} from '../sentinel-trading-lab/agent/src/core/research-baseline-13467/future-entry-schedule.mjs';
import {futureEntrySchedule as released70} from '../sentinel-trading-lab/agent/src/core/research-baseline-13470/future-entry-schedule.mjs';
import {futureEntrySchedule as upgraded} from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';

const EPOCH=1800000000000,HS=[5,10,30,60,120,300],
TYPES=['trend','range','cycle','reversal','false-break','breakout','volatility','random'];
function sample(seed,regime,length=3100){
 let randomSeed=seed>>>0,p=Math.log(1.1),d=0,spike=0,rangeOrigin=Math.log(1.1);
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
   const f=i=>.00054*Math.sin(i*2*Math.PI/per+.3*seed)+
    .00014*Math.sin(i*2*Math.PI/(per*.52));
   move+=f(t)-f(t-1);
  }
  if(regime==='reversal')move+=(Math.floor(t/164)%2?-.000006:.000006)+.16*d;
  if(regime==='false-break')move+=((t%210)<21?.000013:(t%210)<53?-.000012:0)-.035*(p-rangeOrigin);
  if(regime==='breakout')move+=((t%390)<70?.00000015:(t%390)<150?.000007:0)+.12*d;
  if(regime==='volatility'){
   const phase=t%700;
   move+=z*(phase>250&&phase<510?.000023:.000002)+
    (w<.022?(v<.5?-1:1)*.00010:0)-.29*d-.025*(p-rangeOrigin);
  }
  // random has zero predictable structure in expectation.
  d=move;p+=move;
  out.push({ts:EPOCH+t*1000,price:Math.exp(p)});
 }
 return out;
}
function metrics(arr){
 const both=arr.filter(r=>r.oldSide&&r.newSide&&r.trialSide);
 const n=both.length,base=both.filter(r=>r.oldWin).length,
 released=both.filter(r=>r.newWin).length,trial=both.filter(r=>r.trialWin).length;
 return {attempted:arr.length, compared:n, wins67:base,wins70:released,wins72:trial,
  pct67:n?Number((base/n*100).toFixed(2)):null,
  pct70:n?Number((released/n*100).toFixed(2)):null,
  pct72:n?Number((trial/n*100).toFixed(2)):null,
  delta72Vs70:trial-released, delta72Vs67:trial-base,
  rescued70:both.filter(r=>!r.newWin&&r.trialWin).length,
  harmed70:both.filter(r=>r.newWin&&!r.trialWin).length,
  changed70:both.filter(r=>r.newSide!==r.trialSide).length,
  coverage67:arr.filter(r=>r.oldSide).length,
  coverage70:arr.filter(r=>r.newSide).length,
  coverage72:arr.filter(r=>r.trialSide).length};
}
export function evaluate(seeds=[41,731]){
 const all=[];
 for(const kind of TYPES)for(const seed of seeds){
  const prices=sample(seed,kind);
  // No future information is sent to either model; each snapshot ends
  // exactly at issuedAt. Evaluate the SAME [T+H,T+2H] true quotes.
  for(const i of [850,1260,1740,2290]){
   const now=EPOCH+i*1000;
   const quoteHistory=prices.slice(Math.max(0,i-1950),i+1);
   const snap={quoteHistory,quoteTs:now,provider:'iq_option'};
   for(const engine of SCENARIO_ENGINES)for(const h of HS){
    const settings={engine:engine.id,asset:'EUR/USD OTC',orderDurationMs:h*1000};
    const a=original({settings,snap,now,delays:[h]})[0];
    const b=released70({settings,snap,now,delays:[h]})[0];
    const c=upgraded({settings,snap,now,delays:[h]})[0];
    assert.equal(a.issuedAt,b.issuedAt);
    assert.equal(a.entryAt,b.entryAt);
    assert.equal(a.exitAt,b.exitAt);
    assert.equal(a.engineId,b.engineId);
    assert.equal(b.entryAt,c.entryAt);
    assert.equal(b.exitAt,c.exitAt);
    const trueReturn=prices[i+2*h].price-prices[i+h].price;
    const trueSide=trueReturn>0?'CALL':trueReturn<0?'PUT':'DRAW';
    all.push({kind,seed,h,engine:engine.id,
     oldSide:a.side,newSide:b.side,trialSide:c.side,
     oldWin:a.side===trueSide,newWin:b.side===trueSide,trialWin:c.side===trueSide});
   }
  }
 }
 return {
  scope:'synthetic deterministic chronological, shared price paths across motors; NOT live OTC or independent trading win rate',
  overall:metrics(all),
  byEngine:Object.fromEntries(SCENARIO_ENGINES.map(e=>[e.id,metrics(all.filter(x=>x.engine===e.id))])),
  byRegime:Object.fromEntries(TYPES.map(type=>[type,metrics(all.filter(x=>x.kind===type))])),
  byH:Object.fromEntries(HS.map(h=>[h,metrics(all.filter(x=>x.h===h))])),
  byEngineAndRegime:Object.fromEntries(SCENARIO_ENGINES.map(e=>
   [e.id,Object.fromEntries(TYPES.map(k=>[k,metrics(all.filter(x=>x.engine===e.id&&x.kind===k))]))]))
 };
}
test('UNPUBLISHED candidate 13.4.72 vs frozen 13.4.67 and frozen 13.4.70: original and unseen synthetic seeds',()=>{
 const fit=evaluate([41,731]);
 const hold=evaluate([211,1049]);
 const acceptance={
  independentRealBrokerData:false,
  eligibleForProduction:false,
  inSampleBeatsBoth:fit.overall.delta72Vs70>0&&fit.overall.delta72Vs67>0,
  unseenSeedsBeatBoth:hold.overall.delta72Vs70>0&&hold.overall.delta72Vs67>0
 };
 console.log('SENTINEL_1372_NINE_ENGINE_BENCHMARK='+JSON.stringify({acceptance,fit,hold}));
 assert.equal(fit.overall.compared,3456);
 assert.equal(hold.overall.compared,3456);
 for(const engine of SCENARIO_ENGINES){
  assert.equal(fit.byEngine[engine.id].compared,384);
  assert.equal(hold.byEngine[engine.id].compared,384);
 }
});
