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
test('lightweight readouts update existing text; focused input, last good WIN/LOSS and revision survive',()=>{
 const input={value:'50',focused:true};
 const nodes=new Map([[wl,{textContent:'WIN: 0 / LOSS: 0'}],[balance,{textContent:'100'}]]);
 const root={querySelector:selector=>nodes.get(selector)||null};
 const document={getElementById:id=>{assert.equal(id,'sentinel-trading-overlay-host');return{shadowRoot:root}},
   createElement:()=>{throw Error('broker HTML parsing forbidden')}};
 const sandbox={window:{},document};
 const apply=frame=>runInNewContext('('+patchExecutorReadouts.toString()+')(frame)',{...sandbox,frame});
 apply({revision:2,readout:{winLoss:'WIN: 1 / LOSS: 2',brokerBalance:'90'}});
 assert.equal(nodes.get(wl).textContent,'WIN: 1 / LOSS: 2');
 assert.equal(nodes.get(balance).textContent,'90');
 apply({revision:1,readout:{winLoss:'WIN: 0 / LOSS: 0'}});
 assert.equal(nodes.get(wl).textContent,'WIN: 1 / LOSS: 2');
 nodes.get(wl).textContent='old full overlay';
 sandbox.window.__sentinelApplyExecutorReadouts();
 assert.equal(nodes.get(wl).textContent,'WIN: 1 / LOSS: 2');
 assert.deepEqual(input,{value:'50',focused:true});
});
test('driver sends compact WIN/LOSS and balance receipt without broker maintenance, account reads or full overlay',async()=>{
 const driver=new LocalPlaywrightDriver({dataDir:'unused-readout-test'});let calls=0;
 driver.sessions.set('exnova',{page:{evaluate:async(fn,frame)=>{
  calls++;assert.equal(fn,patchExecutorReadouts);assert.equal(frame.readout.winLoss,'WIN: 2 / LOSS: 3');
  assert.equal(frame.revision,9);assert.equal(frame.html,undefined);
  assert.ok(JSON.stringify(frame).length<2000);
 }}});
 driver.updateOverlay=()=>{throw Error('must not rebuild full overlay')};
 driver.maintain=()=>{throw Error('must not read broker')};
 await driver.updateExecutorReadouts('exnova',{revision:9,state:{provider:'exnova',config:{stopLoss:50,stopWin:150},sessionWins:2,sessionLosses:3}});
 assert.equal(calls,1);
});
