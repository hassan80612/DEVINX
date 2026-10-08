import test from 'node:test';
import assert from 'node:assert/strict';
import {reversalStructure} from '../sentinel-trading-lab/agent/src/core/reversal-structure.mjs';
import {entryOpportunities} from '../sentinel-trading-lab/agent/src/core/entry-opportunities.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';

const start=1791385620000,prices=[100.06,100.08,100.05,100.03,100.01,100.04,100.075,100.10,100.11];
function input(side='CALL',length=prices.length){
 const call=side==='CALL',quoteHistory=prices.slice(0,length).map((price,i)=>({ts:start+i*200,price:call?price:200-price})),q=quoteHistory.at(-1);
 return {side,snap:{asset:'TEST',provider:'test',quoteHistory,quoteTs:q.ts,price:q.price},now:q.ts,durationMs:30000,reaction:{touchAt:start+800},expectedMove:.1,oppositeLevel:call?100.5:99.5};
}
function analysis(side){const call=side==='CALL';return {metrics:{micro:{delta2:call?.01:-.01,delta5:call?.02:-.02,delta15:call?-.02:.02,expected30:.1},shortModel:{ready:true,sr:{support:99.5,resistance:100.5},callScore:call?80:10,putScore:call?10:80,reversalCallScore:call?80:0,reversalPutScore:call?0:80,reversalCallConfirmed:call,reversalPutConfirmed:!call,reversalCallCandidate:call,reversalPutCandidate:!call,callRoomOk:true,putRoomOk:true}},entryPlanner:{horizons:{'30':{asset:'TEST',rawBias:call?'PUT':'CALL',confidence:80,callProbability:50,putProbability:50,expectedMove:.1},'120':{asset:'TEST',rawBias:call?'PUT':'CALL',confidence:80,callProbability:call?20:80,putProbability:call?80:20,outlookReady:true,directionReady:true,callTrigger:100,putTrigger:100,callInvalidation:90,putInvalidation:110}}}};}

test('a two-quote rebound below the opposing swing is not a structural turn',()=>{
 for(const side of ['CALL','PUT'])assert.equal(reversalStructure(input(side,7)).blockedBy,'structure-break');
});
test('a causal structural break can qualify symmetrically on the same received frame',()=>{
 for(const side of ['CALL','PUT']){const x=input(side),r=reversalStructure(x);assert.equal(r.allowed,true);assert.equal(r.breakConfirmed,true);assert.equal(r.roomConfirmed,true);assert.equal(r.level,side==='CALL'?100.08:99.92);}
});
test('room must cover the expiration movement and cannot be fabricated when the barrier is unknown',()=>{
 const x=input();for(const oppositeLevel of [null,100.15,100])assert.equal(reversalStructure({...x,oppositeLevel}).blockedBy,'expiration-room');
 assert.equal(reversalStructure({...x,expectedMove:.5}).allowed,false);
});
test('future quotes and duplicates cannot manufacture a swing; stale quotes and feed gaps fail',()=>{
 const x=input(),a=reversalStructure(x);
 assert.deepEqual(reversalStructure({...x,snap:{...x.snap,quoteHistory:[...x.snap.quoteHistory,...x.snap.quoteHistory,{ts:x.now+200,price:1000}]}}),a);
 assert.equal(reversalStructure({...x,now:x.now+3000}).blockedBy,'feed');
 assert.equal(reversalStructure({...x,snap:{...x.snap,quoteTs:x.now+1}}).blockedBy,'feed');
 assert.equal(reversalStructure({...x,snap:{...x.snap,quoteHistory:x.snap.quoteHistory.filter((q,i)=>i===0||i>=4).map((q,i)=>({...q,ts:q.ts-(i===0?5000:0)}))}}).blockedBy,'structure-history');
});
test('experimental policy owns the break trigger and retains independent CALL and PUT entries',()=>{
 for(const side of ['CALL','PUT']){
  const x=input(side),a=analysis(side),opportunity=entryOpportunities({...x,analysis:a,minPoints:55,entryPolicy:'structural-reversals-v1'}).find(c=>c.side===side);
  assert.equal(opportunity.allowed,true);assert.equal(opportunity.plan.reaction.structuralBreak.allowed,true);
  assert.equal(opportunity.plan.reaction.trigger,opportunity.reversalEvidence.level+(side==='CALL'?1:-1)*opportunity.reversalEvidence.buffer);
  const r=new DemoTradingRuntime({entryPolicy:'structural-reversals-v1'});Object.assign(r.settings,{asset:'TEST',forecastHorizonSeconds:120,orderDurationMs:30000,futureDisplayThreshold:50});r.settings.risk.minConfidence=55;
  const op=r._operationalSignalState(a,x.snap,x.now);
  assert.equal(op.actionable,true,side);assert.equal(op.side,side);assert.equal(op.scenario.side,side==='CALL'?'PUT':'CALL');
  assert.equal(op.entryAt,x.now);assert.match(r.entryResearch.pending[0].key,/structural-reversals-v1/);
  assert.match(r.signalValidation.pending[0].strategy,/structural-reversals-v1/);
 }
});
test('policy blocks only reversals and keeps the default implementation unchanged',()=>{
 const x=input('CALL',7),a=analysis('CALL');
 const old=entryOpportunities({...x,analysis:a,minPoints:55}).find(c=>c.side==='CALL'),trial=entryOpportunities({...x,analysis:a,minPoints:55,entryPolicy:'structural-reversals-v1'}).find(c=>c.side==='CALL');
 assert.equal(old.allowed,true);assert.equal(trial.allowed,false);assert.equal(trial.blockedBy,'structure-break');
 a.metrics.shortModel.reversalCallConfirmed=false;a.metrics.shortModel.reversalCallCandidate=false;Object.assign(a.metrics.shortModel,{callSetup:true,flowReadyCall:true,structureReadyCall:true});
 const base=entryOpportunities({...x,analysis:a,minPoints:55}),next=entryOpportunities({...x,analysis:a,minPoints:55,entryPolicy:'structural-reversals-v1'});
 assert.deepEqual(next,base);
});
