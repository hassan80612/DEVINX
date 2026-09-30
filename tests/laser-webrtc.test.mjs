import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workspace=readFileSync('src/components/LaserControlWorkspace.tsx','utf8');
const continuous=readFileSync('laser-agent/ContinuousAgent.cs','utf8');
const realtime=readFileSync('laser-agent/DevinXRealtimeSession.cs','utf8');

test('WebRTC waits for Agent presence and keeps JPEG fallback independent',()=>{
  assert.match(workspace,/markAgentReadyForWebRtc/);
  assert.match(workspace,/event:'frame'/);
  assert.match(workspace,/event:'agent_state'/);
  assert.doesNotMatch(workspace,/SUBSCRIBED'[\s\S]{0,180}startWebRtc\(\)/);
  assert.match(continuous,/signal\.Type=="offer"&&webRtc is null/);
  assert.match(continuous,/RunFrameLoopAsync\(realtime,\(\)=>webRtc/);
  assert.match(continuous,/SendFrameAsync/);
  assert.match(realtime,/webrtc_answer/);
});
