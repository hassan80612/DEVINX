import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {singleEngineForecast} from '../sentinel-trading-lab/agent/src/core/vnext-single-engine.mjs';
import {branchingFutureForecast67} from '../sentinel-trading-lab/agent/src/core/offline-branching-future-path-67.mjs';
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

const SEED_GROUPS={initial:SEEDS,holdout:[44021,47801,55777,60607,71237]};
const variants=['baseline67','trajectoryHybrid','standaloneBranches'];
const directions=(a,b)=>a<b?'CALL':a>b?'PUT':'DRAW';
const stats=()=>({n:0,positive:0,correct:0,errorBps:0,flips:0,turns:0,turnCorrect:0,used:0,distribution:{}});
const aggregate=arr=>Object.fromEntries(variants.map(k=>[k,stats()]));
function scenario(history,h){
 const now=history.at(-1).ts,snap={quoteHistory:history,quoteTs:now,price:history.at(-1).price,provider:'iq_option'};
 const baseline=singleEngineForecast({settings:{engine:'automatic',asset:'EUR/USD OTC',orderDurationMs:h*1000},snap,now,provider:snap.provider});
 const hybrid=branchingFutureForecast67({quoteHistory:history,asOf:now,selectedSeconds:h,baseline,mode:'hybrid'});
 const standalone=branchingFutureForecast67({quoteHistory:history,asOf:now,selectedSeconds:h,baseline,mode:'standalone'});
 return {baseline67:baseline.receipt?baseline.receipt:{},trajectoryHybrid:hybrid,standaloneBranches:standalone};
}
function score(bucket,candidate,old,current,actual,turn){
 bucket.n++;const cls=String(candidate.side||'');
 const changed=cls!==old?.side;
 if(changed)bucket.flips++;
 const altered=String(candidate.status||'')==='conditional-branch-estimate';
 if(altered)bucket.used++;
 if(turn)bucket.turns++;
 if(!['CALL','PUT'].includes(cls)||!(Number(candidate.projectedPrice)>0))return;
 bucket.positive++;
 if(cls===directions(current,actual)){bucket.correct++;if(turn)bucket.turnCorrect++}
 bucket.errorBps+=Math.abs(Math.log(Number(candidate.projectedPrice)/actual))*10000;
 if(candidate.branching?.expectedBranch){
  const branch=candidate.branching.expectedBranch;
  bucket.distribution[branch]=(bucket.distribution[branch]||0)+1;
 }
}
function normalize(x){
 const pct=(a,b)=>b?Number((a/b*100).toFixed(2)):null;
 return {n:x.n,emitted:x.positive,coveragePct:pct(x.positive,x.n),
  accuracyPct:pct(x.correct,x.positive),priceMaeBps:x.positive?Number((x.errorBps/x.positive).toFixed(5)):null,
  totalReversals:x.turns,reversalAccuracyPct:pct(x.turnCorrect,x.turns),
  changedVersus67:x.flips,modelApplied:x.used,branchDistribution:x.distribution};
}
test('standalone trajectory branches use only historical quotes, resolved before prediction, not future ticks',()=>{
 const rows=generate(12133,'cycle').slice(0,2600),now=rows.at(-1).ts,base=scenario(rows,60);
 for(const mode of ['hybrid','standalone']){
  const original=branchingFutureForecast67({quoteHistory:rows,asOf:now,selectedSeconds:60,
   baseline:{receipt:base.baseline67},mode});
  const polluted=branchingFutureForecast67({quoteHistory:[...rows,{ts:now+1000,price:1e9},
   {ts:now+60000,price:1e-9}],asOf:now,selectedSeconds:60,
   baseline:{receipt:base.baseline67},mode});
  assert.deepEqual(original,polluted);
  assert.equal(original.actionable,false);
  assert.equal(original.calibrated,false);
  assert.equal(original.branching?.usedOnlyQuotesUntil??now,now);
  if(original.expectedPath.length)assert.equal(original.expectedPath.at(-1).secondsFromNow,60);
 }
});
test('same-time issue and expiration: base 67, hybrid and no-9-engine standalone over initial and unseen market regimes',()=>{
 const outcome={};let count=0;
 for(const [group,seeds] of Object.entries(SEED_GROUPS)){
  const byH=Object.fromEntries(HORIZONS.map(h=>[h,aggregate()]));
  const byKind=Object.fromEntries(MODES.map(m=>[m,aggregate()]));
  for(const kind of MODES)for(const seed of seeds){
   const prices=generate(seed,kind);
   for(const i of INDICES){
    const history=prices.slice(Math.max(0,i-2400),i+1);
    const current=prices[i].price;
    const before=prices[i-20].price;
    for(const horizon of HORIZONS){
     const actual=prices[i+horizon].price;
     const isTurn=directions(before,current)!==directions(current,actual)&&
       directions(before,current)!=='DRAW'&&directions(current,actual)!=='DRAW';
     const forecast=scenario(history,horizon);
     const baseline=forecast.baseline67;
     assert.equal(baseline.issuedAt,prices[i].ts);
     assert.equal(baseline.targetAt,prices[i].ts+horizon*1000);
     for(const kindOf of variants){
      score(byH[horizon][kindOf],forecast[kindOf],baseline,current,actual,isTurn);
      score(byKind[kind][kindOf],forecast[kindOf],baseline,current,actual,isTurn);
     }
     count++;
    }
   }
  }
  outcome[group]={
   byHorizon:Object.fromEntries(Object.entries(byH).map(([h,vars])=>[h,Object.fromEntries(Object.entries(vars).map(([k,v])=>[k,normalize(v)]))])),
   byRegime:Object.fromEntries(Object.entries(byKind).map(([name,vars])=>[name,
    Object.fromEntries(Object.entries(vars).map(([k,v])=>[k,normalize(v)]))]))
  };
 }
 console.log('SENTINEL_67_BRANCHING_COMPARISON='+JSON.stringify({source:'deterministic synthetic paths, not actual broker quotes',
   groups:Object.fromEntries(Object.entries(SEED_GROUPS).map(([k,v])=>[k,v])),
   observedScenarios:count,baselineCommit:'5c20afbef3060d00a5caa52cf0498aebff6b20c9',outcome}));
 assert.equal(count,480);
});
test('archived quote fixture is too short for a trained branching path, so candidate must abstain to 67',()=>{
 const q=JSON.parse(fs.readFileSync(new URL('./fixtures/sentinel-continuation-prices.json',import.meta.url),'utf8')).quoteHistory;
 const h=30,history=q.slice(0,130);const a=scenario(history,h);
 assert.equal(a.trajectoryHybrid.projectedPrice,a.baseline67.projectedPrice);
 assert.equal(a.standaloneBranches.projectedPrice,a.baseline67.projectedPrice);
 console.log('SENTINEL_67_BRANCHING_REAL_FIXTURE='+JSON.stringify({quotes:q.length,usableFullMinutePaths:0,
  note:'Not enough quote history for independently sampled 30s trajectory branches; real broker provenance not established'}));
});

