import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {evolveOpportunity,opportunityContext} from '../sentinel-trading-lab/agent/src/core/single-opportunity-window.mjs';
import {forwardHorizonMatrix} from '../sentinel-trading-lab/agent/src/core/forward-horizon-matrix.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const now=1800000000000;
const settings={engine:'automatic',asset:'TEST',forecastMode:'continuous',orderDurationMs:30000};
const candidate=(side='CALL',offset=14)=>({side,delaySeconds:30,holdingSeconds:30,
  engineId:'automatic',asset:'TEST',issuedAt:now,entryAt:now+offset*1000,
  exitAt:now+(offset+30)*1000,projectedEntryPrice:1.1,
  projectedExitPrice:side==='CALL'?1.12:1.08,
  entryOffsetSeconds:offset});
const evolve=(prev,c,at,confirmation,quoteAt=at)=>
 evolveOpportunity({previous:prev,candidate:c,settings,now:at,quoteAt,confirmation});
test('CALL opens exactly one immutable 30s window; PUT or competing entry time cannot replace it',()=>{
 const first=evolve(null,candidate('CALL'),now);
 assert.equal(first.phase,'open');
 assert.equal(first.windowEndsAt,now+30000);
 const same=evolve(first,candidate('CALL',29),now+1000);
 assert.equal(same.side,'CALL');
 assert.equal(same.entryAt,now+14000);
 assert.equal(same.exitAt,now+44000);
 const cancelled=evolve(same,candidate('PUT',3),now+2000);
 assert.equal(cancelled.phase,'cancelled');
 assert.equal(cancelled.side,null);
 const noRearm=evolve(cancelled,candidate('PUT'),now+2500);
 assert.equal(noRearm.phase,'cancelled');
 assert.equal(noRearm.windowEndsAt,now+30000);
 const newWindow=evolve(cancelled,{...candidate('PUT'),issuedAt:now+31000,
  entryAt:now+34000,exitAt:now+64000},now+31000);
 assert.equal(newWindow.phase,'open');
 assert.equal(newWindow.side,'PUT');
});
test('when entry time arrives, a new quote and matching forward outcome can fire once only',()=>{
 const first=evolve(null,candidate('CALL'),now);
 const before=evolve(first,candidate('CALL',29),now+13500);
 assert.equal(before.entryReadyNow,false);
 const confirmation={side:'CALL',projectedEntryPrice:1.1,projectedExitPrice:1.11};
 const fired=evolve(before,candidate('CALL',22),now+14100,confirmation,now+14100);
 assert.equal(fired.phase,'fired');
 assert.equal(fired.entryReadyNow,true);
 assert.equal(fired.entryTriggeredAt,now+14100);
 const again=evolve(fired,candidate('PUT'),now+14200,confirmation);
 assert.equal(again.phase,'fired');
 assert.equal(again.entryReadyNow,false);
 assert.equal(again.entryTriggeredAt,now+14100);
 assert.equal(again.entryAt,now+14000);
});
test('expired confirmation and opposite outcome CANCEL, never issue an entry',()=>{
 const first=evolve(null,candidate('CALL'),now);
 const wrong=evolve(first,null,now+14020,
  {side:'PUT',projectedEntryPrice:1.1,projectedExitPrice:1.09});
 assert.equal(wrong.phase,'cancelled');
 assert.equal(wrong.side,null);
 assert.equal(evolve(wrong,candidate('CALL'),now+15000).phase,'cancelled');
 const missed=evolve(first,candidate('CALL'),now+16000,
  {side:'CALL',projectedEntryPrice:1.1,projectedExitPrice:1.11});
 assert.equal(missed.phase,'cancelled');
 assert.equal(missed.reason,'entry-missed');
});
test('stale quotes cancel an existing signal without starting an opposite one',()=>{
 const first=evolve(null,candidate('CALL'),now);
 const cancelled=evolve(first,candidate('PUT'),now+5000,null,now+100);
 assert.equal(cancelled.phase,'cancelled');
 assert.equal(cancelled.reason,'feed-stale');
 assert.equal(evolve(null,candidate('CALL'),now+5000,null,now+100),null);
});
test('mode and duration are part of independent window identities',()=>{
 const first=evolve(null,candidate('CALL'),now);
 const selective={...settings,forecastMode:'selective'};
 assert.notEqual(first.context,opportunityContext(selective));
 const duration={...settings,orderDurationMs:60000};
 assert.notEqual(first.context,opportunityContext(duration));
});
test('a terminal window skips repetitive heavy entry searching but preserves normal quote analysis',()=>{
 const quotes=Array.from({length:2500},(_,i)=>({ts:now-(2499-i)*1000,price:1.1+i*.00000001}));
 const snap={quoteHistory:quotes,quoteTs:now,price:quotes.at(-1).price,provider:'iq_option'};
 const locked=evolve(null,candidate('CALL'),now);
 const matrix=forwardHorizonMatrix({settings,snap,now:now+1000,
  activeWindow:locked,forecastModel:'selected-strengths-67.5'});
 assert.equal(matrix.entryRows.find(x=>x.delaySeconds===30)?.entryAt,now+14000);
 const m2=forwardHorizonMatrix({settings:{...settings,forecastMode:'selective'},snap,now:now+1000,
  activeWindow:{...locked,phase:'cancelled',side:null},forecastModel:'selected-strengths-67.5'});
 assert.ok(m2.rows.length>0);
});
test('PC and mobile have explicit terminal phase and realtime fire event; runtime owns lock',()=>{
 const dir='sentinel-trading-lab/';
 const rt=fs.readFileSync(dir+'agent/src/core/runtime.mjs','utf8');
 const pc=fs.readFileSync(dir+'agent/worker/local-playwright-driver.mjs','utf8');
 const live=fs.readFileSync(dir+'agent/worker/live-bridge.mjs','utf8');
 const worker=fs.readFileSync(dir+'agent/worker/index.mjs','utf8');
 const mobile=fs.readFileSync(dir+'src/components/LiveScenarioCard.tsx','utf8');
 assert.match(rt,/this.vnextWindowState=evolveOpportunity|const nextWindow=evolveOpportunity/);
 assert.match(rt,/confirmWindowEntry/);
 assert.match(rt,/windowOutcomes:/);
 assert.match(live,/opportunityWindow\.phase/);
 assert.match(worker,/mobileEntry\?\.phase/);
 assert.match(pc,/JANELA CANCELADA/);
 assert.match(mobile,/JANELA CANCELADA/);
 const runtime=new DemoTradingRuntime({enableVNext:true});
 runtime.vnextWindowState=locked;
 runtime.patchSettings({orderDurationMs:60000});
 assert.equal(runtime.vnextWindowState,null);
});
