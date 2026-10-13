import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pcClockNow,pcClockSample} from '../sentinel-trading-lab/src/lib/pc-clock-sync.mjs';
import {pcAuthoritativeWindow} from '../sentinel-trading-lab/src/lib/pc-authoritative-window.mjs';
const t=1800000000000;
const live=(now,offset,start=t)=>pcAuthoritativeWindow({windowStartedAt:start,windowEndsAt:start+30000,now:pcClockNow(now,offset),phase:'scanning'});
test('two clocks 5 seconds apart show the same real PC countdown on signed RTT calibration',()=>{
 const pcTime=t+1500;
 const behind=pcTime-5000+200,ahead=pcTime+3000+120;
 const a=pcClockSample(null,{viewerAt:pcTime-5000,pcAt:pcTime+80,receivedAt:behind});
 const b=pcClockSample(null,{viewerAt:pcTime+3000,pcAt:pcTime+40,receivedAt:ahead});
 assert.ok(a&&b);
 assert.equal(live(behind,a.offsetMs).remainingSeconds,live(ahead,b.offsetMs).remainingSeconds);
 const latePC=t+18500;
 assert.equal(live(latePC-5000,a.offsetMs).remainingSeconds,live(latePC+3000,b.offsetMs).remainingSeconds);
});
test('slow clock echoes do not extend a running window',()=>{
 const original=pcClockSample(null,{viewerAt:t,pcAt:t+80,receivedAt:t+240});
 const later=pcClockSample(original,{viewerAt:t+3000,pcAt:t+3080,receivedAt:t+4800});
 assert.strictEqual(later,original);
 assert.equal(live(t+30000+original.offsetMs+10,original.offsetMs).active,false);
 const next=live(t+30000+original.offsetMs+100,original.offsetMs,t+30000);
 assert.equal(next.remainingSeconds,30);
});
test('confirmed CALL and PUT timing depends on PC event, never network receipt',()=>{
 const offset=-4000;
 for(const side of ['CALL','PUT']){
  const fired={windowStartedAt:t,windowEndsAt:t+30000,phase:'fired',
    side,entryTriggeredAt:t+13000,quoteAt:t+13080};
  const timely=pcAuthoritativeWindow({...fired,now:pcClockNow(t+13200+offset,offset)});
  const late=pcAuthoritativeWindow({...fired,now:pcClockNow(t+16000+offset,offset)});
  assert.equal(timely.enterNow,true);
  assert.equal(late.enterNow,false);
  assert.match(late.label,/ENTRADA JÁ SINALIZADA/);
 }
});
test('invalid and unauthenticated timing samples are rejected',()=>{
 const original={offsetMs:1200,rttMs:150};
 assert.strictEqual(pcClockSample(original,{viewerAt:t,pcAt:t,receivedAt:t+5500}),original);
 assert.strictEqual(pcClockSample(original,{viewerAt:t,pcAt:t+100,receivedAt:t-1}),original);
});
test('one signed PC source for countdown and entry, with the entire original Agent model untouched',()=>{
 const client=readFileSync('sentinel-trading-lab/src/lib/signed-live-analyst-channel.ts','utf8');
 const agent=readFileSync('sentinel-trading-lab/agent/worker/signed-live-bridge.mjs','utf8');
 const card=readFileSync('sentinel-trading-lab/src/components/LiveScenarioCard.tsx','utf8');
 const page=readFileSync('sentinel-trading-lab/src/app/console/page.tsx','utf8');
 assert.match(agent,/clock-sync/);
 assert.match(client,/verifyClockEcho/);
 assert.match(client,/crypto\.subtle\.verify\('HMAC'/);
 assert.match(card,/pcClockNow\(now,pcClockOffsetMs\)/);
 assert.match(card,/pcClockNow\(localNow,s\?\.pcClockOffsetMs\)/);
 assert.match(page,/pcClockRttMs:rttMs/);
 assert.doesNotMatch(card,/windowEndsAt\+cycle\*period/);
});
