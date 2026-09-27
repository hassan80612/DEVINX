import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Laser Control uses Agent 1.0.23 for advanced controls',async()=>{
  const panel=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  const css=await readFile('src/components/LaserControlWorkspace.module.css','utf8');
  const i18n=await readFile('src/i18n/laser.ts','utf8');
  assert.match(panel,/event:'control_request'/);
  assert.match(panel,/event:'control_result'/);
  assert.match(panel,/laser-agent-v1\.0\.23/);
  assert.match(panel,/dialog_confirm/);
  assert.match(panel,/dialog_cancel/);
  assert.match(panel,/dialog_close/);
  assert.match(panel,/select_layer/);
  assert.match(panel,/open_layer/);
  assert.match(css,/\.parameterDock/);
  assert.match(i18n,/DevinX Laser Agent 1\.0\.23/);
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

test('Laser fullscreen uses only the live preview and never shrinks it for controls',async()=>{
  const css=await readFile('src/components/LaserControlWorkspace.module.css','utf8');
  const panel=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  assert.match(panel,/previewSurfaceRef\.current\?\.requestFullscreen\(\)/);
  assert.doesNotMatch(panel,/livePaneRef\.current\?\.requestFullscreen/);
  assert.match(css,/\.previewSurface:fullscreen\{[^}]*width:100vw;[^}]*height:100dvh/s);
  assert.doesNotMatch(css,/\.livePane:fullscreen \.previewSurface/);
});

test('Agent source and immutable release workflow live on main',async()=>{
  const pairing=await readFile('laser-agent/PairingProofFactory.cs','utf8');
  const bridge=await readFile('laser-agent/LightBurnControlBridge.cs','utf8');
  const workflow=await readFile('.github/workflows/laser-agent-check.yml','utf8');
  assert.match(pairing,/AgentVersion = "1\.0\.23"/);
  assert.match(bridge,/GetLayersJsonAsync/);
  assert.match(bridge,/DialogAction/);
  assert.match(workflow,/branches:\s*\n\s*- main/);
  assert.doesNotMatch(workflow,/--clobber/);
});


test('LightBurn 1.7 UIA fallback handles legacy layer state and left-side rotary editors',async()=>{
  const bridge=await readFile('laser-agent/LightBurnControlBridge.cs','utf8');
  assert.match(bridge,/StateSystemSelected=0x2/);
  assert.match(bridge,/StateSystemFocused=0x4/);
  assert.match(bridge,/LayerIdFromNode/);
  assert.match(bridge,/node\.SearchText/);
  assert.match(bridge,/x\.Rect\.Right<label\.node\.Rect\.Left/);
  assert.match(bridge,/Tamanho da divisão/);
  assert.match(bridge,/Velocidade mín\./);
  assert.match(bridge,/Inverter sentido do rotativo/);
  assert.match(bridge,/unique\.Length==1/);
});

test('Laser Control does not expose raw Agent reason codes to the operator',async()=>{
  const panel=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  assert.match(panel,/selected_layer_not_found\|layer_not_found/);
  assert.match(panel,/laser\.paramsNoLayer/);
  assert.doesNotMatch(panel,/setControlError\(String\(payload\?\.reason/);
});


test('mobile mentoring keyboard and dialog controls stay available over live preview',async()=>{
  const panel=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  const css=await readFile('src/components/LaserControlWorkspace.module.css','utf8');
  assert.match(panel,/mobileKeyboardRef/);
  assert.match(panel,/openMobileKeyboard/);
  assert.match(panel,/type:'text',key:value/);
  assert.match(panel,/Fechar \/ Esc/);
  assert.match(panel,/OK \/ Enter/);
  assert.match(panel,/pendingGuard/);
  assert.match(css,/\.mobileKeyboard/);
});

test('Agent inspects LightBurn raw UIA tree for Qt owner-drawn controls',async()=>{
  const bridge=await readFile('laser-agent/LightBurnControlBridge.cs','utf8');
  assert.match(bridge,/RawViewWalker/);
  assert.match(bridge,/ReadRawNodes/);
  assert.match(bridge,/AppendRawNode/);
  const input=await readFile('laser-agent/LightBurnRemoteInput.cs','utf8');
  assert.match(input,/text\.Take\(256\)/);
});


test('layer discovery remains available across dialog and owner-drawn LightBurn layouts',async()=>{
  const bridge=await readFile('laser-agent/LightBurnControlBridge.cs','utf8');
  assert.match(bridge,/GetMainRoot/);
  assert.match(bridge,/FindPaletteLayerNode/);
  assert.match(bridge,/PaletteLayerIdFromNode/);
  assert.match(bridge,/NearMainWindowEdge/);
  assert.match(bridge,/ClearWorkspaceSelection/);
  assert.match(bridge,/C\\d\{2\}\|T1\|T2/);
  assert.doesNotMatch(bridge,/show C00 as a safe default/);
});


test('live D-pad is beside the preview and Agent focuses the LightBurn workspace',async()=>{
  const panel=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  const css=await readFile('src/components/LaserControlWorkspace.module.css','utf8');
  const input=await readFile('laser-agent/LightBurnRemoteInput.cs','utf8');
  assert.match(panel,/styles\.dPad/);
  assert.match(panel,/workspacekeydown/);
  assert.match(panel,/runWorkspaceKey/);
  assert.match(css,/\.dPadUp\{grid-area:up\}/);
  assert.match(input,/"workspacekeydown"=>WorkspaceKeyboard/);
  assert.match(input,/PostMessage\(main,message/);
});

test('layer selection is never invented when LightBurn does not report an active layer',async()=>{
  const bridge=await readFile('laser-agent/LightBurnControlBridge.cs','utf8');
  const panel=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  assert.doesNotMatch(bridge,/layers\.Length==1&&!layers\[0\]\.Selected/);
  assert.match(panel,/laser\.paramsChooseLayer/);
  assert.match(panel,/openCurrentLayerEditor/);
});
