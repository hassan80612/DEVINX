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

test('Laser workspace has separate Visualização and Controle tabs',async()=>{
  const panel=await readFile('src/components/LaserControlMasterPanel.tsx','utf8');
  assert.match(panel,/>Visualização<\/button>/);
  assert.match(panel,/>Controle<\/button>/);
  assert.match(panel,/LIGHTBURN · VISUALIZAÇÃO REMOTA/);
});

test('fullscreen and touch control are exposed without direct Edge calls',async()=>{
  const panel=await readFile('src/components/LaserControlMasterPanel.tsx','utf8');
  assert.match(panel,/Tela cheia/);
  assert.match(panel,/Controle por toque/);
  assert.match(panel,/action:'tap'/);
  assert.doesNotMatch(panel,/laser-agent-preview-control/);
});

test('physical controls remain disabled',async()=>{
  const panel=await readFile('src/components/LaserControlMasterPanel.tsx','utf8');
  for(const label of ['Frame','Iniciar','Pausar','Parar']){
    assert.match(panel,new RegExp('disabled[^>]*>[^<]*<span>[^<]*<\\/span><b>'+label+'<\\/b>'));
  }
});

test('preview session stops when viewer leaves the tab',async()=>{
  const panel=await readFile('src/components/LaserControlMasterPanel.tsx','utf8');
  assert.match(panel,/active:false/);
  assert.match(panel,/keepalive:true/);
});