test('precommitted horizon gate tested on third unseen synthetic seed batch, no fitting on it',()=>{
 // Config selected from FIRST seed batch only: standalone branches at 30s/180s,
 // original 67 at 60s. This is a stress test, not live-broker validation.
 const finalSeeds=[83011,83123,84503,86101,88493,90149,91907,94841,97073,101903,
  104239,107021,110023,113791,117019,120011,124001,127013,131041,135007];
 const report=Object.fromEntries(HORIZONS.map(h=>[h,{
  baseline:stats(),standalone:stats(),precommittedGate:stats(),
  reversalDetected:0,reversalHits:0,falseReversal:0,missedReversal:0
 }]));
 for(const kind of MODES)for(const seed of finalSeeds){
  const prices=generate(seed,kind);
  for(const i of INDICES){
   const history=prices.slice(Math.max(0,i-2400),i+1);
   const current=prices[i].price,before=prices[i-20].price;
   for(const h of HORIZONS){
    const actual=prices[i+h].price,forecast=scenario(history,h),base=forecast.baseline67;
    const turn=directions(before,current)!==directions(current,actual)&&
      directions(before,current)!=='DRAW'&&directions(current,actual)!=='DRAW';
    const p=report[h];
    score(p.baseline,base,base,current,actual,turn);
    score(p.standalone,forecast.standaloneBranches,base,current,actual,turn);
    score(p.precommittedGate,h===60?base:forecast.standaloneBranches,base,current,actual,turn);
    const branch=forecast.standaloneBranches.branching?.expectedBranch;
    const predicted=branch==='reversal';
    if(predicted)p.reversalDetected++;
    if(predicted&&turn)p.reversalHits++;
    if(predicted&&!turn)p.falseReversal++;
    if(!predicted&&turn)p.missedReversal++;
   }
  }
 }
 console.log('SENTINEL_67_FINAL_UNSEEN='+JSON.stringify({
  provenance:'precommitted synthetic stress set, NOT real IQ Option / Xnova',
  nSeeds:finalSeeds.length,
  horizonGate:'30s standalone, 60s original 67, 180s standalone',
  selectedBeforeThisTest:true,
  report:Object.fromEntries(Object.entries(report).map(([h,x])=>[h,{
   baseline:normalize(x.baseline),standalone:normalize(x.standalone),
   precommittedGate:normalize(x.precommittedGate),
   branchDetection:{predicted:x.reversalDetected,correct:x.reversalHits,
     falsePositives:x.falseReversal,missed:x.missedReversal}
  }]))
 }));
 assert.equal(Object.values(report).reduce((n,x)=>n+x.baseline.n,0),960);
});
