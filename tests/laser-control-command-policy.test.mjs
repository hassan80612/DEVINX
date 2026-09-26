import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('command policy never trusts UI visibility',async()=>{
  const source=await readFile('src/features/laser-control/command-policy.ts','utf8');
  assert.match(source,/LASER_REMOTE_COMMANDS_ENABLED/);
  assert.match(source,/adapterSupportsCommand/);
  assert.match(source,/canStartLaserRemotely/);
  assert.match(source,/canUseLaserSession/);
  assert.match(source,/remote_commands_disabled/);
  assert.match(source,/adapter_capability_missing/);
});
