import test from 'node:test';
import assert from 'node:assert/strict';
import {repeatedReaction} from '../sentinel-trading-lab/agent/src/core/repeated-reaction.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {scenarioViewFromRuntime} from '../sentinel-trading-lab/agent/worker/scenario-view.mjs';

const start=Date.UTC(2026,9,7,17),values=[99.8,99.85,99.9,99.95,100,99.97,99.94,99.90,99.86,99.89,99.93,99.97,100,99.97,99.94,99.90,99.84,99.83];
function market(side='PUT',list=values,offset=0){const quotes=list.map((p,i)=>({price:side==='PUT'?p:200-p,ts:start+offset+i*1000}));return{quoteHistory:quotes,price:quotes.at(-1).price,quoteTs:quotes.at(-1).ts}}
function detect(s){return repeatedReaction({...s,now:s.quoteTs,expected2:.05,expectedMove:.1,oppositeSupport:99.5,oppositeResistance:100.5})}
function runtime(){const r=new DemoTradingRuntime();Object.assign(r.settings,{asset:'TEST',forecastHorizonSeconds:60,orderDurationMs:30000,futureDisplayThreshold:50});r.settings.risk.minConfidence=70;return r}
function forecast(side){const call=side==='CALL',p={asset:'TEST',bias:side,rawBias:side,outlookReady:true,directionReady:true,confidence:80,modelConfidence:80,agreement:80,callProbability:call?80:20,putProbability:call?20:80,expectedMove:.1,callTrigger:100.3,putTrigger:99.7,callInvalidation:99,putInvalidation:101,scenario:{kind:'forming'},safety:{blocked:false}};return{quality:{entrySide:'WAIT'},generalConsensus:{rapid:{side:call?'PUT':'CALL'},strategies:{side:'AGUARDAR',strength:0}},metrics:{micro:{delta2:call?.01:-.01,delta5:0,delta15:0},shortModel:{ready:true}},entryPlanner:{horizons:{'30':{...p},'60':{...p}}}}}
function merge(r,a,s){a.metrics.shortModel.repeatedReaction=detect(s);r._mergeScenarioConfluence(a,{cards:[],confluence:{horizons:{}}},s,s.quoteTs);return a}

