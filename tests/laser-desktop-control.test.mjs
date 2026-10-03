import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Agent 1.2.0 streams the full Windows desktop instead of requiring LightBurn',async()=>{
  const agent=await readFile('laser-agent/ContinuousAgent.cs','utf8');
  const desktop=await readFile('laser-agent/DesktopCapture.cs','utf8');
  const webrtc=await readFile('laser-agent/DesktopWebRtcCapture.cs','utf8');

  assert.match(agent,/DesktopCapture\.TryCapture\(\)/);
  assert.match(agent,/DesktopWebRtcCapture\.TryCapture\(\)/);
  assert.doesNotMatch(agent,/LightBurnWindowCapture\.TryCapture\(\)/);
  assert.doesNotMatch(agent,/LightBurnWebRtcCapture\.TryCapture\(\)/);

  assert.match(desktop,/SystemInformation\.VirtualScreen/);
  assert.match(desktop,/CopyFromScreen/);
  assert.doesNotMatch(desktop,/FindLightBurnWindow/);

  assert.match(webrtc,/SystemInformation\.VirtualScreen/);
  assert.match(webrtc,/DesktopCapture\.RememberCapturedBounds/);
  assert.doesNotMatch(webrtc,/FindLightBurnWindow/);
});

test('desktop input follows the streamed desktop while LightBurn tools stay explicit',async()=>{
  const agent=await readFile('laser-agent/ContinuousAgent.cs','utf8');
  const input=await readFile('laser-agent/DesktopRemoteInput.cs','utf8');
  const panel=await readFile('src/components/LaserControlWorkspace.tsx','utf8');

  assert.match(agent,/DesktopRemoteInput\.Apply\(input\)/);
  assert.match(input,/"pointermove"=>MovePointer/);
  assert.match(input,/"keydown"=>Keyboard/);
  assert.match(input,/"text"=>Text/);
  assert.match(input,/DesktopCapture\.TryGetLastCapturedBounds/);
  assert.match(input,/"lightburnkeydown"=>LightBurnRemoteInput\.Apply/);
  assert.match(input,/"workspacekeydown"=>LightBurnRemoteInput\.Apply/);
  assert.doesNotMatch(input,/FindLightBurnWindow\(\)/);

  assert.match(panel,/desktopAgentReady/);
  assert.match(panel,/lightburnkeydown/);
  assert.match(panel,/lightburnkeyup/);
});

test('desktop-control release is isolated as Agent 1.2.0',async()=>{
  const pairing=await readFile('laser-agent/PairingProofFactory.cs','utf8');
  const workflow=await readFile('.github/workflows/laser-agent-check.yml','utf8');

  assert.match(pairing,/AgentVersion = "1\.2\.0"/);
  assert.match(workflow,/DevinX-Laser-Agent-1\.2\.0\.exe/);
  assert.match(workflow,/DevinX-Mentoria-1\.2\.0\.exe/);
  assert.match(workflow,/laser-agent-v1\.2\.0/);
});
