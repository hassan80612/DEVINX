import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Laser master status endpoint exists and is master-gated',async()=>{
  const source=await readFile('src/app/api/laser-control/master/status/route.ts','utf8');
  assert.match(source,/getLaserMasterAccess/);
  assert.match(source,/!access\.authenticated\|\|!access\.allowed/);
  assert.match(source,/remoteCommandsEnabled:false/);
  assert.match(source,/storageConnected:true/);
  assert.match(source,/pairingEnabled:true/);
  assert.match(source,/Cache-Control/);
});

test('Laser master panel status fetch points to the existing endpoint',async()=>{
  const source=await readFile('src/components/LaserControlMasterPanel.tsx','utf8');
  assert.match(source,/fetch\('\/api\/laser-control\/master\/status'/);
});
