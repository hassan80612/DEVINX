import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Laser Control uses Agent 1.1.0 for advanced controls',async()=>{
  const panel=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  const css=await readFile('src/components/LaserControlWorkspace.module.css','utf8');
  const i18n=await readFile('src/i18n/laser.ts','utf8');
  assert.match(panel,/event:'control_request'/);
  assert.match(panel,/event:'control_result'/);
  assert.match(panel,/\/api\/laser-control\/agent-download/);
  assert.doesNotMatch(panel,/dialog_confirm|dialog_cancel|dialog_close/);
  assert.match(panel,/sendRemoteKey\('Enter','Enter'\)/);
  assert.match(panel,/sendRemoteKey\('Escape','Escape'\)/);
  assert.doesNotMatch(panel,/select_layer|open_layer|refreshParameters|openLayerPanel/);
  assert.doesNotMatch(css,/\.parameterDock|\.parameterGrid|\.layerBar/);
  assert.match(i18n,/DevinX Laser Agent 1\.1\.4/);
});

test('Agent compatibility check accepts later semantic versions without changing 1.0 thresholds',async()=>{
  const panel=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  assert.match(panel,/supportsAgentAtLeast/);
  assert.match(panel,/if\(major!==1\)return major>1/);
  assert.match(panel,/if\(minor!==0\)return minor>0/);
  assert.match(panel,/return patch>=minPatch/);
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
  assert.match(pairing,/AgentVersion = "1\.1\.4"/);
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
});

