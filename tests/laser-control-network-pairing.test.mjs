import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('network pairing is fail-closed until storage is ready',async()=>{
  const offer=await readFile('src/app/api/laser-control/agent/pairing-offer/route.ts','utf8');
  const claim=await readFile('src/app/api/laser-control/master/claim-pairing/route.ts','utf8');
  assert.match(offer,/status:503/);
  assert.match(offer,/laser_pairing_storage_not_ready/);
  assert.match(claim,/status:503/);
  assert.match(claim,/getLaserControlMasterSession/);
  assert.match(claim,/laser_pairing_storage_not_ready/);
});
