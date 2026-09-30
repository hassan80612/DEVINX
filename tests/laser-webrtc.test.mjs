import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workspace=readFileSync('src/components/LaserControlWorkspace.tsx','utf8');
const continuous=readFileSync('laser-agent/ContinuousAgent.cs','utf8');
const realtime=readFileSync('laser-agent/DevinXRealtimeSession.cs','utf8');
const sessionRoute=readFileSync('src/app/api/laser-control/master/remote-session/route.ts','utf8');

test('WebRTC waits for Agent presence and keeps JPEG fallback independent',()=>{
  assert.match(workspace,/markAgentReadyForWebRtc/);
  assert.match(workspace,/event:'frame'/);
  assert.match(workspace,/event:'agent_state'/);
  assert.match(workspace,/type:'broadcast'/);
  assert.match(workspace,/event,/);
  assert.match(workspace,/from:'browser'/);
  assert.match(workspace,/pendingBrowserIce/);
  assert.match(workspace,/video\/vp8/);
  assert.match(sessionRoute,/webrtc_offer/);
  assert.match(sessionRoute,/invalid_signal/);
  assert.doesNotMatch(workspace,/SUBSCRIBED'[\s\S]{0,180}startWebRtc\(\)/);
  assert.match(continuous,/signal\.Type=="offer"&&webRtc is null/);
  assert.match(continuous,/RunFrameLoopAsync\(realtime,\(\)=>webRtc/);
  assert.match(continuous,/SendFrameAsync/);
  assert.match(realtime,/webrtc_answer/);
});


test('Agent receives browser broadcasts over Realtime JSON v1',()=>{
  assert.match(realtime,/vsn=1\.0\.0/);
  assert.match(realtime,/topic="realtime:"\+_config\.Topic/);
  assert.match(realtime,/@event="broadcast"/);
  assert.doesNotMatch(realtime,/vsn=2\.0\.0/);
});


test('WebRTC signaling goes directly browser -> Agent after Agent presence is known',()=>{
  assert.match(workspace,/channel\.send\(\{[\s\S]*type:'broadcast'[\s\S]*from:'browser'/);
  assert.doesNotMatch(workspace,/sendWebRtcSignal=.*postSession/);
});


test('WebRTC negotiation cannot block the main Realtime input loop',()=>{
  assert.match(realtime,/Task\.Run\(async\(\)=>\{/);
  assert.match(continuous,/WaitAsync\(TimeSpan\.FromSeconds\(6\)/);
  assert.match(workspace,/\(inputReady\|\|session\?\.remoteInputEnabled\)\?disableRemoteInput/);
});
