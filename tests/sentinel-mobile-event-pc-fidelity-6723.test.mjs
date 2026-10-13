import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pcAuthoritativeWindow} from '../sentinel-trading-lab/src/lib/pc-authoritative-window.mjs';
const t=1800000000000;
const state=(now,phase='scanning',side=null,triggered=0,quote=t)=>pcAuthoritativeWindow({
  windowStartedAt:t,windowEndsAt:t+30000,phase,side,entryTriggeredAt:triggered,quoteAt:quote,now
});
test('mobile shows verified CALL AGORA while PC signal is live, and retains its actual direction afterwards',()=>{
 const active=state(t+12150,'fired','CALL',t+12000,t+12050);
 assert.equal(active.enterNow,true);
 assert.equal(active.label,'ENTRADA AGORA · ↑ CALL');
 const viewedLate=state(t+14000,'fired','CALL',t+12000,t+13000);
 assert.equal(viewedLate.enterNow,false);
 assert.equal(viewedLate.label,'ENTRADA JÁ SINALIZADA · ↑ CALL');
 assert.equal(viewedLate.phase,'fired');
});
test('mobile preserves PUT confirmation and never re-labels it as scanning or the opposite direction',()=>{
 const onTime=state(t+22700,'fired','PUT',t+22000,t+22600);
 assert.equal(onTime.label,'ENTRADA AGORA · ↓ PUT');
 const late=state(t+26000,'fired','PUT',t+22000,t+25900);
 assert.equal(late.label,'ENTRADA JÁ SINALIZADA · ↓ PUT');
 assert.equal(late.enterNow,false);
});
test('obsolete window never displays JANELA ENCERRADA or invents the next clock',()=>{
 const old=state(t+31500,'open','CALL',0,t+31500);
 assert.equal(old.active,false);
 assert.equal(old.remainingSeconds,null);
 assert.equal(old.label,'');
 assert.ok(!old.label.includes('JANELA ENCERRADA'));
 const next=pcAuthoritativeWindow({windowStartedAt:t+30000,windowEndsAt:t+60000,
  now:t+31500,phase:'scanning'});
 assert.equal(next.remainingSeconds,29);
 assert.equal(next.label,'JANELA ABERTA · ANALISANDO');
});
test('mobile signed HMAC verification keeps socket arrival order, not completion order',()=>{
 const transport=readFileSync('sentinel-trading-lab/src/lib/signed-live-analyst-channel.ts','utf8');
 assert.match(transport,/verificationQueue=verificationQueue\.then\(\(\)=>verifyFrame\(signedFrame\)\)/);
 assert.match(transport,/frame\.seq<=sequence/);
 const merge=readFileSync('sentinel-trading-lab/src/app/console/page.tsx','utf8');
 assert.match(merge,/acceptSignedPcFrame\(previous,payload\)/);
 assert.match(merge,/keepSignedViewOverCloud\(previous,data\)/);
});
test('no new trading authorization or worker engine changes on mobile-only fix',()=>{
 const card=readFileSync('sentinel-trading-lab/src/components/LiveScenarioCard.tsx','utf8');
 assert.match(card,/pcAuthoritativeWindow\(\{windowStartedAt,windowEndsAt,phase,side,entryTriggeredAt,quoteAt,now:pcClockNow\(now,pcClockOffsetMs\)\}\)/);
 assert.doesNotMatch(card,/windowEndsAt\+cycle\*period/);
});
