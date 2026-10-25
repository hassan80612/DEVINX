import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {combine66WithProbability as vote} from '../sentinel-trading-lab/agent/src/core/66-probability-integration.mjs';
import {analyzeNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {shortProbability} from '../sentinel-trading-lab/agent/src/core/short-probability.mjs';
const structure=(side='CALL',strength=70,reason='closed-structure-and-live-impulse')=>
 ({ready:true,side,strength,reason,observedAt:1792705800000});
const estimate=(side,probability,{ready=false}={})=>({
 pCall:side==='CALL'?probability:1-probability,
 pPut:side==='PUT'?probability:1-probability,
 ready,side:ready?side:null,calibrated:false,source:'parametric-unvalidated'});
const call=(s,p,durationMs=30000,proof=null)=>vote(s,p,{durationMs,proof,enforceFinalExpiryVote:true});
test('no perpetual WAIT when probability has no history/calibration',()=>{
 const strong=structure('CALL',82);
 for(const durationMs of [30000,60000,120000,300000]){
  const out=call(strong,null,durationMs);
  assert.equal(out.ready,true);assert.equal(out.side,'CALL');
  const unready=call(strong,estimate('PUT',.52),durationMs);
  assert.equal(unready.ready,true);assert.equal(unready.side,'CALL');
 }
});
test('reversal at confirmed range extreme remains independent of probability warmup',()=>{
 for(const p of [null,estimate('PUT',.53),estimate('CALL',.51)]){
  const out=call(structure('PUT',null,'closed-range-extreme-reversal-confirmed'),p);
  assert.equal(out.side,'PUT');assert.equal(out.ready,true);
 }
});
test('marginal 53/47 probability never freezes a qualified structural PUT',()=>{
 const ordinary=call(structure('PUT',70),estimate('PUT',.53));
 assert.equal(ordinary.ready,true);assert.equal(ordinary.side,'PUT');
 const strong=call(structure('PUT',88),estimate('PUT',.53));
 assert.equal(strong.ready,true);assert.equal(strong.side,'PUT');
});
test('strong disagreement only rejects marginal structure; there is never blind inversion',()=>{
 const weak=call(structure('CALL',38),estimate('PUT',.7));
 assert.equal(weak.ready,false);assert.equal(weak.side,null);
 const strong=call(structure('CALL',88),estimate('PUT',.7));
 assert.equal(strong.ready,true);assert.equal(strong.side,'CALL');
});
test('evidence may still authorize the preexisting independently verified inversion',()=>{
 const p=estimate('PUT',.72,{ready:true}),proof={approved:true,n:16,observedOppositeRate:.86};
 const out=call(structure('CALL',35),p,30000,proof);
 assert.equal(out.side,'PUT');assert.equal(out.probabilityOverride,true);
});
test('no extra timers or dependence on the calibrated attribute or payout',()=>{
 const code=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/66-probability-integration.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(code,/\bawait\b|setInterval\s*\(|setTimeout\s*\(|estimate\.calibrated\s*===\s*true/);
 const runtime=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/runtime.mjs',import.meta.url),'utf8');
 const start=runtime.indexOf('const revisedObservation=this.forecastModel');
 const end=runtime.indexOf('let next=advanceNowOpportunity',start);
 assert.ok(runtime.slice(start,end).includes('enforceFinalExpiryVote:true'));
});
test('historical video replay: compare admissions on identical observed quotes and exact expiry',()=>{
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/sentinel-user-video-broker-6dp-20261016.json',import.meta.url),'utf8'));
 const quotes=fixture.quoteHistory;
 for(const durationMs of [30000,60000]){
  let nextAt=quotes[0].ts+100000;
  const tally={baseline:0,admitted:0,baseWins:0,admittedWins:0,blockedWins:0,blockedLosses:0,ties:0};
  for(let i=0;i<quotes.length;i++){
   const q=quotes[i];if(q.ts<nextAt||q.ts+durationMs>quotes.at(-1).ts)continue;
   const history=quotes.slice(0,i+1);
   const base=analyzeNowOpportunity({quoteHistory:history,price:q.price,quoteAt:q.ts,now:q.ts,durationMs,engineId:'automatic',qualityPolicy:'adaptive-market-v17'});
   if(!base.ready)continue;
   const forecast=shortProbability({quoteHistory:history,price:q.price,quoteAt:q.ts,now:q.ts,durationMs,payout:null});
   const candidate=call(base,forecast,durationMs);
   // Only actual expiry observations (<=1s away) are graded.
   let exit=null;
   for(let j=i+1;j<quotes.length;j++)if(quotes[j].ts>=q.ts+durationMs){exit=quotes[j];break}
   if(!exit||exit.ts-q.ts-durationMs>1000)continue;
   const result=exit.price===q.price?null:(exit.price>q.price?'CALL':'PUT');
   nextAt=q.ts+durationMs;
   tally.baseline++;
   if(result===null){tally.ties++;continue}
   const win=base.side===result;
   if(win)tally.baseWins++;
   if(candidate.ready){
    tally.admitted++;if(candidate.side===result)tally.admittedWins++;
   }else if(win)tally.blockedWins++;else tally.blockedLosses++;
  }
  console.log('CANDIDATE_EXPIRY_REPLAY '+JSON.stringify({durationSeconds:durationMs/1000,...tally,source:'old user video (not held-out or live)'}));
  assert.ok(tally.admitted<=tally.baseline);
 }
});