test('two independent tests require the intervening structure to break in either direction',()=>{
 for(const side of ['CALL','PUT']){
  const early=detect(market(side,values.slice(0,16)));assert.equal(early.qualified,false);assert.equal(early.confirmedAt,0);
  const full=detect(market(side));assert.equal(full.side,side);assert.equal(full.qualified,true);assert.equal(full.tests,2);assert.equal(full.confirmedAt,start+16000);assert.equal(full.neckline,side==='PUT'?99.86:100.14);
  assert.equal(full.id,early.id);assert.ok(full.prominence>=full.excursion*2);
 }
});
test('a single touch, flat duplicate quotes, future quotes and feed gaps cannot create rejection evidence',()=>{
 const s=market();
 assert.equal(detect(market('PUT',values.slice(0,12))),null);
 assert.equal(detect({...s,quoteHistory:Array(20).fill(s.quoteHistory.at(-1))}),null);
 assert.deepEqual(repeatedReaction({...s,now:start+15000,expected2:.05,expectedMove:.1,oppositeSupport:99.5,oppositeResistance:100.5}),detect(market('PUT',values.slice(0,16))));
 const future=repeatedReaction({...s,now:start+15000,expected2:.05,expectedMove:.1,oppositeSupport:99.5});assert.equal(future?.qualified,false);
 const gap={...s,quoteHistory:s.quoteHistory.map((q,i)=>({...q,ts:q.ts+(i>=10?10000:0)})),quoteTs:s.quoteTs+10000};assert.equal(detect(gap),null);
});
test('unknown or nearby opposite barriers and a stale feed block the reaction',()=>{
 const s=market();
 for(const oppositeSupport of [null,99.82])assert.equal(repeatedReaction({...s,now:s.quoteTs,expected2:.05,expectedMove:.1,oppositeSupport})?.qualified,false);
 assert.equal(repeatedReaction({...s,now:s.quoteTs+2000,oppositeSupport:99.5}),null);
 const chased=detect(market('PUT',[...values,99.6]));assert.notEqual(chased?.qualified,true);
});
test('qualified expiration uses its own reaction on the first eligible quote without manufacturing forecast confidence',()=>{
 for(const side of ['CALL','PUT']){
  const r=runtime(),s=market(side),a=merge(r,forecast(side),s),p=a.entryPlanner.horizons['30'];
  assert.equal(p.confidence,80);assert.equal(p.callProbability,side==='CALL'?80:20);assert.equal(p.scenario.triggerBasis,'confirmed-repeated-rejection');
  const op=r._entryTimingState(a,s,s.quoteTs);assert.equal(op.actionable,true);assert.equal(op.side,side);assert.equal(op.entryAt,s.quoteTs);assert.equal(op.entryDecisionHorizonSeconds,30);
  assert.equal(op.targetAt,detect(s).expiresAt);assert.equal(op.activeUntil,s.quoteTs+3500);assert.match(r.signalValidation.pending.find(x=>x.kind==='operational_v3').strategy,/repeated-rejection-v1$/);
  const view=scenarioViewFromRuntime({operational:op,forecast:p,asset:'TEST',horizonSeconds:60,durationMs:30000,now:s.quoteTs});assert.equal(view.canEnter,true);assert.equal(view.displaySide,side);
 }
});
test('a new independent reaction can replace a cancelled setup without erasing its outcome',()=>{
 const r=runtime(),s=market(),a=merge(r,forecast('PUT'),s),first=r._entryTimingState(a,s,s.quoteTs),prior=structuredClone(r.signalValidation.pending.find(x=>x.kind==='operational_v3'));
 r.operationalSetup.invalidated=true;r.operationalSetup.invalidatedAt=s.quoteTs+1000;
 const next=market('PUT',values,30000),b=merge(r,forecast('PUT'),next),op=r._entryTimingState(b,next,next.quoteTs);
 assert.equal(op.actionable,true);assert.notEqual(op.createdAt,first.createdAt);assert.notEqual(r.operationalSetup.reactionId,detect(s).id);assert.deepEqual(r.signalValidation.pending.find(x=>x.kind==='operational_v3'),prior);
});
test('reaction results have a separate history block which cannot be bypassed by a new price event',()=>{
 const r=runtime(),s=market(),a=merge(r,forecast('PUT'),s),op=r._entryTimingState(a,s,s.quoteTs),key=op.validation.key;
 r.signalValidation.outcomes=Array.from({length:60},(_,i)=>({key,won:false,settlementQuality:'exact',createdAt:start-i*30000}));r.operationalSetup=null;r.signalValidation.pending=[];
 const next=market('PUT',values,30000),b=merge(r,forecast('PUT'),next),blocked=r._entryTimingState(b,next,next.quoteTs);
 assert.equal(blocked.historyBlocked,true);assert.equal(blocked.actionable,false);assert.equal(r.signalValidation.pending.filter(x=>x.kind==='operational_v3').length,0);assert.equal(r.signalValidation.outcomes.length,60);
});
test('a reaction cannot authorize a weak, conflicting, unsafe or opposite expiration forecast',()=>{
 for(const failure of ['direction','safety','opposite','confidence','probability']){
  const r=runtime(),s=market(),a=forecast('PUT'),p=a.entryPlanner.horizons['30'];
  if(failure==='direction')p.directionReady=false;if(failure==='safety')p.safety={blocked:true};if(failure==='opposite'){p.rawBias='CALL';p.callProbability=80;p.putProbability=20}if(failure==='confidence')p.confidence=p.modelConfidence=54;if(failure==='probability'){p.putProbability=49;p.callProbability=51}
  merge(r,a,s);const op=r._entryTimingState(a,s,s.quoteTs);assert.equal(op.actionable,false,failure);assert.equal(r.signalValidation.pending.filter(x=>x.kind==='operational_v3').length,0,failure);
 }
});
test('reaction entry needs two distinct current quotes after the structural break',()=>{
 for(const failure of ['one','duplicate','future']){
  const r=runtime(),s=market(),a=merge(r,forecast('PUT'),s),last=s.quoteHistory.at(-1),bad={...s,quoteHistory:failure==='one'?[last]:[last,{...last,ts:failure==='future'?last.ts+100:last.ts}]};
  if(failure==='future')bad.quoteTs+=100;
  assert.equal(r._entryTimingState(a,bad,s.quoteTs).actionable,false,failure);
 }
});
test('a new structural break owns the turn despite a lagging previous five-second direction',()=>{
 for(const side of ['CALL','PUT']){
  const r=runtime(),s=market(side),a=merge(r,forecast(side),s),call=side==='CALL';
  a.metrics.micro.delta5=call?-.02:.02;a.metrics.micro.delta15=call?-.03:.03;
  a.metrics.shortModel[call?'reversalPutConfirmed':'reversalCallConfirmed']=true;
  assert.equal(r._entryTimingState(a,s,s.quoteTs).actionable,true);
 }
});
test('losing the current reaction confirmation withdraws its entry immediately without switching history keys',()=>{
 const r=runtime(),s=market(),a=merge(r,forecast('PUT'),s),first=r._entryTimingState(a,s,s.quoteTs);
 delete a.entryPlanner.horizons['30'].reaction;
 const next={...s,quoteTs:s.quoteTs+1000,quoteHistory:[...s.quoteHistory,{price:s.price,ts:s.quoteTs+1000}]},withdrawn=r._entryTimingState(a,next,next.quoteTs);
 assert.equal(withdrawn.actionable,false);assert.equal(withdrawn.validation.key,first.validation.key);assert.equal(withdrawn.targetAt,first.targetAt);assert.equal(r.signalValidation.pending.filter(x=>x.kind==='operational_v3').length,1);
});
test('an independently confirmed opposite reaction preserves the prior signal outcome',()=>{
 for(const side of ['CALL','PUT']){
  const r=runtime(),opposite=side==='PUT'?'CALL':'PUT',old=forecast(opposite);old.quality.entrySide=opposite==='CALL'?'BUY':'SELL';old.generalConsensus.rapid.side=opposite;
  const oldPrice=opposite==='CALL'?100.4:99.6,oldTs=start-1000;assert.equal(r._entryTimingState(old,{price:oldPrice,quoteTs:oldTs,quoteHistory:[{ts:oldTs-200,price:oldPrice},{ts:oldTs,price:oldPrice}]},oldTs).actionable,true);
  const prior=structuredClone(r.signalValidation.pending[0]),s=market(side),a=merge(r,forecast(side),s),op=r._entryTimingState(a,s,s.quoteTs);
  assert.equal(op.actionable,true);assert.equal(op.side,side);assert.equal(op.transition.fromSide,opposite);assert.deepEqual(r.signalValidation.pending[0],prior);assert.equal(r.signalValidation.pending.filter(x=>x.kind==='operational_v3').length,2);
 }
});
test('the same reaction never renews its entry burst or reopens a cancelled point',()=>{
 const r=runtime(),s=market(),a=merge(r,forecast('PUT'),s),first=r._entryTimingState(a,s,s.quoteTs);
 const later={...s,quoteTs:s.quoteTs+4000,quoteHistory:[...s.quoteHistory,{ts:s.quoteTs+4000,price:s.price}]},op=r._entryTimingState(a,later,later.quoteTs);assert.equal(op.actionable,false);assert.equal(op.createdAt,first.createdAt);assert.equal(op.state,'ACOMPANHANDO');
 r.operationalSetup.invalidated=true;r.operationalSetup.invalidatedAt=later.quoteTs;
 assert.equal(r._entryTimingState(a,later,later.quoteTs+100).state,'INVALIDADO');
});
