import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Laser permanent pairing stays same-origin and entitlement-gated',async()=>{
  const page=await readFile('src/app/laser-control/connect/page.tsx','utf8');
  const client=await readFile('src/components/LaserQuickConnect.tsx','utf8');
  assert.match(page,/getLaserControlAccess/);
  assert.match(page,/!access\.isAdmin&&!access\.ownerAccess/);
  assert.match(client,/\/api\/laser-control\/master\/claim/);
  assert.match(client,/laser\.pair/);
});

test('protected redirect preserves pairing query string',async()=>{
  const middleware=await readFile('src/middleware.ts','utf8');
  assert.match(middleware,/requestedPath=pathname\+request\.nextUrl\.search/);
});


test('permanent pairing requires owner access and replaces the previous owner PC',async()=>{
  const route=await readFile('src/app/api/laser-control/master/claim/route.ts','utf8');
  assert.match(route,/getLaserControlAccess/);
  assert.match(route,/!access\.isAdmin&&!access\.ownerAccess/);
  assert.match(route,/laser-master-devices/);
  assert.match(route,/connection_mode!==['"]mentor['"]/);
  assert.match(route,/laser-master-pairing-claim/);
  assert.match(route,/laser-master-device-access/);
  assert.match(route,/action:['"]revoke['"]/);
  assert.match(route,/singlePcVerified:true/);
  assert.match(route,/replacedPreviousPc/);
});


test('concurrent permanent pairing fails closed until exactly one owner PC remains active',async()=>{
  const route=await readFile('src/app/api/laser-control/master/claim/route.ts','utf8');
  assert.match(route,/for\(let attempt=0;attempt<3&&!singlePcVerified;attempt\+\+\)/);
  assert.match(route,/active\.length===1&&active\[0\]\.device_id===activeDeviceId/);
  assert.match(route,/single_pc_verification_failed/);
  assert.match(route,/status:409/);
});
