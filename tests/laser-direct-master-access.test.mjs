import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('direct Laser Control route is master-only',async()=>{
  const route=await readFile('src/app/laser-control/page.tsx','utf8');
  const guard=await readFile('src/features/laser-control/server/master-access.ts','utf8');
  assert.match(route,/getLaserMasterAccess/);
  assert.match(route,/redirect\('\/entrar\?next=\/laser-control'\)/);
  assert.match(route,/notFound\(\)/);
  assert.match(route,/index:false/);
  assert.match(guard,/get_devinx_access_status/);
  assert.match(guard,/access\?\.is_admin/);
});
