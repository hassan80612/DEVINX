import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {brokerMaintenanceCadenceMs} from '../sentinel-trading-lab/agent/worker/broker-maintenance-cadence.mjs';
const now=1800000000000;
const fresh={activeId:123,lastQuoteAt:now-800,candles:Array(50).fill({close:1.1}),quote:1.13,balance:50};
test('healthy websocket chart is not repeatedly scanned in the 200ms prediction loop',()=>{
 assert.equal(brokerMaintenanceCadenceMs({state:fresh,now}),8000);
});
test('unhealthy, absent or stale feeds regain prior 2.5-second recovery schedule',()=>{
 for(const state of [
  null,{...fresh,lastQuoteAt:now-4000},{...fresh,candles:[]},
  {...fresh,balance:null},{...fresh,activeId:null},{...fresh,quote:null},
  {...fresh,lastQuoteAt:now+1000}
 ])assert.equal(brokerMaintenanceCadenceMs({state,now}),2500);
});
test('broker maintenance remains after decision and broker executor, not before',()=>{
 const s=readFileSync(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');
 const tick=s.indexOf('await runtime.tick(loopNow,{skipStatus:true})');
 const dispatch=s.indexOf('executor.pulse();',tick);
 const maintenance=s.indexOf('brokerMaintenanceCadenceMs(',tick);
 assert.ok(tick>=0&&dispatch>tick&&maintenance>dispatch);
 assert.match(s,/scheduleBrokerMaintenance\(activeProvider\)/);
});
test('do not modify broker click and execution flow with this maintenance patch',()=>{
 const worker=readFileSync(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');
 assert.match(worker,/runtime.onNowOpportunity=\(anchor,evidence\)=>\{/);
 assert.match(worker,/executor.pulse\(anchor,evidence\)/);
 assert.doesNotMatch(worker,/await brokerMaintenanceCadenceMs\(/);
});
