import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pcAuthoritativeWindow} from '../sentinel-trading-lab/src/lib/pc-authoritative-window.mjs';
import {analystSnapshot} from '../sentinel-trading-lab/agent/worker/live-bridge.mjs';
const start=1800000000000, expiry=30000, end=start+expiry;
const window=(now,opts={})=>pcAuthoritativeWindow({
 windowStartedAt:start,windowEndsAt:end,phase:'open',side:'CALL',quoteAt:now,now,...opts
});
test('mobile never manufactures the next window if the Agent has not sent another deadline',()=>{
 assert.equal(window(start+1).remainingSeconds,30);
 assert.equal(window(start+5000).remainingSeconds,25);
 assert.equal(window(end-1000).remainingSeconds,1);
 const expired=window(end+200);
 assert.equal(expired.active,false);
 assert.equal(expired.remainingSeconds,null);
 assert.match(expired.label,/JANELA ENCERRADA/);
 for(const n of [end+1500,end+15000,end+60000]) {
  assert.equal(window(n).remainingSeconds,null,'the old deadline must not repeat');
  assert.ok(!window(n).label.includes('JANELA ABERTA'),'expired window cannot reopen itself');
 }
 const next=pcAuthoritativeWindow({windowStartedAt:end,windowEndsAt:end+expiry,phase:'open',side:'PUT',quoteAt:end+50,now:end+100});
 assert.equal(next.remainingSeconds,30);
 assert.equal(next.label,'↓ PUT · JANELA ABERTA');
});
test('confirmed CALL/PUT AGORA mirrors PC time/quote/Agent phase, never forecast-only',()=>{
 const accepted=window(start+22000,{phase:'fired',entryTriggeredAt:start+21000,quoteAt:start+21800});
 assert.equal(accepted.enterNow,true);
 assert.equal(accepted.label,'ENTRADA AGORA · ↑ CALL');
 assert.equal(window(start+22700,{phase:'fired',entryTriggeredAt:start+21000,quoteAt:start+21800}).enterNow,false);
 assert.equal(window(start+21500,{phase:'open',entryTriggeredAt:start+21000,quoteAt:start+21490}).enterNow,false);
 assert.equal(window(start+22000,{phase:'fired',entryTriggeredAt:0,quoteAt:start+21800}).enterNow,false);
 assert.equal(window(start+22000,{phase:'fired',entryTriggeredAt:start+21000,quoteAt:start+18000}).enterNow,false);
 assert.equal(window(start+22000,{phase:'fired',entryTriggeredAt:start+21000,quoteAt:start+21800,side:null}).enterNow,false);
});
test('cancelled or fired snapshots can never turn back into a new CALL/PUT during rollover',()=>{
 const cancelled=window(start+10000,{phase:'cancelled'});
 assert.equal(cancelled.label,'JANELA SEM ENTRADA');
 assert.equal(window(end+200,{phase:'cancelled'}).label,'JANELA SEM ENTRADA');
 assert.equal(window(end+200,{phase:'fired'}).label,'ENTRADA JÁ SINALIZADA');
 assert.equal(window(start+10000,{phase:'scanning',side:'PUT'}).label,'JANELA ABERTA · ANALISANDO');
});
test('signed Agent payload carries original PC boundaries, side and confirmed trigger',()=>{
 const asset='EUR/USD OTC';
 const payload=analystSnapshot({state:'running',lastEvalMs:start,settings:{asset,engine:'automatic',orderDurationMs:expiry},
  lastResult:{asset,analysis:{vnext:{engineId:'automatic',expirySeconds:30,
    opportunityWindow:{phase:'fired',windowStartedAt:start,windowEndsAt:end,entryAt:start+11000},
    futureEntryAnchor:{engineId:'automatic',asset,delaySeconds:30,side:'CALL',holdingSeconds:30,
      issuedAt:start,entryAt:start+11000,exitAt:start+41000,entryTriggeredAt:start+11000}}}}},{
  symbol:asset,validatedSymbol:asset,assetValidated:true,analysisFeedValidated:true,lastQuoteAt:start+11100,quote:1.11111});
 assert.deepEqual(payload.lastResult.analysis.vnext.ow.slice(0,3),['fired',start,end]);
 assert.equal(payload.lastResult.analysis.vnext.ea[1],'CALL');
 assert.equal(payload.lastResult.analysis.vnext.ea[10],start+11000);
});
test('mobile uses source timestamps in BOTH full and compact display, never artificial cycle math',()=>{
 const src=readFileSync('sentinel-trading-lab/src/components/LiveScenarioCard.tsx','utf8');
 assert.match(src,/pcAuthoritativeWindow\(/);
 assert.match(src,/const view=pcAuthoritativeWindow\(/);
 assert.doesNotMatch(src,/const cycle=validWindow/);
 assert.doesNotMatch(src,/windowEndsAt\+cycle\*period/);
 assert.match(src,/<MobileFutureEntryClock windowEndsAt=/);
 assert.equal((src.match(/\{forecastReceipt\}/g)||[]).length,2);
 const pc=readFileSync('sentinel-trading-lab/agent/worker/local-playwright-driver.mjs','utf8');
 assert.match(pc,/const windowDeadline=Number\(windowState\?\.windowEndsAt\|\|0\)/);
 assert.match(pc,/const verifiedNow=pane.getAttribute\('data-entry-ready'\)==='1'/);
});
