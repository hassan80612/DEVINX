import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Laser master actions stay same-origin',async()=>{
  const panel=await readFile('src/components/LaserControlMasterPanel.tsx','utf8');
  assert.doesNotMatch(panel,/createClient\(\)\.functions\.invoke/);
  assert.match(panel,/\/api\/laser-control\/master\/claim/);
  assert.match(panel,/\/api\/laser-control\/master\/devices/);
  assert.match(panel,/\/api\/laser-control\/master\/device-access/);
});

test('quick connect requires master and one explicit confirmation',async()=>{
  const page=await readFile('src/app/laser-control/connect/page.tsx','utf8');
  const client=await readFile('src/components/LaserQuickConnect.tsx','utf8');
  assert.match(page,/getLaserMasterAccess/);
  assert.match(page,/if\(!access\.allowed\)notFound\(\)/);
  assert.match(client,/Vincular este PC/);
  assert.match(client,/\/api\/laser-control\/master\/claim/);
});

test('protected redirect preserves pairing query string',async()=>{
  const middleware=await readFile('src/middleware.ts','utf8');
  assert.match(middleware,/requestedPath=pathname\+request\.nextUrl\.search/);
});
