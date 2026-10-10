import test from 'node:test';
import assert from 'node:assert/strict';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {LatestOverlayScheduler} from '../sentinel-trading-lab/agent/worker/latest-overlay-scheduler.mjs';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('quote-driven tick avoids double full status serialization but preserves public tick response',async()=>{
 const runtime=new DemoTradingRuntime();
 const previous=runtime.lastResult;
 runtime.status=async()=>{throw Error('heavy status must not be called');};
 assert.strictEqual(await runtime.tick(Date.now(),{skipStatus:true}),previous);
 runtime.status=async()=>({kind:'public-status'});
 assert.deepEqual(await runtime.tick(Date.now()),{kind:'public-status'});
});

test('urgent CALL/PUT card update bypasses prior slow-render cooldown without concurrency',async()=>{
 const frames=[];let concurrent=0,maxConcurrent=0;
 const scheduler=new LatestOverlayScheduler(async(provider,data)=>{
   concurrent++;maxConcurrent=Math.max(maxConcurrent,concurrent);
   frames.push({provider,side:data.side,at:Date.now()});
   await delay(5);concurrent--;
 },{minIntervalMs:1200,slowThresholdMs:1,slowCooldownMs:3000});
 try{
   scheduler.publish('exnova',{side:'WAIT'},{urgent:true});
   await delay(80);
   assert.equal(frames.length,1);
   scheduler.publish('exnova',{side:'CALL'},{urgent:true});
   await delay(450);
   assert.equal(frames.length,2,'urgent CALL should not wait for 3000ms slow cooldown');
   assert.equal(frames[1].side,'CALL');
   assert.equal(maxConcurrent,1);
   assert.ok(scheduler.metrics().urgentRenderCount>=2);
 }finally{if(scheduler.timer)clearTimeout(scheduler.timer)}
});
test('coalescing retains urgency if a passive quote arrives after pending PUT',()=>{
 const scheduler=new LatestOverlayScheduler(async()=>{},{minIntervalMs:1200,slowCooldownMs:3000});
 scheduler.running=true;
 scheduler.publish('iq_option',{side:'PUT'},{urgent:true});
 scheduler.publish('iq_option',{side:'PUT',quote:2},{urgent:false});
 assert.equal(scheduler.pending.urgent,true);
 assert.equal(scheduler.pending.data.quote,2);
 scheduler.pending=null;scheduler.running=false;
});
