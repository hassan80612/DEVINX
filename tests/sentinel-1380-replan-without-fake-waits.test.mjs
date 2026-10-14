import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evolveOpportunity} from '../sentinel-trading-lab/agent/src/core/single-opportunity-window.mjs';
import {entryOffsets} from '../sentinel-trading-lab/agent/src/core/entry-window-planner.mjs';
import {futureEntrySchedule} from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';
import {forwardHorizonMatrix} from '../sentinel-trading-lab/agent/src/core/forward-horizon-matrix.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const T=Date.parse('2026-10-14T16:47:00-03:00');
const settings={engine:'automatic',forecastMode:'continuous',asset:'EUR/USD OTC',
  orderDurationMs:30000,clockMode:'current'};
const candidate=(entryAt,side='PUT',issuedAt=T,selectionStrength=1)=>({
 engineId:'automatic',asset:'EUR/USD OTC',delaySeconds:30,holdingSeconds:30,
 side,issuedAt,entryAt,exitAt:entryAt+30000,
 projectedEntryPrice:1.125,projectedExitPrice:side==='PUT'?1.124:1.126,
 selectionStrength
});
test('Missed confirmation no longer freezes next qualified SAME-SIDE moment',()=>{
 const opening=evolveOpportunity({settings,now:T,quoteAt:T,candidate:candidate(T+8000)});
 assert.equal(opening.phase,'open');
 assert.equal(opening.entryAt,T+8000);
 const missed=evolveOpportunity({previous:opening,settings,now:T+8500,quoteAt:T+8500,
  confirmation:{side:null},candidate:candidate(T+11500,'PUT',T+8500,1.1)});
 assert.equal(missed.phase,'open');
 assert.equal(missed.reason,'replanned-same-side-entry');
 assert.equal(missed.entryAt,T+11500);
 assert.equal(missed.windowEndsAt,T+30000,'original countdown is immutable');
 const fired=evolveOpportunity({previous:missed,settings,now:T+11600,quoteAt:T+11600,
  candidate:candidate(T+13500,'CALL',T+11600),
  confirmation:{side:'PUT',projectedEntryPrice:1.125,projectedExitPrice:1.124}});
 assert.equal(fired.phase,'fired');
 assert.equal(fired.side,'PUT');
 assert.equal(fired.entryTriggeredAt,T+11600);
 assert.equal(fired.windowEndsAt,T+30000);
 const noRepeat=evolveOpportunity({previous:fired,settings,now:T+16000,
   quoteAt:T+16000,candidate:candidate(T+17000,'CALL',T+16000)});
 assert.equal(noRepeat.phase,'fired');
 assert.equal(noRepeat.entryReadyNow,false);
});
test('Earlier SAME-SIDE evidence advances a pending point, without flipping direction',()=>{
 const old=evolveOpportunity({settings,now:T,quoteAt:T,candidate:candidate(T+25000)});
 const earlier=evolveOpportunity({settings,previous:old,now:T+2000,quoteAt:T+2000,
  candidate:candidate(T+3000,'PUT',T+2000)});
 assert.equal(earlier.entryAt,T+3000);
 assert.equal(earlier.side,'PUT');
 assert.equal(earlier.windowEndsAt,T+30000);
 const opposite=evolveOpportunity({settings,previous:earlier,now:T+2200,quoteAt:T+2200,
  candidate:candidate(T+3300,'CALL',T+2200)});
 assert.equal(opposite.side,'PUT');
 assert.equal(opposite.entryAt,T+3000);
 const terminal=evolveOpportunity({settings,previous:opposite,now:T+3100,quoteAt:T+3100,
  confirmation:{side:null},candidate:candidate(T+5000,'CALL',T+3100)});
 assert.equal(terminal.side,'PUT');
});
test('Does not replan from stale or repeated market quote',()=>{
 const old=evolveOpportunity({settings,now:T,quoteAt:T,candidate:candidate(T+4000)});
 const stale=evolveOpportunity({settings,previous:old,now:T+4200,quoteAt:T,
  confirmation:{side:null},candidate:candidate(T+6000,'PUT',T+4200)});
 assert.equal(stale.entryAt,T+4000);
 assert.equal(stale.phase,'open');
});
test('Fresh completed-structure downtrend yields a candidate without waiting for another bar',()=>{
 const base=T-700000;
 const history=Array.from({length:700},(_,i)=>({
   ts:base+i*1000,receivedAt:base+i*1000,
   price:1.16-.000011*i+Math.sin(i/11)*.0000012
 }));
 const now=history.at(-1).ts;
 const snap={provider:'exnova',quoteHistory:history,price:history.at(-1).price,quoteTs:now};
 const entries=futureEntrySchedule({settings,snap,now,delays:[30],
  forecastModel:'causal-closed-structure-1379',adaptiveHistory:history});
 const main=entries.find(x=>x.delaySeconds===30);
 assert.equal(main?.side,'PUT',JSON.stringify(main));
 assert.ok(main.entryAt-now<=30000);
 const first=entryOffsets(30)[0];
 assert.equal(first,1,'qualified early price setup can be planned 1 second ahead');
});
test('Continuous never inherits a saved general scheduler interval of 15s or 30s',()=>{
 const source=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/runtime.mjs',import.meta.url),'utf8');
 assert.match(source,/const liveContinuous=!!this\.settings\.engine/);
 assert.match(source,/if\(liveContinuous&&this\.nextEvalMs>now\+1000\)this\.nextEvalMs=now/);
 assert.match(source,/liveContinuous\?1000:this\.settings\.schedule\.intervalMs/);
 const m=new DemoTradingRuntime({enableVNext:true,forecastModel:'causal-closed-structure-1379'});
 m.settings.schedule.intervalMs=30000;
 assert.equal(m.settings.engine,'automatic');
 assert.equal(m.settings.forecastMode,undefined);
});
test('Open Continuous opportunity is NOT hidden by the horizon-matrix terminal-only lock',()=>{
 const source=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/forward-horizon-matrix.mjs',import.meta.url),'utf8');
 assert.match(source,/\['fired','cancelled'\]\.includes\(activeWindow\.phase\)/);
 assert.doesNotMatch(source,/\['open','fired','cancelled'\]\.includes\(activeWindow\.phase\)/);
 const scanning=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs',import.meta.url),'utf8');
 assert.match(scanning,/\['scanning','open'\]\.includes\(input\.activeWindow\?\.phase\)/);
});
