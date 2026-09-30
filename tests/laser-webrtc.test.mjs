import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workspace=readFileSync('src/components/LaserControlWorkspace.tsx','utf8');
const realtime=readFileSync('laser-agent/DevinXRealtimeSession.cs','utf8');
const continuous=readFileSync('laser-agent/ContinuousAgent.cs','utf8');
const transport=readFileSync('laser-agent/DevinXWebRtcVideoTransport.cs','utf8');
const csproj=readFileSync('laser-agent/DevinXLaserAgent.csproj','utf8');

test('Laser Control WebRTC keeps JPEG fallback',()=>{
  assert.match(workspace,/new RTCPeerConnection/);
  assert.match(workspace,/stun:stun\.cloudflare\.com:3478/);
  assert.match(workspace,/webrtc_offer/);
  assert.match(workspace,/event:'frame'/);
  assert.match(continuous,/webRtc\.IsConnected/);
  assert.match(continuous,/SendFrameAsync/);
  assert.match(realtime,/webrtc_answer/);
  assert.match(transport,/Vp8NetVideoEncoderEndPoint/);
  assert.match(csproj,/SIPSorcery\.VP8" Version="10\.0\.16"/);
});
