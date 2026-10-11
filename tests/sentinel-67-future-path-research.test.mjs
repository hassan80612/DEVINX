import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {singleEngineForecast} from '../sentinel-trading-lab/agent/src/core/vnext-single-engine.mjs';
import {trajectoryResearch67} from '../sentinel-trading-lab/agent/src/core/offline-trajectory-research-67.mjs';
const START=1800000000000;
const SEEDS=[12013,13579,14621,15767,19001];
const MODES=['trend','range','cycle','reversal','false_breakout','breakout','volatility','random'];
const HORIZONS=[30,60,180],INDICES=[1500,2600];
const result=()=>({n:0,oldSignal:0,newSignal:0,oldWins:0,newWins:0,
 oldErr:0,newErr:0,changed:0,eligible:0,earlyTurns:0,turnOldWins:0,turnNewWins:0,
 regimeBreakdown:{}});
function generate(seed,kind,len=3000){
 let state=seed>>>0,price=Math.log(1.1),last=0,origin=price;
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
  price+=move;last=move;
  samples.push({ts:START+i*1000,price:Math.exp(price)});
 }
 return samples;
}
function side(p,q){return q>p?'CALL':q<p?'PUT':'DRAW'}
function measure(out,baseline,candidate,history,actual,regime){
 const current=history.at(-1)?.price,prior=history.at(-21)?.price;
 const old=baseline?.receipt?.side,newSide=candidate?.side;
 const turning=prior>0&&side(prior,current)!==side(current,actual)&&
  side(prior,current)!=='DRAW'&&side(current,actual)!=='DRAW';
 out.n++;
 const rs=out.regimeBreakdown[regime]||{n:0,old:0,latest:0,changed:0,eligible:0};
 rs.n++;out.regimeBreakdown[regime]=rs;
 if(turning)out.earlyTurns++;
 if(candidate.status==='swing-trajectory'){out.eligible++;rs.eligible++}
 if(old&&old!=='NEUTRAL'){
  out.oldSignal++;
  if(old===side(current,actual)){out.oldWins++;rs.old++;if(turning)out.turnOldWins++}
  const prediction=Number(baseline.receipt.projectedPrice);
  out.oldErr+=Math.abs(Math.log(prediction/actual))*10000;
 }
 if(newSide&&newSide!=='NEUTRAL'&&candidate.projectedPrice>0){
  out.newSignal++;
  if(newSide===side(current,actual)){out.newWins++;rs.latest++;if(turning)out.turnNewWins++}
  out.newErr+=Math.abs(Math.log(candidate.projectedPrice/actual))*10000;
 }
 if(old!==newSide){out.changed++;rs.changed++}
}
function summary(r){
 const pct=(a,b)=>b?Number((100*a/b).toFixed(2)):null;
 const mae=(x,n)=>n?Number((x/n).toFixed(5)):null;
 return {n:r.n,baseline:{signals:r.oldSignal,accuracyPct:pct(r.oldWins,r.oldSignal),priceMaeBps:mae(r.oldErr,r.oldSignal)},
  candidate:{signals:r.newSignal,accuracyPct:pct(r.newWins,r.newSignal),priceMaeBps:mae(r.newErr,r.newSignal)},
  futureReversals:{n:r.earlyTurns,oldAccuracyPct:pct(r.turnOldWins,r.earlyTurns),
    newAccuracyPct:pct(r.turnNewWins,r.earlyTurns)},
  changedSignals:r.changed,trajectoryEligible:r.eligible,
  byRegime:Object.fromEntries(Object.entries(r.regimeBreakdown).map(([name,a])=>[name,{n:a.n,
   oldWins:a.old,newWins:a.latest,changed:a.changed,trajectoryEligible:a.eligible}]))};
}
function predict(history,h,now){
 const snap={quoteHistory:history,quoteTs:now,price:history.at(-1).price,provider:'iq_option'};
 const baseline=singleEngineForecast({settings:{engine:'automatic',asset:'EUR/USD OTC',orderDurationMs:h*1000},
  snap,now,provider:snap.provider});
 const candidate=trajectoryResearch67({quoteHistory:history,asOf:now,selectedSeconds:h,baseline});
 return {baseline,candidate};
}
test('research variant keeps genuine time-of-issuance causality and does not modify 67 core',()=>{
 const list=generate(12013,'cycle').slice(0,2600),h=60,now=list.at(-1).ts;
 const {baseline,candidate}=predict(list,h,now);
 const leak=trajectoryResearch67({quoteHistory:[...list,{ts:now+1000,price:1e9},{ts:now+60000,price:1e-9}],
  asOf:now,selectedSeconds:h,baseline});
 assert.deepEqual(candidate,leak);
 assert.equal(candidate.actionable,false);
 assert.equal(candidate.calibrated,false);
 if(candidate.status==='swing-trajectory'){
  assert.ok(candidate.expectedPath.length>1);
  assert.equal(candidate.expectedPath.at(-1).secondsFromNow,h);
  assert.ok(candidate.cycle?.periodSeconds>0);
 }else assert.equal(candidate.status,'fallback-67');
});
test('fixed-seed forward walk-through: old 67 and swing-path research on identical unseen synthetic scenarios',()=>{
 const totals=Object.fromEntries(HORIZONS.map(h=>[h,result()]));
 const t0=Date.now();
 for(const kind of MODES)for(const seed of SEEDS){
  const all=generate(seed,kind);
  for(const index of INDICES){
   const history=all.slice(Math.max(0,index-2400),index+1),now=all[index].ts;
   for(const h of HORIZONS){
    const {baseline,candidate}=predict(history,h,now);
    measure(totals[h],baseline,candidate,history,all[index+h].price,kind);
    if(baseline.receipt){
     assert.equal(baseline.receipt.targetAt,now+h*1000);
     assert.equal(baseline.receipt.issuedAt,now);
    }
   }
  }
 }
 const byHorizon=Object.fromEntries(Object.entries(totals).map(([h,r])=>[h,summary(r)]));
 const combined=result();
 // Aggregate counters without leaking one horizon into another.
 for(const r of Object.values(totals)){
  for(const name of ['n','oldSignal','newSignal','oldWins','newWins','oldErr','newErr','changed',
  'eligible','earlyTurns','turnOldWins','turnNewWins'])combined[name]+=r[name];
  for(const [kind,x] of Object.entries(r.regimeBreakdown)){
   const y=combined.regimeBreakdown[kind]||{n:0,old:0,latest:0,changed:0,eligible:0};
   for(const k of ['n','old','latest','changed','eligible'])y[k]+=x[k];
   combined.regimeBreakdown[kind]=y;
  }
 }
 const report={source:'synthetic deterministic paths; NOT IQ Option live data, not broker win rate',
  fixedSeeds:SEEDS,regimes:MODES,horizons:HORIZONS,chronologicalHoldout:true,
  baselineCommit:'5c20afbef3060d00a5caa52cf0498aebff6b20c9',
  scenarios:combined.n,elapsedMs:Date.now()-t0,
  overall:summary(combined),byHorizon};
 console.log('SENTINEL_67_PATH_RESEARCH_BENCHMARK='+JSON.stringify(report));
 assert.equal(report.scenarios,MODES.length*SEEDS.length*INDICES.length*HORIZONS.length);
});
test('archived quote fixture replay; disclose small sample and unknown broker provenance',()=>{
 const data=JSON.parse(fs.readFileSync(new URL('fixtures/sentinel-continuation-prices.json',import.meta.url),'utf8'));
 const rows=data.quoteHistory;
 assert.ok(rows.length>130);
 const r=result();
 for(const h of [30,60])for(let i=95;i<rows.length-h;i+=10){
  const history=rows.slice(0,i+1),now=history.at(-1).ts;
  const actual=rows.find(x=>x.ts>=now+h*1000)?.price;
  if(!actual)continue;
  const {baseline,candidate}=predict(history,h,now);
  measure(r,baseline,candidate,history,actual,'archived-quote-fixture');
 }
 console.log('SENTINEL_67_PATH_FIXTURE='+JSON.stringify({provenance:'archived project fixture, broker origin unverified',
  nonindependentOverlappingExamples:true,...summary(r)}));
 assert.ok(r.n>0,'fixture must produce a measurable comparison');
});
