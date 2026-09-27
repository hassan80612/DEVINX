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
