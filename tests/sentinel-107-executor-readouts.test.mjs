import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {executorReadoutKey,patchExecutorReadouts} from '../sentinel-trading-lab/agent/worker/executor-readouts.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
const wl='[data-sentinel-executor-wl]',balance='[data-sentinel-executor-broker-balance]';
test('balance and confirmed result changes have their own refresh key; quote changes do not',()=>{
 const state={provider:'exnova',sessionWins:1,sessionLosses:2,brokerBalance:{amount:100,receivedAt:1,revision:1}};
 const key=executorReadoutKey(state);
 assert.equal(executorReadoutKey({...state,quote:2}),key);
 assert.notEqual(executorReadoutKey({...state,sessionWins:2}),key);
 assert.notEqual(executorReadoutKey({...state,sessionLosses:3}),key);
 assert.notEqual(executorReadoutKey({...state,brokerBalance:{amount:90,receivedAt:2,revision:2}}),key);
});
test('readouts update independently, preserve input and reject delayed older frames',()=>{
 const input={value:'50',focused:true},nodes=new Map([[wl,{textContent:'WIN: 0 / LOSS: 0'}],[balance,{textContent:'100'}]]);
 let templates=0;
 const root={querySelector:selector=>nodes.get(selector)||null};
 // Browser parsing is represented by a fixture map. The function is run as
 // serialized Playwright code; it cannot close over Agent/Node functions.
 const document={getElementById:id=>{assert.equal(id,'sentinel-trading-overlay-host');return{shadowRoot:root}},
  createElement:tag=>{assert.equal(tag,'template');templates++;let parsed;
   return {set innerHTML(value){parsed=JSON.parse(value)},content:{querySelector:selector=>parsed[selector]?{textContent:parsed[selector]}:null}}}};
 const sandbox={window:{},document};
 const apply=frame=>runInNewContext('('+patchExecutorReadouts.toString()+')(frame)',{...sandbox,frame});
 apply({revision:2,html:JSON.stringify({[wl]:'WIN: 1 / LOSS: 2',[balance]:'90'})});
 assert.equal(nodes.get(wl).textContent,'WIN: 1 / LOSS: 2');assert.equal(nodes.get(balance).textContent,'90');
 apply({revision:1,html:JSON.stringify({[wl]:'WIN: 0 / LOSS: 0'})});
 assert.equal(nodes.get(wl).textContent,'WIN: 1 / LOSS: 2');assert.equal(templates,1);
 nodes.get(wl).textContent='old full overlay';sandbox.window.__sentinelApplyExecutorReadouts();
 assert.equal(nodes.get(wl).textContent,'WIN: 1 / LOSS: 2');
 assert.deepEqual(input,{value:'50',focused:true});
});
test('driver sends a small executor panel without invoking broker maintenance or full overlay',async()=>{
 const driver=new LocalPlaywrightDriver({dataDir:'unused-readout-test'});let calls=0;
 driver.sessions.set('exnova',{page:{evaluate:async(fn,frame)=>{
  calls++;assert.equal(fn,patchExecutorReadouts);assert.ok(frame.html.length<14000);
  assert.match(frame.html,/WIN: 2 \/ LOSS: 3/);assert.equal(frame.revision,9);
 }}});
 driver.updateOverlay=()=>{throw Error('must not rebuild full overlay')};
 driver.maintain=()=>{throw Error('must not read broker')};
 await driver.updateExecutorReadouts('exnova',{revision:9,state:{provider:'exnova',config:{stopLoss:50,stopWin:150},sessionWins:2,sessionLosses:3}});
 assert.equal(calls,1);
});
