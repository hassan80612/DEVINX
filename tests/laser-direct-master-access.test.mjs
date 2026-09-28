import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('direct Laser Control route is entitlement-gated and non-subscribers return to the Laser landing',async()=>{
  const route=await readFile('src/app/laser-control/page.tsx','utf8');
  const guard=await readFile('src/features/laser-control/server/master-access.ts','utf8');
  assert.match(route,/getLaserControlAccess/);
  assert.match(route,/redirect\('\/entrar\?next=\/laser-control'\)/);
  assert.match(route,/if\(!access\.allowed\)redirect\('\/laser-control\/conhecer\?acesso=necessario#planos'\)/);
  assert.match(route,/access\.isAdmin&&/);
  assert.match(route,/index:false/);
  assert.match(guard,/get_laser_access_status/);
  assert.match(guard,/owner_access/);
  assert.match(guard,/mentor_access/);
});
