import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Laser guide is detailed, localized and current for Agent 1.0.33',async()=>{
  const copy=await readFile('src/app/laser-control/guia/guide-copy.ts','utf8');
  const ui=await readFile('src/app/laser-control/guia/LaserGuideContent.tsx','utf8');
  for(const locale of ['"pt-BR"','"en"','"es"','"fr"','"de"','"ar"'])assert.ok(copy.includes(locale));
  assert.match(ui,/LanguageMenu/);
  assert.match(ui,/\/api\/laser-control\/agent-download/);
  assert.doesNotMatch(ui,/github\.com\/hassan80612\/DEVINX\/releases\/download\/laser-agent-v1\.0\.32\/DevinX-Laser-Agent/);
  assert.match(copy,/Sair da tela cheia não deve desligar o controle/);
  assert.match(copy,/Frame \/ Encerrar/);
  assert.doesNotMatch(copy,/INICIAR-MENTORIA\.cmd/);
  assert.match(copy,/DevinX-Mentoria-1\.0\.32\.exe/);
  assert.match(copy,/heartbeat/);
  assert.match(copy,/SmartScreen/);
});


test('guide exposes a clear home button and a highlighted student access button',async()=>{
  const ui=await readFile('src/app/laser-control/guia/LaserGuideContent.tsx','utf8');
  const css=await readFile('src/app/laser-control/guia/page.module.css','utf8');
  assert.match(ui,/className=\{styles\.homeButton\} href="\/"/);
  assert.match(ui,/className=\{styles\.studentButton\} href="\/laser-control\/mentoria"/);
  assert.match(ui,/"pt-BR":"Página inicial"/);
  assert.match(ui,/"pt-BR":"Acesso do aluno"/);
  assert.match(css,/\.studentButton\{/);
  assert.match(css,/\.homeButton\{/);
});
