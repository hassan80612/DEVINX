// UI delivery remains at most once; fixed broker parameters are user configured.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setup} from './fixtures/executor-13946.mjs';
test('uncertain click is never retried automatically',async()=>{
 const x=setup();let attempts=0;x.driver.execute=async(p,o)=>{attempts++;o.clicked=true;throw Error('click uncertain');};await x.bot.start();await x.fire();for(let n=0;n<10;n++)await x.fire();assert.equal(attempts,1);assert.equal(x.bot.enabled,false);assert.ok(x.bot.pending);
});
test('pre-click rejection unlocks settings and cannot replay the old signal',async()=>{
 const x=setup();x.driver.execute=async()=>{throw Object.assign(Error('campo inválido'),{beforeClick:true});};await x.bot.start();await x.fire();assert.equal(x.bot.pending,null);assert.equal(x.bot.enabled,false);x.bot.configure({amount:2});await x.bot.start();await x.fire();assert.equal(x.bot.pending,null);
});
test('actual rolling expiration starts at click time and broker acknowledgement remains authoritative',async()=>{
 const x=setup();x.driver.execute=async(p,o)=>{x.advance(700);o.captureEntry();o.clicked=true;return{accepted:true,orderId:'local-1'};};await x.bot.start();const start=x.now();await x.fire();assert.equal(x.bot.pending.exitAt,start+30700);assert.equal(x.bot.net,0);assert.equal(x.bot.pending.executionSource,'broker');
});
test('worker starts a passive order observer and wires all settlement callbacks',()=>{
 const text=readFileSync(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');assert.match(text,/setExecutionObserver\(\(provider,frame,direction\)=>uiExecutor.observe/);assert.match(text,/onSettlement:event=>executor.settle\(event\)/);assert.match(text,/onSent:\(rid,id\)=>executor.sent\(rid,id\)/);
});
