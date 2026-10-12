import test from 'node:test';
import assert from 'node:assert/strict';
import {planEntryWindow as basePlan,entryOffsets as baseOffsets} from './fixtures/sentinel-entry-planner-baseline-6721.mjs';
import {evolveOpportunity as baseEvolve} from './fixtures/sentinel-window-baseline-6721.mjs';
import {planEntryWindow as newPlan,entryOffsets as newOffsets} from '../sentinel-trading-lab/agent/src/core/entry-window-planner.mjs';
import {evolveOpportunity as newEvolve} from '../sentinel-trading-lab/agent/src/core/single-opportunity-window.mjs';
import {adaptiveDirectTrajectory} from '../sentinel-trading-lab/agent/src/core/adaptive-direct-trajectory.mjs';
import {autonomousSelectiveEntry} from '../sentinel-trading-lab/agent/src/core/selective-autonomous.mjs';
import {observedNoise,coherentInterval} from '../sentinel-trading-lab/agent/src/core/forward-direction-quality.mjs';

const EPOCH=1800000000000;
const SET={engine:'automatic',asset:'TEST',forecastMode:'continuous',orderDurationMs:30000};
const proposed=(side,at,offset=12)=>({side,issuedAt:at,entryAt:at+offset*1000,exitAt:at+(offset+30)*1000,
 projectedEntryPrice:1.1,projectedExitPrice:side==='CALL'?1.2:1.0,delaySeconds:30,holdingSeconds:30});
const at=(previous,candidate,t,confirmation,quoteAt=t,settings=SET)=>newEvolve({previous,candidate,now:t,quoteAt,settings,confirmation});

test('isolated contradictory peak cannot override several consistent candidate instants',()=>{
 const t=EPOCH;
 const makeLead=seconds=>{
  const side=seconds===14?'CALL':'PUT';
  const strength=seconds===14?2.1:seconds===3?.9:seconds===7?.8:seconds===22?.7:.6;
  return {side,projectedEntryPrice:1.1,
   projectedExitPrice:side==='CALL'?1.102:1.098,selectionStrength:strength};
 };
 const old=basePlan({now:t,windowSeconds:30,holdingSeconds:30,evaluateLead:makeLead});
 const next=newPlan({now:t,windowSeconds:30,holdingSeconds:30,evaluateLead:makeLead});
 assert.equal(old.side,'CALL');
 assert.equal(next.side,'PUT');
 assert.equal(next.windowEndsAt,old.windowEndsAt);
 assert.equal(next.exitAt-next.entryAt,30000);
 assert.ok(next.entryAt<t+30000);
});

test('equal/conflicting directional evidence abstains instead of flickering',()=>{
 const t=EPOCH;
 const makeLead=x=>({side:x===3||x===7?'CALL':'PUT',
  projectedEntryPrice:1.1,projectedExitPrice:x===3||x===7?1.101:1.099,
  selectionStrength:1});
 // New 30s offsets: 3,7,14,22,27. 2 CALL vs 3 PUT is an eligible
 // majority; oppose it with equally strong 2 CALL / 2 PUT / 1 neutral.
 const tied=x=>x===27?null:makeLead(x);
 const result=newPlan({now:t,windowSeconds:30,holdingSeconds:30,evaluateLead:tied});
 assert.equal(result.side,null);
 assert.equal(result.status,'scanning-entry-window');
});

test('two different genuine opposite confirmations cancel; neither flip nor repeat',()=>{
 const t=EPOCH;
 const first=at(null,proposed('CALL',t),t);
 assert.equal(first.phase,'open');
 assert.equal(first.side,'CALL');
 const opposite={side:'PUT',projectedEntryPrice:1.1,projectedExitPrice:1.09};
 const a=at(first,null,t+12000,opposite);
 assert.equal(a.phase,'open');assert.equal(a.side,'CALL');
 const sameQuote=at(a,null,t+12400,opposite,t+12000);
 assert.equal(sameQuote.phase,'open');
 const b=at(sameQuote,null,t+12800,opposite,t+12800);
 assert.equal(b.phase,'cancelled');assert.equal(b.side,'CALL');
 assert.equal(b.windowStartedAt,t);assert.equal(b.windowEndsAt,t+30000);
 const late=at(b,proposed('PUT',t+13000),t+14000,{side:'PUT',projectedEntryPrice:1.1,projectedExitPrice:1.09});
 assert.equal(late.phase,'cancelled');
 assert.equal(late.side,'CALL');
 const after=at(late,null,t+31000);
 assert.equal(after.phase,'scanning');
 assert.equal(after.side,null);
});

