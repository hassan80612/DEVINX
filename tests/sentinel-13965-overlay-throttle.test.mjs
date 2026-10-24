import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LatestOverlayScheduler} from '../sentinel-trading-lab/agent/worker/latest-overlay-scheduler.mjs';

test('expensive broker overlay redraws are limited to 10 regular updates/minute',()=>{
 const s=new LatestOverlayScheduler(async()=>{});
 assert.equal(s.minIntervalMs,6000);
 assert.equal(s.slowCooldownMs,8000);
 assert.equal(Math.floor(60000/s.minIntervalMs),10);
 assert.ok(s.minIntervalMs>2200,'previous max was about 27 complete broker DOM redraws/min');
});
test('urgent CALL/PUT panel transition bypasses routine slow cooldown and coalesces pending frames',async()=>{
 const frames=[];
 const scheduler=new LatestOverlayScheduler(async(_,data)=>{frames.push(data)},{
  minIntervalMs:6000,slowThresholdMs:800,slowCooldownMs:8000
 });
 scheduler.lastCompleteAt=Date.now()-100;
 scheduler.nextAllowedAt=Date.now()+10000;
 scheduler.publish('exnova',{side:'WAIT',n:1});
 scheduler.publish('exnova',{side:'WAIT',n:2});
 scheduler.publish('exnova',{side:'PUT',n:3},{urgent:true});
 await new Promise(r=>setTimeout(r,65));
 assert.equal(frames.length,1,'new signal must not wait for cosmetic refresh');
 assert.equal(frames[0].side,'PUT');
 assert.equal(frames[0].n,3);
 assert.equal(scheduler.metrics().urgentRenderCount,1);
 assert.equal(scheduler.metrics().coalescedFrames,2);
 clearTimeout(scheduler.timer);
});
test('broker keeps a 250ms local clock and market update feed despite fewer cosmetic renders',()=>{
 const driver=readFileSync('sentinel-trading-lab/agent/worker/local-playwright-driver.mjs','utf8');
 const worker=readFileSync('sentinel-trading-lab/agent/worker/index.mjs','utf8');
 assert.match(driver,/window\.setInterval\(\(\)=>\{[\s\S]{0,180}tickTargetClock\(\);[\s\S]{0,60}\},250\)/);
 assert.match(worker,/driver\.setMarketUpdateHandler\?/);
 assert.match(worker,/const urgentOverlay=overlayActionKey!==lastOverlayActionKey;/);
 assert.match(worker,/overlayUpdates\.publish\(activeProvider,/);
});
