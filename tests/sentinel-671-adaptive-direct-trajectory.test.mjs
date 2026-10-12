import test from 'node:test';
import assert from 'node:assert/strict';
import {futureEntrySchedule} from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';
import {adaptiveDirectTrajectory} from '../sentinel-trading-lab/agent/src/core/adaptive-direct-trajectory.mjs';
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


const side=(a,b)=>b>a?'CALL':b<a?'PUT':'DRAW';
const compute=(history,lead,hold=lead)=>adaptiveDirectTrajectory({
 quoteHistory:history,asOf:history.at(-1).ts,entryDelaySeconds:lead,holdingSeconds:hold});
test('independent motor projects paired return and multiple future points, holding is independent',()=>{
 const rows=generate(310013,'cycle',3501),r=compute(rows,5,30),now=rows.at(-1).ts;
 assert.equal(r.status,'adaptive-direct-trajectory');
 assert.equal(r.entryAt,now+5000);assert.equal(r.exitAt,now+35000);
 assert.ok(r.expectedPath.some(p=>p.secondsFromNow===5));
 assert.ok(r.expectedPath.some(p=>p.secondsFromNow===35));
 assert.equal(r.side,side(r.projectedEntryPrice,r.projectedExitPrice));
 assert.ok(r.latestTrainingOutcomeAt<=now);
 assert.equal(r.actionable,false);assert.equal(r.calibrated,false);
 assert.equal(r.modelConfidence,null);
 assert.ok(r.validation.purgedTrainingOutcomes);
});
test('future and late-arriving historical quotes cannot contaminate the prediction',()=>{
 const rows=generate(310019,'reversal',3501),now=rows.at(-1).ts;
 const baseline=compute(rows,30);
 const polluted=adaptiveDirectTrajectory({quoteHistory:[...rows,
  {ts:now+1,price:1e15},{ts:now-700000,price:1e-15,receivedAt:now+5000}],
  asOf:now,entryDelaySeconds:30,holdingSeconds:30});
 assert.deepEqual(polluted,baseline);
});
test('same price path with repeated tick density keeps temporal features and forecast',()=>{
 const rows=generate(310033,'trend',2401),now=rows.at(-1).ts;
 const dense=rows.flatMap(q=>[0,250,500,750].map(offset=>({
  ts:q.ts+offset,price:q.price}))).filter(q=>q.ts<=now);
 const a=compute(rows,30),b=compute(dense,30);
 assert.deepEqual(a,b);
});
test('missing context and stale history do not invent a direction',()=>{
 assert.equal(adaptiveDirectTrajectory({quoteHistory:[],asOf:START}).side,null);
 const rows=generate(310051,'cycle',2401),now=rows.at(-1).ts;
 assert.equal(adaptiveDirectTrajectory({quoteHistory:rows,asOf:now+5000}).side,null);
});
test('online tuning always sees completed outcomes; later observations do not retroactively change receipt',()=>{
 const rows=generate(310061,'cycle',3501),issue=rows[3000].ts;
 const earlier=adaptiveDirectTrajectory({quoteHistory:rows.slice(0,3001),asOf:issue,
  entryDelaySeconds:30,holdingSeconds:60});
 const fullAtSameTime=adaptiveDirectTrajectory({quoteHistory:rows,asOf:issue,
  entryDelaySeconds:30,holdingSeconds:60});
 assert.deepEqual(earlier,fullAtSameTime);
 assert.ok(earlier.latestTrainingOutcomeAt<=issue);
 assert.equal(earlier.validation.meaning,'past chronological tuning evidence, NOT future win probability');
});
const stats=()=>({n:0,baseSignals:0,newSignals:0,baseWins:0,newWins:0,
 paired:0,basePairedWins:0,newPairedWins:0,rescued:0,harmed:0,draws:0,
 reversalSignals:0,baseReversalWins:0,newReversalWins:0});
