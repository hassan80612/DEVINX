import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Laser guide is detailed, localized and current for Agent 1.0.26',async()=>{
  const copy=await readFile('src/app/laser-control/guia/guide-copy.ts','utf8');
  const ui=await readFile('src/app/laser-control/guia/LaserGuideContent.tsx','utf8');
  for(const locale of ['"pt-BR"','"en"','"es"','"fr"','"de"','"ar"'])assert.ok(copy.includes(locale));
  assert.match(ui,/LanguageMenu/);
  assert.match(ui,/DevinX-Laser-Agent-1\.0\.26\.zip/);
  assert.match(copy,/Sair da tela cheia não deve desligar o controle/);
  assert.match(copy,/Frame \/ Encerrar/);
  assert.match(copy,/INICIAR-MENTORIA\.cmd/);
  assert.match(copy,/heartbeat/);
  assert.match(copy,/SmartScreen/);
});