test('Laser Control does not expose retired layer errors or raw Agent reasons to the operator',async()=>{
  const panel=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  assert.doesNotMatch(panel,/selected_layer_not_found|layer_not_found|laser\.paramsNoLayer/);
  assert.doesNotMatch(panel,/setNotice\([^\n]*payload\?\.reason/);
});


test('mobile mentoring keyboard and dialog controls stay available over live preview',async()=>{
  const panel=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  const css=await readFile('src/components/LaserControlWorkspace.module.css','utf8');
  assert.match(panel,/MOBILE_KEY_ROWS/);
  assert.match(panel,/openMobileKeyboard/);
  assert.match(panel,/sendKeyboardCharacter/);
  assert.match(panel,/type:'replace_text',key:''/);
  assert.match(panel,/laser\.closeEsc/);
  assert.match(panel,/laser\.okEnter/);
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
  assert.match(input,/workspace_sendinput/);
  assert.doesNotMatch(input,/workspace_postmessage/);
});

test('legacy layer editor stays out of the live frontend',async()=>{
  const bridge=await readFile('laser-agent/LightBurnControlBridge.cs','utf8');
  const panel=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  assert.doesNotMatch(bridge,/layers\.Length==1&&!layers\[0\]\.Selected/);
  assert.doesNotMatch(panel,/controlSnapshot|controlDrafts|openCurrentLayerEditor|selectLayer/);
});


test('zoomed mobile preview pans locally and project shortcuts are compact at the top',async()=>{
  const panel=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  const css=await readFile('src/components/LaserControlWorkspace.module.css','utf8');
  assert.match(panel,/setPan\(next\)/);
  assert.match(panel,/gesture\.moved&&zoom>1/);
  assert.match(panel,/translate3d\(\$\{pan\.x\}px,\$\{pan\.y\}px,0\) scale/);
  assert.match(panel,/styles\.iconActions/);
  assert.match(css,/\.iconActions/);
  assert.match(css,/\.moreToolsGrid/);
});

test('layer parameter panel and duplicate rotary trace adjust controls are removed from More',async()=>{
  const panel=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  assert.doesNotMatch(panel,/Camada \/ valores/);
  assert.doesNotMatch(panel,/ref=\{parameterDockRef\}/);
  const rotary=(panel.match(/openToolDialog\('rotary'/g)||[]).length;
  const trace=(panel.match(/openToolDialog\('trace'/g)||[]).length;
  const adjust=(panel.match(/openToolDialog\('adjust-image'/g)||[]).length;
  assert.equal(rotary,1);
  assert.equal(trace,1);
  assert.equal(adjust,1);
});


test('Agent 1.1.0 has a one-shot remote click path',async()=>{
  const input=await readFile('laser-agent/LightBurnRemoteInput.cs','utf8');
  assert.match(input,/"click"=>Click\(main,input\)/);
  assert.match(input,/sendinput_click/);
  assert.match(input,/Mouse\(MouseeventfLeftDown,0\),Mouse\(MouseeventfLeftUp,0\)/);
});


test('Agent 1.1.0 maps clicks to the exact streamed frame',async()=>{
  const capture=await readFile('laser-agent/LightBurnWindowCapture.cs','utf8');
  const input=await readFile('laser-agent/LightBurnRemoteInput.cs','utf8');
  assert.match(capture,/TryGetLastCapturedBounds/);
  assert.match(capture,/_lastCapturedTarget/);
  assert.match(input,/TryGetLastCapturedBounds/);
  assert.doesNotMatch(input,/SetCursorPos\(x,y\);\s*Thread\.Sleep\(35\)/);
});

test('mobile pinch is incremental and cannot turn the remaining finger into a wild pan',async()=>{
  const panel=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  assert.match(panel,/suppressAfterPinch/);
  assert.match(panel,/lastPinchDistance/);
  assert.match(panel,/Math\.max\(\.9,Math\.min\(1\.1,distance\/previous\)\)/);
  assert.doesNotMatch(panel,/zoomOrigin/);
  assert.match(panel,/transformOrigin:'center center'/);
});


test('Laser workspace has no dead layer panel state and no hidden parameter refresh after dialog actions',async()=>{
  const panel=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  const css=await readFile('src/components/LaserControlWorkspace.module.css','utf8');
  assert.doesNotMatch(panel,/controlDrawerOpen|controlSnapshot|controlDrafts|controlError|refreshParameters/);
  assert.doesNotMatch(css,/\.parameterDock|\.parameterGrid|\.parameterField|\.layerBar/);
  const close=panel.slice(panel.indexOf('function closeActiveDialog'),panel.indexOf('function confirmActiveDialog'));
  const confirm=panel.slice(panel.indexOf('function confirmActiveDialog'),panel.indexOf('function sendFrameGantryRequest'));
  assert.doesNotMatch(close,/control_request|inspect/);
  assert.doesNotMatch(confirm,/control_request|inspect/);
});


test('mobile keyboard prepares the selected LightBurn target and supports one-shot right click',async()=>{
  const panel=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  const remote=await readFile('laser-agent/LightBurnRemoteInput.cs','utf8');
  assert.match(panel,/type:'prepare_edit'/);
  assert.match(panel,/rightClickArmed/);
  assert.match(panel,/button:2/);
  assert.match(remote,/"prepare_edit"=>PrepareEdit/);
  assert.match(remote,/RememberPointer/);
  assert.match(remote,/edit_target_prepared/);
});


test('custom mobile keyboard sends letters and numbers through the already working remote key path',async()=>{
  const panel=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  const css=await readFile('src/components/LaserControlWorkspace.module.css','utf8');
  assert.match(panel,/MOBILE_KEY_ROWS/);
  assert.match(panel,/sendMobileEditKey/);
  assert.match(panel,/Key'\+letter/);
  assert.match(panel,/Digit'\+value/);
  assert.match(panel,/releaseRemoteModifiers/);
  assert.match(css,/\.mobileKeyRows/);
  assert.match(css,/\.mobileKeyboardBottom/);
});


test('right-click button sends one right-click event and keyboard stays outside preview',async()=>{
  const panel=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  const css=await readFile('src/components/LaserControlWorkspace.module.css','utf8');
  assert.match(panel,/rightClickArmed[\s\S]*type:'click',[\s\S]*button:2/);
  assert.match(panel,/title=\{t\('laser\.recenterView'\)\}[\s\S]*>⊙<\/button>/);
  assert.match(panel,/dPadCenterSpacer/);
  assert.match(css,/\.mobileKeyboard,.mobileKeyboardHidden\{[\s\S]*position:relative/);
  assert.doesNotMatch(css,/\.mobileKeyboard,.mobileKeyboardHidden\{[\s\S]{0,250}position:absolute/);
});


test('Agent fails closed when the server-issued remote session lease expires',async()=>{
  const agent=await readFile('laser-agent/ContinuousAgent.cs','utf8');
  assert.match(agent,/current\.ExpiresAt<=DateTimeOffset\.UtcNow/);
  assert.match(agent,/poll\.Session\.ExpiresAt<=DateTimeOffset\.UtcNow/);
  assert.match(agent,/poll=poll with\{Session=null\}/);
  assert.match(agent,/if\(!sessionIdentityChanged&&poll\.Session is not null\)\s*current=poll\.Session/);
  assert.match(agent,/await StopRealtimeAsync\(\)/);
});


test('expired permanent Agent backs off instead of polling Supabase every few seconds',async()=>{
  const agent=await readFile('laser-agent/ContinuousAgent.cs','utf8');
  assert.match(agent,/InactiveAccessRetry=TimeSpan\.FromMinutes\(5\)/);
  assert.match(agent,/result\.Reason is "device_not_active" or "unknown_device"/);
  assert.match(agent,/poll\.Reason is "device_not_active" or "unknown_device"/);
  assert.match(agent,/await DelaySafe\(InactiveAccessRetry,cancellationToken\)/);
});
