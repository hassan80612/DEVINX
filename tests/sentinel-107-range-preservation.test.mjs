import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {completedRangeStructure as original} from './fixtures/sentinel-107-completed-range-reference.mjs';
import {completedRangeStructure as candidate,analyzeNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {observedNoise} from '../sentinel-trading-lab/agent/src/core/forward-direction-quality.mjs';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/sentinel-user-video-broker-6dp-20261016.json',import.meta.url)));
const q=fixture.quoteHistory.slice(0,284),point=q.at(-1);
const noiseFor=rows=>observedNoise({quotes:rows,now:rows.at(-1).ts,horizonSeconds:60});
test('preserve original irregular range after latency validation rejects the proposed filter',()=>{
 const old=original(q,point.ts,noiseFor(q),point.price,60000);
 assert.equal(old.ready,true);assert.equal(old.side,'PUT');assert.equal(old.observedSwingSeconds,15);
 const now=candidate(q,point.ts,noiseFor(q),point.price,60000);
 assert.deepEqual(now,old);
 const full=analyzeNowOpportunity({quoteHistory:q,quoteAt:point.ts,now:point.ts,
  price:point.price,durationMs:60000,engineId:'automatic',qualityPolicy:'adaptive-market-v17'});
 assert.equal(full.ready,true);assert.equal(full.side,'PUT');
});
test('preserve the corresponding mirrored CALL too',()=>{
 const rows=q.map(x=>({...x,price:1/x.price})),last=rows.at(-1);
 const old=original(rows,last.ts,noiseFor(rows),last.price,60000);
 assert.equal(old.ready,true);assert.equal(old.side,'CALL');
 assert.deepEqual(candidate(rows,last.ts,noiseFor(rows),last.price,60000),old);
});
test('every recorded prefix preserves exact short-duration and all non-conflicting verdicts',()=>{
 let preserved=0;
 for(let i=100;i<fixture.quoteHistory.length;i++){
  const rows=fixture.quoteHistory.slice(0,i+1),last=rows.at(-1),noise=noiseFor(rows);
  for(const holding of [5000,10000,15000,30000,60000,120000,300000]){
   const old=original(rows,last.ts,noise,last.price,holding);
   const now=candidate(rows,last.ts,noise,last.price,holding);
   assert.deepEqual(now,old);preserved++;
  }
 }
 assert.equal(preserved,6755);console.log('RECORDED_RANGE_SCOPE',JSON.stringify({revised:0,preserved}));
});
test('sustained trends and genuine breakouts preserve the exact original assessment',()=>{
 const T=1800000000000;
 for(const direction of [-1,1]){
  const rows=Array.from({length:181},(_,i)=>({ts:T+i*1000,receivedAt:T+i*1000,
   price:1.1+direction*.000008*i+.000002*Math.sin(i*.5)}));
  for(const holding of [30000,60000,120000,300000]){
   const last=rows.at(-1),noise=noiseFor(rows);
   assert.deepEqual(candidate(rows,last.ts,noise,last.price,holding),original(rows,last.ts,noise,last.price,holding));
  }
 }
});
test('a confirmed 50s swing that covers the existing 60s criterion remains eligible',()=>{
 const T=1800000000000,period=95;
 const rows=Array.from({length:181},(_,i)=>({ts:T+i*1000,receivedAt:T+i*1000,
  price:Math.exp(Math.log(1.082)+.00068*Math.sin(2*Math.PI*i/period)+
   .000009*Math.sin(i*1.73)+.000006*Math.cos(i*.45))}));
 const last=rows.at(-1),noise=noiseFor(rows);
 const old=original(rows,last.ts,noise,last.price,60000);
 assert.equal(old.ready,true);assert.equal(old.observedSwingSeconds,50);
 assert.deepEqual(candidate(rows,last.ts,noise,last.price,60000),old);
});
