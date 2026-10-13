import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planEntryWindow} from '../sentinel-trading-lab/agent/src/core/entry-window-planner.mjs';
import {evolveOpportunity} from '../sentinel-trading-lab/agent/src/core/single-opportunity-window.mjs';
import {pcAuthoritativeWindow} from '../sentinel-trading-lab/src/lib/pc-authoritative-window.mjs';
const t=1800000000000;
const settings={engine:'automatic',asset:'TEST',forecastMode:'continuous',orderDurationMs:30000};
function candidate(at,headroom=800){
 return planEntryWindow({now:at,windowSeconds:30,holdingSeconds:30,realWindowEndsAt:t+30000,confirmationQuoteGapMs:headroom,
   evaluateLead:seconds=>({side:'CALL',projectedEntryPrice:1.1,projectedExitPrice:1.2,selectionStrength:1+seconds/100})});
}
test('Contínua never selects an entry too late for the actual PC window',()=>{
 for(const elapsed of [0,10000,19500,25000,27000]){
   const r=candidate(t+elapsed);
   assert.equal(r.windowEndsAt,t+30000);
   assert.ok(r.entryAt+800<=t+30000);
   assert.equal(r.exitAt,r.entryAt+30000);
 }
 const tooLate=candidate(t+29100,1000);
 assert.equal(tooLate.side,null);
 assert.equal(tooLate.entryAt,null);
});
test('Contínua opens one fixed window, cannot flip side, rearm or extend deadline',()=>{
 const scanning=evolveOpportunity({settings,now:t,quoteAt:t});
 const row=candidate(t+19000);
 const opened=evolveOpportunity({previous:scanning,candidate:row,settings,now:t+19000,quoteAt:t+19000});
 assert.equal(opened.phase,'open');
 assert.equal(opened.windowEndsAt,t+30000);
 const later=evolveOpportunity({previous:opened,candidate:null,settings,now:t+26000,quoteAt:t+26000});
 assert.equal(later.side,'CALL');
 assert.equal(later.windowEndsAt,t+30000);
});
test('Seletiva keeps original ANALISANDO countdown and never manufactures entry',()=>{
 const selective={...settings,forecastMode:'selective'};
 const scanning=evolveOpportunity({settings:selective,now:t,quoteAt:t});
 const display=pcAuthoritativeWindow({windowStartedAt:t,windowEndsAt:t+30000,phase:scanning.phase,now:t+13000});
 assert.equal(display.remainingSeconds,17);
 assert.equal(display.label,'JANELA ABERTA · ANALISANDO');
 assert.equal(display.enterNow,false);
 const after=pcAuthoritativeWindow({windowStartedAt:t,windowEndsAt:t+30000,phase:'scanning',now:t+30040});
 assert.equal(after.active,false);
 assert.equal(after.remainingSeconds,0); // 67.24 keeps the completed PC deadline at 00:00.
});
test('PC overlay treats actual source window change and fired timestamp as urgent',()=>{
 const src=readFileSync('sentinel-trading-lab/agent/worker/index.mjs','utf8');
 for(const segment of [
  src.slice(src.indexOf('const overlayFastKey=['),src.indexOf('if(overlayFastKey!==')),
  src.slice(src.indexOf('overlayTimingKey=['),src.indexOf('const urgentOverlay'))
 ])for(const match of ['windowStartedAt','windowEndsAt','entryTriggeredAt'])assert.ok(segment.includes(match),match);
});

// Waiting copy must not change the PC deadline or turn a forecast into entry.
test('open CALL and PUT explicitly wait; only a confirmed trigger says AGORA',()=>{
 for(const side of ['CALL','PUT']){
  const args={windowStartedAt:t,windowEndsAt:t+30000,phase:'open',side,quoteAt:t+1000,now:t+1000};
  const waiting=pcAuthoritativeWindow(args);
  assert.equal(waiting.label,(side==='CALL'?'↑ CALL':'↓ PUT')+' · JANELA ABERTA · AGUARDE');
  assert.equal(waiting.enterNow,false);
  assert.equal(waiting.remainingSeconds,29);
  const confirmed=pcAuthoritativeWindow({...args,phase:'fired',entryTriggeredAt:t+1000});
  assert.equal(confirmed.enterNow,true);
  assert.equal(confirmed.label,'ENTRADA AGORA · '+(side==='CALL'?'↑ CALL':'↓ PUT'));
  assert.equal(confirmed.deadline,waiting.deadline);
 }
});
