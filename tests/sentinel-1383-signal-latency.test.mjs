import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {quoteScopedCausalPath} from '../sentinel-trading-lab/agent/src/core/quote-scoped-causal-path.mjs';
import {causalForwardPath as closedStructurePath} from '../sentinel-trading-lab/agent/src/core/causal-closed-structure-1379.mjs';
import {LatestOverlayScheduler} from '../sentinel-trading-lab/agent/worker/latest-overlay-scheduler.mjs';

const read=p=>readFileSync(new URL('../sentinel-trading-lab/'+p,import.meta.url),'utf8');
const now=Date.parse('2026-10-14T14:32:00-03:00');
const quotes=Array.from({length:480},(_,i)=>({
 ts:now-(479-i)*1000,receivedAt:now-(479-i)*1000,
 price:1.1171+0.0000025*i+Math.sin(i/14)*0.000035
}));
const base={forecastModel:'causal-closed-structure-1379',quoteHistory:quotes,
 asOf:now,holdingSeconds:30,maxSeconds:60};

test('a second requested fit on exactly the same quote and expiry reuses one calculation',()=>{
 const fit=quoteScopedCausalPath(base);
 assert.equal(fit,quoteScopedCausalPath(base));
 const original=closedStructurePath({quoteHistory:quotes,asOf:now,holdingSeconds:30,maxSeconds:60});
 assert.equal(fit.status,original.status);
 assert.equal(fit.priceAt(30),original.priceAt(30));
 assert.equal(fit.priceAt(60),original.priceAt(60));
});
test('every changed timing, expiry, or new quote invalidates the shared fit',()=>{
 const original=quoteScopedCausalPath(base);
 assert.notEqual(quoteScopedCausalPath({...base,maxSeconds:90}),original);
 assert.notEqual(quoteScopedCausalPath({...base,asOf:now+1000}),original);
 assert.notEqual(quoteScopedCausalPath({...base,holdingSeconds:60}),original);
 const next=[...quotes,{ts:now+1000,receivedAt:now+1000,price:quotes.at(-1).price+.00001}];
 assert.notEqual(quoteScopedCausalPath({...base,quoteHistory:next,asOf:now+1000}),original);
});
test('existing analysis, scheduling and signal confirmation use the exact same shared fit',()=>{
 const main=read('agent/src/core/vnext-single-engine.mjs');
 const schedule=read('agent/src/core/future-entry-schedule.mjs');
 const helper=read('agent/src/core/quote-scoped-causal-path.mjs');
 assert.match(main,/quoteScopedCausalPath\(/);
 assert.ok([...schedule.matchAll(/quoteScopedCausalPath\(/g)].length>=2);
 assert.match(helper,/const cached=memo\.get\(quoteHistory\)/);
 assert.match(helper,/cached\?\.key===key/);
 assert.match(schedule,/brokerAllowsEntry\(\{buyWindow,entryAt:now\}\)/);
 assert.match(schedule,/coherentInterval\(\{entryPrice:entry,exitPrice:exit,noise:actualNoise/);
});
test('urgent broker signal bypasses routine overlay cooldown, without cancelling a rendering operation',async()=>{
 const seen=[];
 const scheduler=new LatestOverlayScheduler(async(_provider,frame)=>{seen.push(frame.seq)},{
   minIntervalMs:10000,slowThresholdMs:800,slowCooldownMs:20000
 });
 scheduler.publish('iq_option',{seq:1});
 await new Promise(resolve=>setTimeout(resolve,100));
 assert.deepEqual(seen,[1]);
 scheduler.publish('iq_option',{seq:2},{urgent:true});
 await new Promise(resolve=>setTimeout(resolve,350));
 assert.deepEqual(seen,[1,2],'urgent CALL/PUT frame must never wait 10 seconds');
 assert.equal(scheduler.metrics().urgentRenderCount,1);
 scheduler.close?.();
});
test('the PC and phone are updated from the source decision before optional render or DB logging',()=>{
 const worker=read('agent/worker/index.mjs');
 const loop=worker.slice(worker.indexOf('let shuttingDown=false;'),worker.indexOf('function brokerStatuses('));
 assert.ok(loop.indexOf('await runtime.tick(loopNow,{skipStatus:true})')>=0);
 assert.ok(loop.indexOf('void publishLiveFrame();',loop.indexOf('await runtime.tick(loopNow,{skipStatus:true})'))<
  loop.indexOf('driver.setPredictionPeriod?.('));
 assert.match(worker,/lastEntryTimingDelayMs/);
});
