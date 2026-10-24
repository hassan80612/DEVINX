import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {brokerMaintenanceCadenceMs} from '../sentinel-trading-lab/agent/worker/broker-maintenance-cadence.mjs';
const t=1800000000000;
const ready=()=>({activeId:123,lastQuoteAt:t-500,candles:Array(90).fill({close:1.2}),
 quote:1.202,balance:100,candleIntegrity:{ok:true}});
test('healthy passive broker feed minimizes intrusive DOM maintenance',()=>{
 assert.equal(brokerMaintenanceCadenceMs({state:ready(),now:t}),8000);
});
test('quote becomes stale and browser maintenance accelerates immediately',()=>{
 const st=ready();
 for(const age of [2501,30000,120000]){
  st.lastQuoteAt=t-age;
  assert.equal(brokerMaintenanceCadenceMs({state:st,now:t}),2500);
 }
});
test('missing quote, candles, balance or verified asset keeps legacy fast recovery',()=>{
 for(const key of ['activeId','lastQuoteAt','candles','quote','balance','candleIntegrity']){
  const st=ready();
  if(key==='candles')st.candles=[];
  else if(key==='candleIntegrity')st.candleIntegrity={ok:false};
  else st[key]=null;
  assert.equal(brokerMaintenanceCadenceMs({state:st,now:t}),2500,key);
 }
});
test('never alters broker click/expiry, order execution, watchdog or user stops',()=>{
 const broker=readFileSync(new URL('../sentinel-trading-lab/agent/worker/signal-executor.mjs',import.meta.url),'utf8');
 const path=readFileSync(new URL('../sentinel-trading-lab/agent/worker/broker-maintenance-cadence.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(broker,/brokerMaintenanceCadenceMs/);
 assert.doesNotMatch(path,/page\.evaluate|click\(|setInterval|setTimeout|fetch\(/);
 const index=readFileSync(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');
 assert.match(index,/const maintenanceCadence=brokerMaintenanceCadenceMs/);
 assert.match(index,/executor\.pulse\(\);/);
});
