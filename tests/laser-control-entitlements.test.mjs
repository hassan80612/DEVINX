import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('commercial limits are centralized in Laser domain',async()=>{
  const source=await readFile('src/features/laser-control/entitlements.ts','utf8');
  assert.match(source,/pc_limit/);
  assert.match(source,/machine_limit/);
  assert.match(source,/mobile_limit/);
  assert.match(source,/operator_limit/);
  assert.match(source,/LASER_PLANS/);
});

test('remote start requires local arm in policy',async()=>{
  const source=await readFile('src/features/laser-control/session-policy.ts','utf8');
  assert.match(source,/localArmUntil/);
  assert.match(source,/local_arm_required/);
  assert.match(source,/remoteControlEnabled/);
});

test('foundation still hard-disables remote command dispatch',async()=>{
  const source=await readFile('src/features/laser-control/protocol.ts','utf8');
  assert.match(source,/LASER_REMOTE_COMMANDS_ENABLED=false/);
});
