import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewH207UnifiedAdmission} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';

const candidate=(at,reason='historical-level-breakout',side='CALL')=>({
 ready:true,side,reason,observedAt:at,entryPrice:1.1006
});
const tape=(at,ms)=>[
 {ts:at-ms,receivedAt:at-ms,price:1.1008},
 {ts:at-5000,receivedAt:at-5000,price:1.1005},
 {ts:at,receivedAt:at,price:1.1006}
];
const admit=(at,ms,candidateOverride=null)=>reviewH207UnifiedAdmission({
 candidate:candidateOverride||candidate(at),
 quoteHistory:tape(at,ms),quoteAt:at,now:at,
 price:1.1006,durationMs:ms
});
for(const [seconds,lateAt,earlyAt] of [
 [30,1800000019000,1800000009000],
 [60,1800000040000,1800000010000]
]){
 test('H207 '+seconds+'s blocks late contradictory breakout',()=>{
  const blocked=admit(lateAt,seconds*1000);
  assert.equal(blocked.ready,false);
  assert.equal(blocked.provisionalSide,'CALL');
  assert.equal(blocked.entryRisk.kind,'h207-late-breakout-contradiction');
 });
 test('H207 '+seconds+'s allows early breakout without blanket delay',()=>{
  assert.equal(admit(earlyAt,seconds*1000).ready,true);
 });
 test('H207 '+seconds+'s disables weak confirmed structural reversals',()=>{
  const blocked=admit(earlyAt,seconds*1000,candidate(earlyAt,'confirmed-level-structure-reversal'));
  assert.equal(blocked.ready,false);
  assert.equal(blocked.entryRisk.kind,'h207-structural-reversal-excluded');
 });
}
test('H207 preserves original 5-minute admission',()=>{
 const at=1800000040000,original=candidate(at,'confirmed-level-structure-reversal');
 assert.strictEqual(admit(at,300000,original),original);
});
test('H207 does not modify direction or expiry of eligible impulse',()=>{
 const at=1800000040000,original=candidate(at,'closed-structure-and-live-impulse');
 assert.strictEqual(admit(at,60000,original),original);
});
test('native manual duration is reconciled to saved Agent settings',()=>{
 const driver=readFileSync(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');
 assert.match(driver,/setNativeExpiryChoiceHandler\(/);
 assert.match(driver,/await this\.nativeExpiryChoiceHandler\(provider,ms,selectedAt\)/);
 assert.match(worker,/runtime\.patchSettings\(\{orderDurationMs:ms\},'native-broker-manual-choice'\)/);
 assert.match(worker,/await saveState\(\)/);
});
