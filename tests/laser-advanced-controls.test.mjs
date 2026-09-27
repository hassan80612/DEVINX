import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';


test('Laser Control exposes live layer parameters through Agent 1.0.16',async()=>{
  const panel=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  const css=await readFile('src/components/LaserControlWorkspace.module.css','utf8');
  const i18n=await readFile('src/i18n/laser.ts','utf8');
  assert.match(panel,/event:'control_request'/);
  assert.match(panel,/event:'control_result'/);
  assert.match(panel,/laser\.paramsTitle/);
  assert.match(panel,/laser-agent-v1\.0\.16/);
  assert.match(panel,/select_layer/);
  assert.match(panel,/open_layer/);
  assert.match(css,/\.parameterDock/);
  assert.match(i18n,/DevinX Laser Agent 1\.0\.15/);
});

test('Laser Control navigation tabs render as explicit buttons',async()=>{
  const panel=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  const css=await readFile('src/components/LaserControlWorkspace.module.css','utf8');
  assert.match(panel,/role="tablist"/);
  assert.match(panel,/tabIcon/);
  assert.match(css,/\.tabs button\{[^}]*border:/s);
  assert.match(css,/\.activeTab/);
});
