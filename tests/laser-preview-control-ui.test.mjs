import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Laser preview uses same-origin master endpoint',async()=>{
  const panel=await readFile('src/components/LaserControlMasterPanel.tsx','utf8');
  const route=await readFile('src/app/api/laser-control/master/preview/route.ts','utf8');
  assert.match(panel,/\/api\/laser-control\/master\/preview/);
  assert.doesNotMatch(panel,/laser-agent-preview-upload/);
  assert.match(route,/laser-master-preview/);
});

test('Laser workspace keeps Visualização and Controle separate',async()=>{
  const panel=await readFile('src/components/LaserControlMasterPanel.tsx','utf8');
  assert.match(panel,/>Visualização<\/button>/);
  assert.match(panel,/>Controle<\/button>/);
  assert.match(panel,/LIGHTBURN · AO VIVO/);
  assert.match(panel,/Tela cheia/);
});

test('touch experiment is removed',async()=>{
  const panel=await readFile('src/components/LaserControlMasterPanel.tsx','utf8');
  const route=await readFile('src/app/api/laser-control/master/preview/route.ts','utf8');
  assert.doesNotMatch(panel,/Controle por toque/);
  assert.doesNotMatch(panel,/action:'tap'/);
  assert.doesNotMatch(route,/action==='touch'/);
  assert.doesNotMatch(route,/action==='tap'/);
});

test('dedicated controls use same-origin command route',async()=>{
  const panel=await readFile('src/components/LaserControlMasterPanel.tsx','utf8');
  const route=await readFile('src/app/api/laser-control/master/command/route.ts','utf8');
  assert.match(panel,/\/api\/laser-control\/master\/command/);
  for(const label of ['Frame seleção','Iniciar','Pausar','Parar'])assert.match(panel,new RegExp(label));
  assert.match(route,/laser-master-command/);
  assert.doesNotMatch(panel,/functions\/v1\/laser-master-command/);
});

test('preview session stops when viewer leaves the tab',async()=>{
  const panel=await readFile('src/components/LaserControlMasterPanel.tsx','utf8');
  assert.match(panel,/active:false/);
  assert.match(panel,/keepalive:true/);
});
