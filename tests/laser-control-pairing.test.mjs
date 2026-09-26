import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('pairing endpoint is master gated and non-persistent',async()=>{
  const source=await readFile('src/app/api/laser-control/master/verify-pairing/route.ts','utf8');
  assert.match(source,/getLaserControlMasterSession/);
  assert.match(source,/verifyLaserPairingProof/);
  assert.match(source,/persisted:false/);
  assert.match(source,/activated:false/);
  assert.doesNotMatch(source,/\.from\(/);
  assert.doesNotMatch(source,/\.rpc\(/);
});

test('agent pairing code is short lived',async()=>{
  const source=await readFile('laser-agent/Program.cs','utf8');
  assert.match(source,/TimeSpan\.FromMinutes\(5\)/);
  assert.match(source,/--pair-devinx/);
});
