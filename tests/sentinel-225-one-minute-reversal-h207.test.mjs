import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {reviewH207UnifiedAdmission} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const path=new URL('../sentinel-trading-lab/agent/src/core/runtime.mjs',import.meta.url);
const sha=s=>createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0'+s).digest('hex');
test('225 UI only: actual execution logic exactly matches published 224 by Git blob SHA',()=>{
 assert.equal(sha(readFileSync(path,'utf8')),'1f4a453b3c5609a50dd0c7b36687e0ae26fc2d8d');
});
test('225 UI only: H207 preserves structural reversal refusal at both 30s and 1m',()=>{
 for(const durationMs of [30000,60000]){
  for(const side of ['CALL','PUT']){
   const proposed={ready:true,side,reason:'confirmed-level-structure-reversal',
     observedAt:1800000010000,entryPrice:1.1,
     earlyTurnEvidence:{kind:'level-microstructure-first-turn',withoutThreeClosedBars:true}};
   const result=reviewH207UnifiedAdmission({candidate:proposed,quoteAt:1800000010000,now:1800000010000,
     price:1.1,durationMs,quoteHistory:[]});
   assert.equal(result.ready,false);
   assert.equal(result.side,null);
   assert.equal(result.entryRisk.kind,'h207-structural-reversal-excluded');
  }
 }
});
test('225 UI only: no new expiry or continuation timing policy at 5m',()=>{
 const c={ready:true,side:'CALL',reason:'confirmed-level-structure-reversal'};
 assert.equal(reviewH207UnifiedAdmission({candidate:c,quoteAt:1000,now:1000,durationMs:300000}),c);
 const continuation={ready:true,side:'CALL',reason:'closed-structure-and-live-impulse'};
 assert.equal(reviewH207UnifiedAdmission({candidate:continuation,quoteAt:1000,now:1000,durationMs:60000}),continuation);
});
