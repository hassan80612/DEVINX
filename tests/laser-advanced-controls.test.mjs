import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Laser Control uses Agent 1.0.17 for advanced controls',async()=>{
  const panel=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  const css=await readFile('src/components/LaserControlWorkspace.module.css','utf8');
  const i18n=await readFile('src/i18n/laser.ts','utf8');
  assert.match(panel,/event:'control_request'/);
  assert.match(panel,/event:'control_result'/);
  assert.match(panel,/laser-agent-v1\.0\.17/);
  assert.match(panel,/dialog_confirm/);
  assert.match(panel,/dialog_cancel/);
  assert.match(panel,/dialog_close/);
  assert.match(panel,/select_layer/);
  assert.match(panel,/open_layer/);
  assert.match(css,/\.parameterDock/);
  assert.match(i18n,/DevinX Laser Agent 1\.0\.17/);
});

test('Laser command buttons are not blocked by cached job state',async()=>{
  const panel=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  assert.match(panel,/const canOperate=Boolean/);
  assert.match(panel,/const canStart=canOperate;/);
  assert.match(panel,/const canFrame=canOperate;/);
  assert.match(panel,/const canPause=canOperate;/);
  assert.match(panel,/const canStop=canOperate;/);
});

test('Laser quick controls wait for realtime input readiness',async()=>{
  const panel=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  assert.match(panel,/async function ensureInputReady\(\)/);
  assert.match(panel,/inputReadyRef\.current/);
  assert.match(panel,/if\(!await ensureInputReady\(\)\)/);
  assert.match(panel,/if\(!inputReadyRef\.current\|\|!current\?\.inputToken/);
});

test('Laser fullscreen stays centered instead of jumping on control state',async()=>{
  const css=await readFile('src/components/LaserControlWorkspace.module.css','utf8');
  assert.match(css,/\.previewSurface:fullscreen\{[^}]*overflow:hidden;[^}]*align-items:center;[^}]*justify-content:center/s);
});

test('Agent source and immutable release workflow live on main',async()=>{
  const pairing=await readFile('laser-agent/PairingProofFactory.cs','utf8');
  const bridge=await readFile('laser-agent/LightBurnControlBridge.cs','utf8');
  const workflow=await readFile('.github/workflows/laser-agent-check.yml','utf8');
  assert.match(pairing,/AgentVersion = "1\.0\.17"/);
  assert.match(bridge,/GetLayersJsonAsync/);
  assert.match(bridge,/DialogAction/);
  assert.match(workflow,/branches:\s*\n\s*- main/);
  assert.doesNotMatch(workflow,/--clobber/);
});