function score(s,b,n,truth,turn){
 s.n++;if(truth==='DRAW')s.draws++;
 const bp=['CALL','PUT'].includes(b),np=['CALL','PUT'].includes(n);
 if(bp){s.baseSignals++;if(b===truth)s.baseWins++}
 if(np){s.newSignals++;if(n===truth)s.newWins++}
 if(bp&&np){s.paired++;if(b===truth)s.basePairedWins++;
  if(n===truth)s.newPairedWins++;
  if(b!==truth&&n===truth)s.rescued++;if(b===truth&&n!==truth)s.harmed++;}
 if(turn){s.reversalSignals++;if(b===truth)s.baseReversalWins++;
  if(n===truth)s.newReversalWins++;}
}
function summary(s){
 const pct=(a,b)=>b?Number((a*100/b).toFixed(2)):null;
 return {...s,baselineAccuracyPct:pct(s.baseWins,s.baseSignals),
  candidateAccuracyPct:pct(s.newWins,s.newSignals),
  candidateCoveragePct:pct(s.newSignals,s.n),
  pairedBaselinePct:pct(s.basePairedWins,s.paired),
  pairedCandidatePct:pct(s.newPairedWins,s.paired),
  baselineReversalPct:pct(s.baseReversalWins,s.reversalSignals),
  candidateReversalPct:pct(s.newReversalWins,s.reversalSignals)};
}
test('exact 67.1 versus independent learned trajectory over six horizons and new synthetic seeds',()=>{
 const seeds=[410021,410039,410047,410057,410081,410101,410117,410141];
 const modes=['trend','range','cycle','reversal','false_breakout','breakout','volatility','random'];
 const horizons=[5,10,30,60,120,300],indices=[1800,3500];
 const byH=Object.fromEntries(horizons.map(h=>[h,stats()]));
 const byRegime=Object.fromEntries(modes.map(m=>[m,stats()]));
 const total=stats();
 for(const kind of modes)for(const seed of seeds){
  const rows=generate(seed,kind,4200);
  for(const i of indices){
   const history=rows.slice(Math.max(0,i-2400),i+1),now=rows[i].ts;
   for(const h of horizons){
    const baseline=futureEntrySchedule({settings:{engine:'automatic',asset:'RESEARCH'},
     snap:{quoteHistory:history,quoteTs:now,provider:'research'},now,delays:[h]})[0];
    const candidate=compute(history,h);
    assert.equal(candidate.entryAt,now+h*1000);
    assert.equal(candidate.exitAt,now+h*2000);
    if(baseline.side){assert.ok(baseline.entryAt>=now+2000&&baseline.entryAt<=now+h*1000);assert.equal(baseline.exitAt,baseline.entryAt+h*1000);}
    else assert.equal(baseline.side,null,'quality gate must suppress weak baseline signals');
    const truth=side(rows[i+h].price,rows[i+2*h].price);
    const before=side(rows[i-30].price,rows[i].price);
    const turn=before!=='DRAW'&&truth!=='DRAW'&&before!==truth;
    for(const s of [total,byH[h],byRegime[kind]])
     score(s,baseline.side,candidate.side,truth,turn);
   }
  }
 }
 const report={source:'SYNTHETIC unseen streams, NOT broker accuracy',
  baselineVersion:'13.4.67.1',baselineCommit:'431bd6ffc276015a6581e0d6ba7a56c244de72e9',
  coreMotorIdenticalTo67:true,engine:'automatic',baselineUntouched:true,
  candidateModel:'adaptive-direct-trajectory-v1',
  target:'T+H entry to T+2H expiry; same prices and issue times',
  hypothesesFrozenBeforeEvaluation:true,seedList:seeds,
  total:summary(total),
  byHorizon:Object.fromEntries(Object.entries(byH).map(([k,v])=>[k,summary(v)])),
  byRegime:Object.fromEntries(Object.entries(byRegime).map(([k,v])=>[k,summary(v)]))};
 console.log('SENTINEL_671_ADAPTIVE_DIRECT='+JSON.stringify(report));
 assert.equal(total.n,768);
});

test('late backfill arriving only at issue cannot invent a long observable history',()=>{
 const rows=generate(310079,'cycle',2401),now=rows.at(-1).ts;
 const delayed=rows.map(q=>({...q,receivedAt:now}));
 const r=adaptiveDirectTrajectory({quoteHistory:delayed,asOf:now,
  entryDelaySeconds:30,holdingSeconds:30});
 assert.equal(r.side,null);
 assert.equal(r.status,'insufficient-completed-context');
});
test('the reference price is a quote actually available at issue',()=>{
 const rows=generate(310091,'trend',2401),now=rows.at(-1).ts;
 const received=rows.map(q=>({...q,receivedAt:q.ts+500}));
 const r=adaptiveDirectTrajectory({quoteHistory:received,asOf:now,
  entryDelaySeconds:30,holdingSeconds:30});
 assert.equal(r.status,'adaptive-direct-trajectory');
 assert.equal(r.latestObservedQuoteAt,now-1000);
 assert.ok(Math.abs(r.expectedPath[0].price-rows.at(-2).price)<1e-10);
});
