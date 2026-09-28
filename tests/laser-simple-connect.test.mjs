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


test('permanent pairing requires owner access and delegates PC capacity to the database',async()=>{
  const route=await readFile('src/app/api/laser-control/master/claim/route.ts','utf8');
  const migration=await readFile('supabase/migrations/20260928211040_laser_pc_addons_and_cycle_security.sql','utf8');
  assert.match(route,/getLaserControlAccess/);
  assert.match(route,/!access\.isAdmin&&!access\.ownerAccess/);
  assert.match(route,/laser-master-pairing-claim/);
  assert.doesNotMatch(route,/laser-master-device-access/);
  assert.doesNotMatch(route,/laser-master-devices/);
  assert.match(migration,/for update/);
  assert.match(migration,/v_ent\.max_pcs/);
  assert.match(migration,/laser_pc_limit_reached/);
  assert.match(migration,/if v_ent\.max_pcs=1 then/);
});

test('extra PC capacity is cycle-bound and pairing stays atomic',async()=>{
  const migration=await readFile('supabase/migrations/20260928211040_laser_pc_addons_and_cycle_security.sql','utf8');
  assert.match(migration,/pc_addon_orders/);
  assert.match(migration,/laser_internal_current_paid_cycle/);
  assert.match(migration,/o\.expires_at>now\(\)/);
  assert.match(migration,/renewal_carries_over','false|renewal_carries_over',false/);
  assert.match(migration,/laser_internal_recompute_pc_capacity/);
});
