import test from 'node:test';import assert from 'node:assert/strict';
import {sequenceConsumptionRuntime} from '../experiments/sequence-consumption-runtime-20261019.mjs';
import {observedLevelSequence as releasedSequence} from '../sentinel-trading-lab/agent/src/core/observed-level-sequence.mjs';
const c=await sequenceConsumptionRuntime();process.on('exit',()=>c.cleanup());
const T=1800000000000;
const step=(previous,t,key='same',side='CALL',provider='iq_option')=>c.advanceNowOpportunity({previous,now:t,quoteAt:t,asset:'EUR/USD',provider,engineId:'automatic',durationMs:30000,candidate:{ready:true,side,observedAt:t,entryPrice:1,setupKey:key}});
test('a consumed setup does not become a new trade when its first 30s window expires',()=>{
 const first=step(null,T);const active=step(first,T+15000,'new','PUT');assert.equal(active.side,'CALL');assert.equal(active.exitAt,T+30000);
 const expired=step(active,T+30000);assert.equal(expired.phase,'scanning');assert.equal(expired.reason,'awaiting-new-structural-setup');assert.equal(step(expired,T+31000).phase,'scanning');
 const fresh=step(expired,T+31001,'new','PUT');assert.equal(fresh.phase,'fired');assert.equal(fresh.side,'PUT');assert.equal(fresh.entryAt,T+31001);
});
test('ordinary routes and changed provider contexts retain the original immediate lifecycle',()=>{
 const first=step(null,T,null);assert.equal(step(first,T+30000,null).phase,'fired');assert.equal(step(step(null,T),T+30000,'same','CALL','exnova').phase,'fired');
});
test('consumed structural memory remains bounded',()=>{
 let s=null;for(let i=0;i<100;i++)s=step(s,T+i*30000,String(i));assert.equal(s.phase,'fired');assert.equal(s.consumedSetups.length,64);
});
test('the actual detector preserves the first structural confirmation rather than renewing it 26 seconds later',()=>{
 const knots=[[-180,1.003],[-60,1.003],[-50,.997],[-40,1.001],[-35,1.002],[-30,1.001],[-25,1.003],[0,1.006]],quotes=[];
 for(let t=-180;t<=0;t++){let i=knots.findIndex(k=>k[0]>=t);if(i===0)i=1;const a=knots[i-1],b=knots[i];quotes.push({ts:T+t*1000,price:a[1]+(b[1]-a[1])*(t-a[0])/(b[0]-a[0]),receivedAt:T+t*1000});}
 const map={observedCandles:100,asOf:T-200000,tolerance:.00001,levels:[{level:1,low:.99999,high:1.00001,confirmedPivots:1,independentTests:2,windows:[3]}]};
 const args={map,quoteHistory:quotes,price:quotes.at(-1).price,quoteAt:T,now:T};
 const old=releasedSequence(args).structureChange,fixed=c.observedLevelSequence(args).structureChange;
 assert.equal(old.confirmedAt,T);assert.equal(fixed.confirmedAt,T-26000);assert.equal(fixed.side,old.side);assert.equal(fixed.brokenAt,old.brokenAt);
});
