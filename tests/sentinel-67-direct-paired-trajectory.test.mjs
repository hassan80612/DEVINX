import test from 'node:test';
import assert from 'node:assert/strict';
import {futureEntrySchedule} from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';
import {pairedTrajectoryForecast67} from '../sentinel-trading-lab/agent/src/core/offline-paired-trajectory-67.mjs';
const START=1800000000000;
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


const side=(entry,exit)=>exit>entry?'CALL':exit<entry?'PUT':'DRAW';
function predictions(history,delay,hold=delay){
 const now=history.at(-1).ts;
 const baseline=futureEntrySchedule({settings:{engine:'automatic',asset:'RESEARCH'},
  snap:{quoteHistory:history,quoteTs:now,provider:'research'},now,delays:[delay]})[0];
 const candidate=pairedTrajectoryForecast67({quoteHistory:history,asOf:now,
  entryDelaySeconds:delay,holdingSeconds:hold});
 return {baseline,candidate};
}
test('paired target distinguishes price rising until entry then falling during holding',()=>{
 const issue=100,delay=30,hold=30;
 const prices=Array.from({length:161},(_,i)=>i<=130?100+i:230-(i-130)*.5);
 assert.equal(side(prices[issue],prices[issue+delay+hold]),'CALL');
 assert.equal(side(prices[issue+delay],prices[issue+delay+hold]),'PUT');
});
test('completed historical paired outcomes only; no later quote can alter receipt',()=>{
 const history=generate(250991,'cycle',4200).slice(0,3501);
 const now=history.at(-1).ts;
 const original=pairedTrajectoryForecast67({quoteHistory:history,asOf:now,
  entryDelaySeconds:30,holdingSeconds:60});
 assert.equal(original.status,'paired-trajectory-estimate');
 const polluted=pairedTrajectoryForecast67({quoteHistory:[...history,
  {ts:now+30000,price:1e15},{ts:now+90000,price:1e-15}],
  asOf:now,entryDelaySeconds:30,holdingSeconds:60});
 assert.deepEqual(polluted,original);
 assert.ok(original.latestTrainingOutcomeAt<=now);
 assert.equal(original.entryAt,now+30000);
 assert.equal(original.exitAt,now+90000);
 assert.equal(original.actionable,false);
 assert.equal(original.calibrated,false);
 assert.equal(original.measuredAccuracy,null);
 assert.ok(original.disjointNeighbors>=6);
 assert.equal(original.side,side(original.projectedEntryPrice,original.projectedExitPrice));
});
test('delay and holding are distinct, including odd-second entry targets',()=>{
 const history=generate(251003,'trend',4200).slice(0,3501),now=history.at(-1).ts;
 const r=pairedTrajectoryForecast67({quoteHistory:history,asOf:now,
  entryDelaySeconds:5,holdingSeconds:30});
 assert.equal(r.status,'paired-trajectory-estimate');
 assert.equal(r.sampledEntryOffsetSeconds,5);
 assert.equal(r.sampledExitOffsetSeconds,35);
 assert.equal(r.entryAt,now+5000);
 assert.equal(r.exitAt,now+35000);
});
test('no history gives no fake signal or measured success percentage',()=>{
 const r=pairedTrajectoryForecast67({quoteHistory:[],asOf:START});
 assert.equal(r.side,null);assert.equal(r.measuredAccuracy,null);
 assert.equal(r.actionable,false);
});
const stats=()=>({n:0,baseSignals:0,newSignals:0,baseWins:0,newWins:0,
 paired:0,basePairedWins:0,newPairedWins:0,rescued:0,harmed:0,draws:0,
 reversals:0,baseReversalWins:0,newReversalWins:0});
function score(s,base,newer,truth,isTurn){
 s.n++;if(truth==='DRAW')s.draws++;
 const b=['CALL','PUT'].includes(base),n=['CALL','PUT'].includes(newer);
 if(b){s.baseSignals++;if(base===truth)s.baseWins++}
 if(n){s.newSignals++;if(newer===truth)s.newWins++}
 if(b&&n){
  s.paired++;if(base===truth)s.basePairedWins++;
  if(newer===truth)s.newPairedWins++;
  if(base!==truth&&newer===truth)s.rescued++;
  if(base===truth&&newer!==truth)s.harmed++;
 }
 if(isTurn){s.reversals++;if(base===truth)s.baseReversalWins++;
  if(newer===truth)s.newReversalWins++}
}
function summarize(s){
 const pct=(a,b)=>b?Number((a*100/b).toFixed(2)):null;
 return {...s,baselineAccuracyPct:pct(s.baseWins,s.baseSignals),
  candidateAccuracyPct:pct(s.newWins,s.newSignals),
  candidateCoveragePct:pct(s.newSignals,s.n),
  pairedBaselinePct:pct(s.basePairedWins,s.paired),
  pairedCandidatePct:pct(s.newPairedWins,s.paired),
  baselineReversalPct:pct(s.baseReversalWins,s.reversals),
  candidateReversalPct:pct(s.newReversalWins,s.reversals)};
}
test('unchanged 67 versus direct future-entry trajectory, same issue/entry/expiry',()=>{
 const seeds=[250991,251003,251021,251057,251077,251101,251117,251143];
 const modes=['trend','range','cycle','reversal','false_breakout','breakout','volatility','random'];
 const horizons=[5,10,30,60,120,300],indices=[1800,3500];
 const byH=Object.fromEntries(horizons.map(h=>[h,stats()]));
 const byRegime=Object.fromEntries(modes.map(m=>[m,stats()]));
 const total=stats();
 for(const kind of modes)for(const seed of seeds){
  const rows=generate(seed,kind,4200);
  for(const i of indices){
   const history=rows.slice(Math.max(0,i-2400),i+1);
   for(const h of horizons){
    const {baseline,candidate}=predictions(history,h);
    const truth=side(rows[i+h].price,rows[i+2*h].price);
    const pastSide=side(rows[i-30].price,rows[i].price);
    const isTurn=truth!=='DRAW'&&pastSide!=='DRAW'&&truth!==pastSide;
    assert.equal(baseline.entryAt,rows[i].ts+h*1000);
    assert.equal(baseline.exitAt,rows[i].ts+2*h*1000);
    assert.equal(candidate.entryAt,baseline.entryAt);
    assert.equal(candidate.exitAt,baseline.exitAt);
    for(const s of [total,byH[h],byRegime[kind]])
     score(s,baseline.side,candidate.side,truth,isTurn);
   }
  }
 }
 const report={source:'NEW SYNTHETIC streams; not IQ Option/Xnova accuracy',
  target:'forecast at T: price(T+H) to price(T+2H)',
  baselineCommit:'5c20afbef3060d00a5caa52cf0498aebff6b20c9',
  engine:'automatic',allSignalsInformational:true,seedList:seeds,
  total:summarize(total),
  byHorizon:Object.fromEntries(Object.entries(byH).map(([k,v])=>[k,summarize(v)])),
  byRegime:Object.fromEntries(Object.entries(byRegime).map(([k,v])=>[k,summarize(v)]))};
 console.log('SENTINEL_DIRECT_PAIRED_TRAJECTORY='+JSON.stringify(report));
 assert.equal(total.n,768);
 // Rate deliberately NOT an assertion: failed efficacy must remain visible.
});
