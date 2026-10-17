import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmations} from '../scripts/sentinel-13931-audit.mjs';
const T=1792169000000;
const observation=(seconds,side='CALL',ready=true)=>({q:{ts:T+seconds*1000,price:1.1},
 candidate:{ready,side,observedAt:T+seconds*1000,entryPrice:1.1,reason:'controlled'}});
test('confirmation uses only past observations and starts a fresh 30-second duration on emission',()=>{
 const first=[0,1,2,3,4].map(s=>observation(s));
 assert.equal(confirmations(first.slice(0,2),{delayMs:2000}).length,0);
 const entries=confirmations(first,{delayMs:2000});
 assert.equal(entries.length,1);assert.equal(entries[0].entryAt,T+2000);
 assert.equal(entries[0].exitAt,T+32000);
 assert.deepEqual(confirmations([...first,observation(5,'PUT')],{delayMs:2000}),entries);
});
test('a gap, opposing direction or unready observation restarts confirmation',()=>{
 for(const rows of [
  [observation(0),observation(1),observation(3),observation(4)],
  [observation(0),observation(1),observation(2,'PUT'),observation(3)],
  [observation(0),observation(1),observation(2,'CALL',false),observation(3)]])
  assert.equal(confirmations(rows,{delayMs:2000}).length,0);
});
