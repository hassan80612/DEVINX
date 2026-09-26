import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('agent pairing offer verifies a signed proof before storage',async()=>{
  const source=await readFile('supabase/functions/laser-agent-pairing-offer/index.ts','utf8');
  assert.match(source,/verifyLaserPairingProof/);
  assert.match(source,/laser_internal_store_pairing_offer/);
  assert.doesNotMatch(source,/console\.log\(.*proof/);
});

test('master pairing claim requires user auth and admin lookup',async()=>{
  const source=await readFile('supabase/functions/laser-master-pairing-claim/index.ts','utf8');
  assert.match(source,/auth:"user"/);
  assert.match(source,/devinx_admin_users/);
  assert.match(source,/laser_internal_claim_pairing/);
});

test('pairing status requires signed temporary proof',async()=>{
  const source=await readFile('supabase/functions/laser-agent-pairing-status/index.ts','utf8');
  assert.match(source,/verifyLaserPairingProof/);
  assert.match(source,/laser_internal_pairing_status/);
});

test('edge functions do not hardcode a secret key',async()=>{
  for(const path of [
    'supabase/functions/laser-agent-pairing-offer/index.ts',
    'supabase/functions/laser-agent-pairing-status/index.ts',
    'supabase/functions/laser-master-pairing-claim/index.ts',
    'supabase/functions/_shared/laser-pairing.ts'
  ]){
    const source=await readFile(path,'utf8');
    assert.doesNotMatch(source,/sb_secret_[A-Za-z0-9_-]+/);
    assert.doesNotMatch(source,/service_role\s*[:=]\s*['"][A-Za-z0-9_.-]+/);
  }
});