test('one contrary quote followed by confirmed original side still permits exactly one CALL',()=>{
 const t=EPOCH;
 const first=at(null,proposed('CALL',t),t);
 const a=at(first,null,t+12000,{side:'PUT',projectedEntryPrice:1.1,projectedExitPrice:1.09});
 const b=at(a,null,t+12600,{side:'CALL',projectedEntryPrice:1.1,projectedExitPrice:1.12});
 assert.equal(b.phase,'fired');assert.equal(b.side,'CALL');
 const c=at(b,proposed('PUT',t+13000),t+13400,{side:'PUT',projectedEntryPrice:1.1,projectedExitPrice:1.09});
 assert.equal(c.phase,'fired');
 assert.equal(c.entryTriggeredAt,b.entryTriggeredAt);
 assert.equal(c.entryReadyNow,false);
});

function generate(seed,kind,len=3700){
 let state=seed>>>0,price=Math.log(1.1),last=0,origin=price;
 const u=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)+1)/4294967297;
 const out=[];
 for(let i=0;i<len;i++){
  const x=u(),y=u(),z=u(),g=Math.sqrt(-2*Math.log(x))*Math.cos(2*Math.PI*y);
  let move=g*.000011;
  if(kind==='trend')move+=(i%1400<850?.000006:-.000005)+.24*last;
  if(kind==='range')move+=-.09*(price-origin)-.25*last;
  if(kind==='cycle'){const p=72+seed%53;const w=t=>.0007*Math.sin(2*Math.PI*t/p+seed*.2)+.00019*Math.sin(2*Math.PI*t/(p*.43));
    move+=w(i)-w(i-1);}
  if(kind==='reversal')move+=(Math.floor(i/175)%2?.000006:-.000006)+.13*last;
  if(kind==='false_breakout')move+=(i%240<24?.000014:i%240<70?-.000013:0)-.04*(price-origin);
  if(kind==='random')move+=g*.000005;
  price+=move;last=move;
  out.push({ts:EPOCH+i*1000,price:Math.exp(price)});
 }
 return out;
}
function priceAt(path,seconds){
 const points=path.filter(x=>Number(x.price)>0&&Number(x.secondsFromNow)>=0)
  .sort((a,b)=>a.secondsFromNow-b.secondsFromNow);
 if(!points.length||seconds>points.at(-1).secondsFromNow)return null;
 const exact=points.find(x=>x.secondsFromNow===seconds);
 if(exact)return Number(exact.price);
 for(let i=0;i<points.length-1;i++){
  const a=points[i],b=points[i+1];
  if(a.secondsFromNow<=seconds&&b.secondsFromNow>=seconds){
   const f=(seconds-a.secondsFromNow)/(b.secondsFromNow-a.secondsFromNow);
   return Math.exp(Math.log(a.price)*(1-f)+Math.log(b.price)*f);
  }
 }
 return null;
}
const counters=()=>({windows:0,baseSignals:0,baseWins:0,candidateSignals:0,candidateWins:0,
  paired:0,pairedBaseWins:0,pairedCandidateWins:0,baseDraws:0,candidateDraws:0,
  flips:0,invalidExpiries:0});
function collect(acc,baseline,candidate,rows,index,h){
 acc.windows++;
 const score=(proposal,prefix)=>{
  if(!['CALL','PUT'].includes(proposal?.side))return;
  acc[prefix+'Signals']++;
  const entry=Math.round((proposal.entryAt-EPOCH)/1000);
  const expiry=Math.round((proposal.exitAt-EPOCH)/1000);
  if(entry<=index||expiry-entry!==h||expiry>=rows.length){acc.invalidExpiries++;return;}
  const actual=rows[expiry].price-rows[entry].price;
  if(actual===0){acc[prefix+'Draws']++;return;}
  if((actual>0?'CALL':'PUT')===proposal.side)acc[prefix+'Wins']++;
 };
 score(baseline,'base');score(candidate,'candidate');
 if(['CALL','PUT'].includes(baseline?.side)&&['CALL','PUT'].includes(candidate?.side)){
  acc.paired++;
  const actualB=rows[Math.round((baseline.exitAt-EPOCH)/1000)].price-rows[Math.round((baseline.entryAt-EPOCH)/1000)].price;
  const actualC=rows[Math.round((candidate.exitAt-EPOCH)/1000)].price-rows[Math.round((candidate.entryAt-EPOCH)/1000)].price;
  if((actualB>0?'CALL':actualB<0?'PUT':'DRAW')===baseline.side)acc.pairedBaseWins++;
  if((actualC>0?'CALL':actualC<0?'PUT':'DRAW')===candidate.side)acc.pairedCandidateWins++;
 }
}
function summarize(x){
 const pct=(n,d)=>d?Number((100*n/d).toFixed(2)):null;
 const net=(win,signals,draws)=>Number((win*.80-(signals-win-draws)).toFixed(2));
 return {...x,baseAccuracyPct:pct(x.baseWins,x.baseSignals-x.baseDraws),
  candidateAccuracyPct:pct(x.candidateWins,x.candidateSignals-x.candidateDraws),
  baseCoveragePct:pct(x.baseSignals,x.windows),candidateCoveragePct:pct(x.candidateSignals,x.windows),
  pairedBaselinePct:pct(x.pairedBaseWins,x.paired),pairedCandidatePct:pct(x.pairedCandidateWins,x.paired),
  baseTheoreticalNetUnitsAt80PctPayout:net(x.baseWins,x.baseSignals,x.baseDraws),
  candidateTheoreticalNetUnitsAt80PctPayout:net(x.candidateWins,x.candidateSignals,x.candidateDraws)};
}

