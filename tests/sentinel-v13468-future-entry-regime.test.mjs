import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {historicalFutureEntryAnalogs} from '../sentinel-trading-lab/agent/src/core/historical-future-entry-analogs.mjs';
import {progressFutureEntryAudit} from '../sentinel-trading-lab/agent/src/core/future-entry-audit.mjs';
import {futureEntrySchedule} from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';
import {singleEngineForecast} from '../sentinel-trading-lab/agent/src/core/vnext-single-engine.mjs';
import {SCENARIO_ENGINES} from '../sentinel-trading-lab/agent/src/core/scenario-engine-catalog.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';

const now=1800000000000,H=30,asset='EUR/USD OTC';
const base=now-1099000;
const quotes=Array.from({length:1100},(_,i)=>({
 ts:base+i*1000,
 price:1.1+Math.sin(i/18)*.00007+Math.sin(i/4)*.00001
}));
const snap={quoteHistory:quotes,quoteTs:now,price:quotes.at(-1).price,provider:'iq_option'};
const settings=engine=>({engine,asset,orderDurationMs:30000});
test('paired analogs use only data available BEFORE issue time, never the later entry/expiry candles',()=>{
 const params={quoteHistory:quotes,asOf:now,delaySeconds:30,engineId:'automatic'};
 const original=historicalFutureEntryAnalogs(params);
 assert.ok(original);
 assert.ok(original.comparisonCount>=6);
 assert.ok(original.latestTrainingTargetAt<=now-2*H*1000-1200);
 const poisoned=[...quotes,{ts:now+30000,price:1.0},{ts:now+60000,price:2.0}];
 const changed=historicalFutureEntryAnalogs({...params,quoteHistory:poisoned});
 assert.deepEqual(changed,original,'future prices must never be visible as training examples');
 assert.equal(original.noFutureLeakage,true);
});
test('all 9 motors preserve their own selected-engine forecast, with future ENTRY at H and EXIT at 2H',()=>{
 for(const e of SCENARIO_ENGINES){
  const s=settings(e.id);
  const v=futureEntrySchedule({settings:s,snap,now,delays:[30],focusDelaySeconds:30})[0];
  assert.equal(v.engineId,e.id);
  assert.equal(v.entryAt,now+30000);
  assert.equal(v.exitAt,now+60000);
  assert.equal(v.actionable,false);
  assert.equal(v.calibrated,false);
  assert.equal(v.researchOnly,true);
  assert.ok(v.projectedEntryPrice>0);
  assert.ok(v.projectedExitPrice>0);
  assert.equal(v.side,v.projectedExitPrice>v.projectedEntryPrice?'CALL':'PUT');
  assert.equal(v.side,v.baselineSide,'shadow model must not change approved CALL/PUT');
  assert.ok(!v.candidateSide||['CALL','PUT'].includes(v.candidateSide));
  assert.equal(v.researchOnly,true);
  assert.ok(v.historicalPairCases>0);
  assert.ok(v.independentHistoricalCases>=1);
 }
});
test('without paired history, exact legacy chosen-engine outcome remains the fallback',()=>{
 const short=snap.quoteHistory.slice(-170);
 const shortSnap={...snap,quoteHistory:short};
 const s=settings('mean_reversion');
 const v=futureEntrySchedule({settings:s,snap:shortSnap,now,delays:[30],focusDelaySeconds:30})[0];
 const p1=singleEngineForecast({settings:s,snap:shortSnap,now}).receipt;
 const p2=singleEngineForecast({settings:{...s,orderDurationMs:60000},snap:shortSnap,now}).receipt;
 assert.equal(v.independentHistoricalCases,0);
 assert.equal(v.projectedEntryPrice,p1?.projectedPrice??null);
 assert.equal(v.projectedExitPrice,p2?.projectedPrice??null);
});
test('TRUE future entry accuracy uses a quote at t+H and quote at t+2H, not the t0 quote',()=>{
 const p={engineId:'automatic',asset,side:'PUT',baselineSide:'CALL',
  delaySeconds:30,holdingSeconds:30,researchRegime:'oscillating',
  issuedAt:now,entryAt:now+30000,exitAt:now+60000};
 const first=progressFutureEntryAudit({plan:p,now,quoteHistory:quotes});
 assert.equal(first.pending.length,1);
 assert.equal(first.summaries.length,0);
 const mid=progressFutureEntryAudit({previous:first,plan:p,now:now+30000,
  quoteHistory:[...quotes,{ts:now+30000,price:1.1001}]});
 assert.equal(mid.pending.length,1);
 assert.equal(mid.summaries.length,0);
 const later=progressFutureEntryAudit({previous:mid,plan:p,now:now+60000,
  quoteHistory:[...quotes,{ts:now+30000,price:1.1001},{ts:now+60000,price:1.1}]});
 assert.deepEqual(later.summaries.map(x=>[x.verified,x.correct,x.draws,x.baselineVerified,x.baselineCorrect,x.candidateVerified]),[[1,1,0,1,0,0]]);
 const repeat=progressFutureEntryAudit({previous:later,plan:p,now:now+60000,
  quoteHistory:[...quotes,{ts:now+30000,price:1.1001},{ts:now+60000,price:1.1}]});
 assert.equal(repeat.summaries[0].verified,1,'a pinned forecast must count only once');
});
test('unobserved entry quote or expiry quote is NOT invented using a late candle close',()=>{
 const p={engineId:'price_action',asset,side:'CALL',delaySeconds:30,
   issuedAt:now,entryAt:now+30000,exitAt:now+60000};
 const first=progressFutureEntryAudit({plan:p,now,quoteHistory:quotes});
 const observed=progressFutureEntryAudit({previous:first,plan:null,now:now+70000,
  quoteHistory:[...quotes,{ts:now+34000,price:1.2},{ts:now+62000,price:1.4}]});
 assert.equal(observed.summaries.length,0);
 assert.equal(observed.pending.length,1);
 const finalized=progressFutureEntryAudit({previous:observed,plan:null,now:now+80000,
  quoteHistory:[...quotes,{ts:now+34000,price:1.2},{ts:now+62000,price:1.4}]});
 assert.equal(finalized.pending.length,0);
 assert.equal(finalized.summaries.length,0);
});
test('changing market quotes cannot flip the immutably registered primary decision',()=>{
 const runtime=new DemoTradingRuntime({enableVNext:true});
 runtime.patchSettings({...settings('automatic'),forecastHorizonSeconds:30});
 const first=runtime._signalValidationGate({analysis:{},settings:runtime.settings,snap,now});
 const pinned=first.analysis.vnext.futureEntryAnchor;
 const market={...snap,quoteTs:now+1000,
   quoteHistory:[...quotes,{ts:now+1000,price:1.099}]};
 const next=runtime._signalValidationGate({analysis:{},settings:runtime.settings,snap:market,now:now+1000});
 assert.deepEqual(next.analysis.vnext.futureEntryAnchor,pinned);
 assert.ok(Array.isArray(next.analysis.vnext.futureEntryMeasurements));
 assert.equal(next.allowed,false);
 assert.equal(next.analysis.operationalSignal.actionable,false);
});
test('PC and BOTH mobile modes remain untouched and preserve one primary entry receipt',async()=>{
 const src=await readFile(new URL('../sentinel-trading-lab/src/components/LiveScenarioCard.tsx',import.meta.url),'utf8');
 assert.equal((src.match(/\{forecastReceipt\}/g)||[]).length,2);
 assert.match(src,/const futureEntry=m\.vnextFutureEntryAnchor/);
 const win=await readFile(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
 assert.match(win,/data-sentinel-vnext-clock/);
 assert.match(win,/const pinnedEntry=d\.vnext\?\.futureEntryAnchor/);
});

test('approved LIVE choice remains exactly 13.4.67 while candidate is measured in parallel',()=>{
 const setting=settings('trend');
 const result=futureEntrySchedule({settings:setting,snap,now,delays:[30],focusDelaySeconds:30})[0];
 const entry=singleEngineForecast({settings:setting,snap,now}).receipt;
 const exit=singleEngineForecast({settings:{...setting,orderDurationMs:60000},snap,now}).receipt;
 assert.equal(result.projectedEntryPrice,entry.projectedPrice);
 assert.equal(result.projectedExitPrice,exit.projectedPrice);
 assert.equal(result.side,exit.projectedPrice>entry.projectedPrice?'CALL':'PUT');
 assert.equal(result.side,result.baselineSide);
 assert.ok(result.historicalPairCases>=6);
 assert.ok(result.candidateWeight>=0&&result.candidateWeight<=.55);
 assert.equal(result.actionable,false);
});
test('shadow forecast never changes a pinned approved decision or edits the PC/mobile card',()=>{
 const plan={engineId:'automatic',asset,side:'CALL',baselineSide:'CALL',
  candidateSide:'PUT',researchRegime:'oscillating',delaySeconds:30,
  issuedAt:now,entryAt:now+30000,exitAt:now+60000};
 const first=progressFutureEntryAudit({plan,now,quoteHistory:quotes});
 const completed=progressFutureEntryAudit({plan,previous:first,now:now+60000,
  quoteHistory:[...quotes,{ts:now+30000,price:1.1},{ts:now+60000,price:1.099}]});
 assert.deepEqual(completed.summaries.map(x=>[x.verified,x.correct,x.candidateVerified,x.candidateCorrect]),[[1,0,1,1]]);
});

test('microstructure: repeated reversals inside a range are oscillation, not a persistent reversal',()=>{
 const origin=now-1099000;
 const oscillating=Array.from({length:1100},(_,i)=>({
  ts:origin+i*1000,price:1.1+.00007*Math.sin(i*Math.PI/12)+.000006*Math.sin(i*Math.PI/4)
 }));
 const singleReversal=Array.from({length:1100},(_,i)=>({
  ts:origin+i*1000,price:1.1+(i<1092?i*.0000018:1092*.0000018-(i-1092)*.000004)
 }));
 const continuousTrend=Array.from({length:1100},(_,i)=>({
  ts:origin+i*1000,price:1.1+i*.0000018+.000005*Math.sin(i/35)
 }));
 const make=quoteHistory=>historicalFutureEntryAnalogs({
  quoteHistory,asOf:now,delaySeconds:30,holdingSeconds:30,engineId:'automatic'
 });
 const osc=make(oscillating),reversal=make(singleReversal),trend=make(continuousTrend);
 assert.equal(osc.regime,'oscillating');
 assert.equal(reversal.regime,'reversal');
 assert.equal(trend.regime,'trending');
 assert.ok(osc.turnDensity>reversal.turnDensity);
 assert.ok(reversal.possibleTurn);
 assert.ok(!trend.possibleTurn);
 // Classification informs future outcome research; never changes frozen side.
 const estimated=futureEntrySchedule({
  settings:settings('automatic'),
  snap:{...snap,quoteHistory:oscillating},
  now,delays:[30],focusDelaySeconds:30
 })[0];
 assert.equal(estimated.side,estimated.baselineSide);
});
