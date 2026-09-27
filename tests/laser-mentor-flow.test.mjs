import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('mentor connection is code-only, temporary and server-gated',async()=>{
  const panel=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  const route=await readFile('src/app/api/laser-control/mentor/route.ts','utf8');
  const invoke=await readFile('src/features/laser-control/server/invoke-master-function.ts','utf8');
  assert.match(panel,/action:'claim',code/);
  assert.match(panel,/action:'close',sessionId/);
  assert.match(panel,/connection_mode==='mentor'/);
  assert.match(panel,/mentor_session_id/);
  assert.match(route,/laser-mentor-session/);
  assert.match(invoke,/get_laser_access_status/);
});

test('mobile touch works on the normal preview and double tap opens editing',async()=>{
  const panel=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  assert.match(panel,/refreshRemoteSession/);
  assert.doesNotMatch(panel,/event\.pointerType==='touch'&&!document\.fullscreenElement/);
  assert.match(panel,/sendRemoteInput\(\{type:'doubleclick'/);
  assert.match(panel,/openMobileKeyboard\(\)/);
});

test('Laser workspace is translated through DevinX i18n',async()=>{
  const panel=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  const catalogs=await readFile('src/i18n/catalogs.ts','utf8');
  const laser=await readFile('src/i18n/laser.ts','utf8');
  assert.match(panel,/useI18n/);
  assert.match(catalogs,/laserCatalogs/);
  for(const locale of ["'pt-BR'","en:","es:","fr:","de:","ar:"])assert.ok(laser.includes(locale));
});