test('OFFLINE benchmark: baseline 67.21 versus candidate on independently generated 30s/60s market histories',()=>{
 const buckets={};
 const seeds=[410021,410039,410047];
 const regimes=['trend','range','cycle','reversal','false_breakout','random'];
 const modes=['continuous','selective'],horizons=[30,60],indices=[2250,2800];
 for(const mode of modes)for(const h of horizons)buckets[mode+'_'+h]=counters();
 for(const regime of regimes)for(const seed of seeds){
  const rows=generate(seed,regime);
  for(const index of indices)for(const h of horizons){
   const now=rows[index].ts,history=rows.slice(index-2300,index+1),snap={quoteHistory:history,price:rows[index].price,quoteTs:now};
   const noise=observedNoise({quotes:history,now,horizonSeconds:h});
   let path=null;
   const learned=adaptiveDirectTrajectory({quoteHistory:history,asOf:now,
    entryDelaySeconds:h,holdingSeconds:h});
   if(learned.status==='adaptive-direct-trajectory'&&Array.isArray(learned.expectedPath))path=learned.expectedPath;
   const cached=new Map();
   const evaluateLead=lead=>{
    if(cached.has(lead))return cached.get(lead);
    let out=null;
    if(mode==='continuous'&&path){
     const first=priceAt(path,lead),last=priceAt(path,lead+h);
     if(first>0&&last>0){
      const check=coherentInterval({entryPrice:first,exitPrice:last,noise,noiseFraction:.15});
      if(check.qualified)out={side:check.side,projectedEntryPrice:first,projectedExitPrice:last,
       selectionStrength:Math.min(3,Math.abs(check.relativeMove)/Math.max(noise||1e-12,1e-12))};
     }
    }else if(mode==='selective'){
     const p=autonomousSelectiveEntry({quoteHistory:history,now,quoteTs:now,delaySeconds:lead,holdingSeconds:h,asset:'TEST',engineId:'automatic'});
     if(p.side){
      const rel=p.validationExamples>=6?p.validationCorrect/Math.max(1,p.validationExamples):.5;
      out={...p,selectionStrength:Math.max(.01,p.historicalAgreement*.7+rel*.3)};
     }
    }
    cached.set(lead,out);return out;
   };
   const opt={windowSeconds:h,holdingSeconds:h,now,asset:'TEST',engineId:'automatic',
    forecastMode:mode,evaluateLead};
   const original=basePlan(opt),candidate=newPlan(opt);
   // Both planners consume forecasts created solely from price observations
   // up to issue time. Future path is only used AFTER both predictions.
   assert.equal(candidate.windowEndsAt,original.windowEndsAt);
   assert.equal(candidate.actionable,false);
   if(candidate.side)assert.equal(candidate.side,candidate.projectedExitPrice>candidate.projectedEntryPrice?'CALL':'PUT');
   collect(buckets[mode+'_'+h],original,candidate,rows,index,h);
  }
 }
 const report={version:'67.21 exact frozen planner versus unpublished 67.22 research',
  source:'SYNTHETIC market paths; NOT broker results or proven hit probability',
  seeds,regimes,expirationSeconds:horizons,modeledPayout:0.8,
  windowsPerConfiguration:seeds.length*regimes.length*indices.length,
  byModeAndExpiry:Object.fromEntries(Object.entries(buckets).map(([k,v])=>[k,summarize(v)]))};
 console.log('SENTINEL_6722_OFFLINE_COMPARISON='+JSON.stringify(report));
 for(const b of Object.values(buckets))assert.equal(b.invalidExpiries,0);
 assert.equal(Object.keys(buckets).length,4);
});
