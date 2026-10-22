import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ContinuousExpiryCalibration} from '../sentinel-trading-lab/agent/src/core/continuous-expiry-calibration.mjs';
const context='exnova|EUR/USD OTC|automatic|30000';
const base=1792709100000;
const outcome=(c,{duration=30000,entryAt=base,entryPrice=1.1,exitPrice=1.101,
  pCall=.65,structuralSide='CALL',finalSide='CALL',
  structuralReason='closed-structure-and-live-impulse',strategy='trend',marketShape='directional-trend'}={})=>{
 const sample=(now,quoteAt,price,marketValid,history)=>c.observe({
  context,now,quoteAt,price,quoteHistory:history,expiryMs:duration,
  estimate:{pCall,pPut:1-pCall},structuralSide,finalSide,
  structuralReason,strategy,marketShape,marketValid
 });
 sample(entryAt,entryAt,entryPrice,true,[{ts:entryAt,price:entryPrice,receivedAt:entryAt}]);
 const due=entryAt+duration;
 return sample(due,due,exitPrice,false,[
  {ts:entryAt,price:entryPrice,receivedAt:entryAt},
  {ts:due,price:exitPrice,receivedAt:due}]);
};
test('ALL forecasts are observed, including strong setups and when no structural entry exists',()=>{
 const c=new ContinuousExpiryCalibration();
 let x=outcome(c,{structuralSide:'CALL',structuralReason:'rejection-confirmed',
  strategy:'support_resistance',finalSide:'CALL'});
 assert.equal(x.samples,1);assert.equal(x.reversals.total,1);assert.equal(x.reversals.correct,1);
 x=outcome(c,{entryAt:base+31000,structuralSide:null,finalSide:null,
  structuralReason:'completed-structure-not-ready',pCall:.55,exitPrice:1.099});
 assert.equal(x.samples,2,'no READY signal is required for a real expiry label');
 assert.equal(x.candidateDirections.total,1);
 assert.equal(x.estimateCount,2);
});
test('no fabricated results for a missed one-second expiry and no overlapping training',()=>{
 const c=new ContinuousExpiryCalibration(),estimate={pCall:.7,pPut:.3};
 const start=(at)=>c.observe({context,now:at,quoteAt:at,price:1.1,
  quoteHistory:[{ts:at,price:1.1}],expiryMs:30000,estimate,
  structuralSide:'CALL',finalSide:'CALL',marketValid:true});
 start(base);start(base+12000);start(base+25000);
 let x=c.observe({context,now:base+30500,quoteAt:base+30500,price:1.2,
  quoteHistory:[{ts:base+25000,price:1.1},{ts:base+30500,price:1.2}],
  expiryMs:30000,estimate,marketValid:false});
 assert.equal(x.samples,0);
 assert.equal(x.pending,false);
 x=outcome(c,{entryAt:base+60000});
 assert.equal(x.samples,1);
});
test('independent forward holdout validates only a demonstrably improved reliability adjustment',()=>{
 const c=new ContinuousExpiryCalibration();
 let result;
 for(let i=0;i<36;i++){
  // Highly overconfident CALL model, while the actual direction is PUT
  // on 4 of 5 genuinely settled nonoverlapping observations.
  const positive=i%5===0;
  result=outcome(c,{entryAt:base+i*31000,pCall:.7,
   entryPrice:1.1,exitPrice:positive?1.101:1.099,
   structuralSide:'CALL',finalSide:'CALL'});
 }
 assert.equal(result.samples,36);
 assert.equal(result.calibrated,true);
 assert.equal(result.status,'validated');
 assert.ok(result.adjustedHoldoutBrier<result.rawHoldoutBrier);
 assert.ok(result.candidateDirections.correct<result.candidateDirections.total);
 assert.equal(result.source,'observed-broker-quotes-not-broker-settlements');
});
test('a reliable preexisting forecast remains UNCALIBRATED when correction makes it worse',()=>{
 const c=new ContinuousExpiryCalibration();let result;
 for(let i=0;i<36;i++)result=outcome(c,{entryAt:base+i*31000,
  pCall:.8,exitPrice:i%5===0?1.099:1.101});
 assert.equal(result.samples,36);
 assert.equal(result.calibrated,false);
 assert.equal(result.status,'evaluated-without-calibration-advantage');
});
test('classifies reversal and continuation independently and counts four contrary quote outcomes',()=>{
 const c=new ContinuousExpiryCalibration();let x;
 for(let i=0;i<4;i++){
  x=outcome(c,{entryAt:base+i*31000,pCall:.7,exitPrice:1.099,
   structuralReason:i%2===0?'failed-breakout-structure-change':'rejection-followthrough-clear-room',
   strategy:i%2===0?'support_resistance':'trend',marketShape:'some-phase'});
 }
 assert.deepEqual(x.reversals,{total:2,correct:0});
 assert.deepEqual(x.continuations,{total:2,correct:0});
 assert.equal(x.candidateDirections.consecutiveWrong,4);
 assert.equal(x.candidateDirections.total,4);
});
test('Agent restart keeps settled labels, not stale pending prices or extra UI work',()=>{
 const c=new ContinuousExpiryCalibration();outcome(c);
 c.observe({context,now:base+32000,quoteAt:base+32000,price:1.1,
  quoteHistory:[{ts:base+32000,price:1.1}],expiryMs:30000,
  estimate:{pCall:.6,pPut:.4},marketValid:true});
 const restored=new ContinuousExpiryCalibration().restore(c.snapshot());
 assert.equal(restored._report(restored._state(context)).samples,1);
 assert.equal(restored._report(restored._state(context)).pending,false);
});
test('runtime reports results but never gates entry on calibration, adjusts native expiry, or reads browser',()=>{
 const runtime=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/runtime.mjs',import.meta.url),'utf8');
 const helper=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/continuous-expiry-calibration.mjs',import.meta.url),'utf8');
 const start=runtime.indexOf('const expiryCalibration=this.forecastModel=');
 const end=runtime.indexOf('const eligible=',start);
 assert.ok(start>0&&end>start);
 assert.match(runtime.slice(start,end),/this.continuousCalibration.observe/);
 assert.match(runtime,/continuousExpiryCalibration:this.continuousCalibration.snapshot\(\)/);
 assert.match(runtime,/this.continuousCalibration.restore/);
 assert.doesNotMatch(helper,/\bawait\b|setTimeout\s*\(|setInterval\s*\(|WebSocket|playwright|fetch\s*\(/i);
 assert.ok(runtime.indexOf('combine66WithProbability(original66,preliminary')<start,
  'calibration must remain strictly AFTER real-time decision');
 const agent=readFileSync(new URL('../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs',import.meta.url),'utf8');
 assert.match(agent,/recoverDigitalAfterClose\(_provider\)\{return false;\}/);
});
