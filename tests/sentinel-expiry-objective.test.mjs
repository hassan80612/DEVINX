import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {causalPatternDirection} from '../sentinel-trading-lab/agent/src/core/causal-pattern-direction.mjs';
import {analyzeNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {expiryEvidence,inspectLearning,candidate,horizonStudy,dynamicsPhaseSensitivity,policies} from '../research/expiry-objective-study.mjs';
import {horizonPriceDynamics} from '../research/horizon-price-dynamics.mjs';
const rows=JSON.parse(readFileSync(new URL('./fixtures/sentinel-user-video-broker-6dp-20261016.json',import.meta.url))).quoteHistory;
function inputAt(i,durationMs=30000){const q=rows[i];return {quoteHistory:rows.slice(0,i+1),
 price:q.price,quoteAt:q.ts,now:q.ts,engineId:'automatic',qualityPolicy:'adaptive-market-v17',durationMs};}
test('return magnitude and binary expiry success can recommend opposite directions',()=>{
 const evidence=expiryEvidence([...Array.from({length:10},()=>({weight:1,move:.00001})),
  ...Array.from({length:2},()=>({weight:1,move:-.0001}))]);
 assert.equal(evidence.meanSide,'PUT');assert.equal(evidence.majoritySide,'CALL');
 assert.equal(evidence.agreement,false);assert.equal(evidence.meanSideWeightFraction,2/12);
 assert.ok(evidence.imbalance>=.4); // Old admission passes despite minority direction.
});
test('weighted ties remain in the denominator and never masquerade as successful directions',()=>{
 const evidence=expiryEvidence([{weight:1,move:1},{weight:1,move:0},{weight:2,move:-1}]);
 assert.equal(evidence.callWeightFraction,.25);assert.equal(evidence.putWeightFraction,.5);
 assert.equal(evidence.tieWeightFraction,.25);assert.equal(evidence.imbalance,.25);
 assert.equal(expiryEvidence([]).majoritySide,null);
});
test('observability leaves every published learner output unchanged at both horizons',()=>{
 for(const durationMs of [30000,60000])for(const i of [200,400,650,950]){
  const input=inputAt(i,durationMs),{diagnostic,...actual}=inspectLearning(input);
  assert.deepEqual(actual,causalPatternDirection(input));
  if(diagnostic)assert.equal(expiryEvidence(diagnostic.selected).meanSide,actual.side);
 }
});
test('all expiry candidates ignore unseen and late-arriving prices at 30s and 60s',()=>{
 for(const durationMs of [30000,60000])for(const i of [400,650,950]){
  const input=inputAt(i,durationMs),polluted={...input,quoteHistory:[...rows,
   {ts:input.now-100,receivedAt:input.now+100,price:99}]};
  for(const policy of policies)assert.deepEqual(candidate(polluted,policy),candidate(input,policy));
 }
});
test('published 60s routing conserves structural decisions while 30s uses expiry outcomes',()=>{
 let eligible=0;
 for(const i of [400,650,950]){
  const input=inputAt(i,60000),actual=analyzeNowOpportunity(input),structural=analyzeNowOpportunity({...input,qualityPolicy:'baseline'});
  assert.equal(actual.side,structural.side);assert.equal(actual.ready,structural.ready);
  if(inspectLearning(input).ready)eligible++;
 }
 assert.ok(eligible>0);
});
test('60s evaluation retains the entire holding period and matched entry coverage',()=>{
 const r=horizonStudy(rows,60000);
 for(const p of policies){
  const entries=r.results[p].entries;
  for(let i=1;i<entries.length;i++)assert.ok(entries[i].at-entries[i-1].at>=60000);
  assert.deepEqual(r.matched[p].decisions.map(d=>d.at),r.results.published.entries.map(d=>d.at));
  assert.equal(r.matched[p].decisions.length,r.results.published.signals);
 }
});
test('expiry dynamics projects its horizon, preserves price scale and is independent of clock origin',()=>{
 const synthetic=Array.from({length:181},(_,i)=>({ts:1000000+i*1000,receivedAt:1000000+i*1000,price:Math.exp(.00001*i)}));
 const q=synthetic.at(-1),input={quoteHistory:synthetic,quoteAt:q.ts,now:q.ts,price:q.price,durationMs:30000};
 const thirty=horizonPriceDynamics(input),sixty=horizonPriceDynamics({...input,durationMs:60000});
 assert.equal(thirty.side,'CALL');assert.equal(sixty.side,'CALL');
 assert.ok(sixty.predictedPrice>thirty.predictedPrice&&thirty.predictedPrice>q.price);
 assert.equal(thirty.horizonMs,30000);assert.equal(sixty.horizonMs,60000);
 const shifted=horizonPriceDynamics({...input,now:q.ts+517,quoteAt:q.ts+517,
  quoteHistory:synthetic.map(r=>({...r,ts:r.ts+517,receivedAt:r.receivedAt+517}))});
 assert.equal(shifted.predictedPrice,thirty.predictedPrice);
 const scaled=horizonPriceDynamics({...input,price:q.price*10,quoteHistory:synthetic.map(r=>({...r,price:r.price*10}))});
 assert.ok(Math.abs(scaled.predictedPrice/thirty.predictedPrice-10)<1e-9);
});
test('phase sensitivity keeps separate diagnostic cohorts and reproduces the original zero-phase cycles',()=>{
 const cohorts=dynamicsPhaseSensitivity(rows,60000),r=horizonStudy(rows,60000).results.horizon_dynamics;
 assert.equal(cohorts.length,12);assert.equal(cohorts[0].offsetMs,0);
 for(const key of ['signals','wins','losses','ties','unknown','rate'])assert.equal(cohorts[0][key],r[key],key);
 assert.ok(cohorts.every(c=>c.signals===c.wins+c.losses+c.ties+c.unknown));
 assert.ok(Math.min(...cohorts.map(c=>c.rate))<cohorts[0].rate);
});
