import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {lightweightDashboard} from '../sentinel-trading-lab/agent/src/core/vnext-market-cards.mjs';
import {selectedForecast} from '../sentinel-trading-lab/agent/src/core/unified-strategy-forecast.mjs';
import {PAIR_STRATEGIES} from '../sentinel-trading-lab/agent/src/core/pair-strategy-catalog.mjs';
import {futureEntrySchedule} from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';
import {forwardHorizonMatrix} from '../sentinel-trading-lab/agent/src/core/forward-horizon-matrix.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {analystSnapshot,fitAnalystFrame} from '../sentinel-trading-lab/agent/worker/live-bridge.mjs';
const START=1800000000000;
function quotes(seed=3141,n=2400){
 let state=seed>>>0,p=Math.log(1.1);
 return Array.from({length:n},(_,i)=>{
  state=(Math.imul(state,1664525)+1013904223)>>>0;
  const noise=(state/4294967296-.5)*.000018;
  p+=.0000023+Math.sin(i*.035)*.000003+Math.sin(i*.19)*.000006+noise;
  return {ts:START+1000*i,price:Math.exp(p)};
 });
}
const snap=(rows)=>({quoteHistory:rows,quoteTs:rows.at(-1).ts,price:rows.at(-1).price,provider:'iq_option'});
const config=(engine,duration,more={})=>({asset:'EUR/USD OTC',engine,orderDurationMs:duration*1000,...more});
test('pair disagreements never remove any of the 3 market-observation tiles',()=>{
 const empty=lightweightDashboard({quoteHistory:[]});
 assert.deepEqual(empty.cards.map(c=>c.id),['market-now','prior-structure','total-of-totals']);
 assert.ok(empty.cards.every(c=>c.callPct===null));
 for(const seed of [315,333,510,711]){
  const rows=quotes(seed),now=rows.at(-1).ts;
  for(const p of PAIR_STRATEGIES){
   const output=selectedForecast({settings:config(p.id,180),snap:snap(rows),now});
   assert.equal(output.cards.length,3);
   assert.deepEqual(output.cards.map(x=>x.id),['market-now','prior-structure','total-of-totals']);
   assert.ok(['pair-agreement','pair-disagreement','pair-estimate-unavailable'].includes(output.computedStatus));
   if(output.computedStatus==='pair-disagreement'){
    assert.equal(output.receipt,null);
    assert.equal(output.operational.side,'AGUARDAR');
   }
  }
 }
});
test('Agora never waits for a second lead time: E=0, exit=now+D for all options',()=>{
 const q=quotes(991),now=q.at(-1).ts,shot=snap(q);
 for(const engine of ['automatic',...PAIR_STRATEGIES.map(p=>p.id),'trend','mean_reversion']){
  const settings=config(engine,180,{entryTimeMode:'fixed',entryLeadSeconds:15});
  const x=futureEntrySchedule({settings,snap:shot,now});
  assert.equal(x.length,1);
  const a=x[0];
  assert.equal(a.mode,'fixed');
  assert.equal(a.delaySeconds,0);
  assert.equal(a.holdingSeconds,180);
  if(a.side){
   assert.equal(a.entryAt,now);
   assert.equal(a.exitAt,now+180000);
  }else{
   assert.ok(['no-current-forecast'].includes(a.status));
  }
  const matrix=forwardHorizonMatrix({settings,snap:shot,now,primary:selectedForecast({settings,snap:shot,now})});
  assert.equal(matrix.entryRows.length,1);
  assert.equal(matrix.entryRows[0].delaySeconds,0);
  assert.equal(matrix.entryRows[0].holdingSeconds,180);
 }
});
test('automatic time mode is strictly historical, does not fall back to a disguised fixed 30s',()=>{
 const q=quotes(3701,2600),now=q.at(-1).ts,shot=snap(q);
 for(const eng of ['automatic','pair_reversal','pair_levels_breakout','pair_retest']){
  const settings=config(eng,180,{entryTimeMode:'automatic',entryLeadSeconds:30});
  const first=futureEntrySchedule({settings,snap:shot,now})[0];
  assert.equal(first.mode,'automatic');
  assert.equal(first.holdingSeconds,180);
  if(first.side){
   assert.ok([5,10,15,30].includes(first.delaySeconds));
   assert.equal(first.exitAt,first.entryAt+180000);
   assert.equal(first.status,'automatic-trajectory-window');
   assert.ok(first.neighbors>=6);
  }else{
   assert.equal(first.delaySeconds,null);
   assert.ok(['waiting-complete-trajectory-history','no-confirmed-automatic-window','no-strategy-agreement-with-history'].includes(first.status));
  }
  const leak=futureEntrySchedule({settings,snap:{...shot,quoteHistory:[...q,
    {ts:now+5000,price:1000000}]},now})[0];
  assert.deepEqual(first,leak,'quotes after issuance must not influence automatic entry timing');
 }
});
test('changing strategy and mode resets old future entry anchor without losing market totals',()=>{
 const q=quotes(73),now=q.at(-1).ts,shot=snap(q);
 const rt=new DemoTradingRuntime({enableVNext:true});
 rt.patchSettings(config('automatic',180,{entryTimeMode:'fixed',entryLeadSeconds:15}));
 const a=rt._signalValidationGate({settings:rt.settings,snap:shot,analysis:{side:'WAIT'},now}).analysis.vnext;
 assert.equal(a.futureEntryRows[0].holdingSeconds,180);
 assert.equal(a.cards.length,3);
 rt.patchSettings({engine:'pair_reversal'});
 assert.equal(rt.vnextFutureEntryAnchor,null);
 assert.equal(rt.vnextHorizonMatrix,null);
 const b=rt._signalValidationGate({settings:rt.settings,snap:shot,analysis:{side:'WAIT'},now}).analysis.vnext;
 assert.equal(b.engineId,'pair_reversal');
 assert.equal(b.cards.length,3);
 rt.patchSettings({entryTimeMode:'automatic'});
 assert.equal(rt.vnextFutureEntryAnchor,null);
 const c=rt._signalValidationGate({settings:rt.settings,snap:shot,analysis:{side:'WAIT'},now}).analysis.vnext;
 assert.equal(c.engineId,'pair_reversal');
 assert.equal(c.futureEntryRows[0].mode,'automatic');
 assert.equal(c.cards.length,3);
 assert.equal(rt.settings.orderDurationMs,180000);
 assert.equal(rt.settings.demoAutopilot,false);
});
test('signed mobile frame carries E, D, mode and 3 stable market readings',async()=>{
 const q=quotes(223),now=q.at(-1).ts,shot=snap(q);
 const rt=new DemoTradingRuntime({enableVNext:true});
 rt.patchSettings(config('pair_reversal',180,{entryTimeMode:'fixed',entryLeadSeconds:15}));
 const out=rt._signalValidationGate({settings:rt.settings,snap:shot,analysis:{side:'WAIT'},now});
 rt.lastResult={asset:'EUR/USD OTC',analysis:out.analysis};
 const live={symbol:'EUR/USD OTC',validatedSymbol:'EUR/USD OTC',assetValidated:true,
  analysisFeedValidated:true,lastQuoteAt:now,quote:q.at(-1).price};
 const frame=analystSnapshot(await rt.status(),live);
 const v=frame.lastResult.analysis.vnext;
 assert.equal(frame.settings.entryTimeMode,'fixed');
 assert.equal(frame.settings.entryLeadSeconds,15);
 assert.equal(frame.settings.orderDurationMs,180000);
 assert.equal(v.cards.length,3);
 const timing=v.er[0];
 assert.equal(timing[0],0);assert.equal(timing[5],180);assert.equal(timing[6],'fixed');
 const bounded=fitAnalystFrame(frame,2920);
 assert.ok(bounded,'a tight live frame must still fit with entry mode');
 assert.equal(bounded.lastResult.analysis.vnext.cards.length,3);
});
test('PC and mobile both expose compact mode selector, steady cards and independent duration controls',()=>{
 const pc=readFileSync(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
 const mobile=readFileSync(new URL('../sentinel-trading-lab/src/components/LiveScenarioCard.tsx',import.meta.url),'utf8');
 const adapter=readFileSync(new URL('../sentinel-trading-lab/src/lib/live-card-model.ts',import.meta.url),'utf8');
 const web=readFileSync(new URL('../sentinel-trading-lab/src/app/console/page.tsx',import.meta.url),'utf8');
 assert.ok(pc.includes('data-sentinel-entry-mode'));
 assert.ok(pc.includes('data-sentinel-setting="entryTimeMode"'));
 assert.ok(!pc.includes('data-sentinel-setting="entryLeadSeconds"'));
 assert.ok(pc.includes('DURAÇÃO DA OPERAÇÃO'));
 assert.ok(pc.includes("['market-now','TOTAL MERCADO AGORA']"));
 assert.ok(mobile.includes('aria-label="Modo da entrada prevista"'));
 assert.ok(!mobile.includes('aria-label="Tempo fixo até a entrada"'));
 assert.ok(mobile.includes('Duração da operação'));
 assert.ok(adapter.includes('Number(entryAnchor?.holdingSeconds)===horizon'));
 assert.ok(!mobile.includes('<MobileExperimentalControls'));
 assert.ok(web.includes('pair_reversal'));
});

test('no E=D coupling: immediate forecast and automatic timestamps never freeze main model',()=>{
 const rows=quotes(777,2600),now=rows.at(-1).ts,shot=snap(rows);
 const rt=new DemoTradingRuntime({enableVNext:true});
 for(const engine of ['automatic','pair_reversal','pair_levels_breakout','pair_retest']){
  for(const holdingSeconds of [30,60,180,300]){
   rt.patchSettings(config(engine,holdingSeconds,{entryTimeMode:'fixed',entryLeadSeconds:300}));
   const a=rt._signalValidationGate({settings:rt.settings,snap:shot,analysis:{side:'WAIT'},now}).analysis.vnext;
   assert.equal(a.futureEntryRows.length,1);
   const e=a.futureEntryRows[0];
   assert.equal(e.delaySeconds,0);
   assert.equal(e.holdingSeconds,holdingSeconds);
   if(e.side){
    assert.ok(a.futureEntryAnchor);
    assert.equal(a.futureEntryAnchor.delaySeconds,0);
    assert.equal(a.futureEntryAnchor.exitAt,now+holdingSeconds*1000);
   }
   rt.patchSettings({entryTimeMode:'automatic'});
   const b=rt._signalValidationGate({settings:rt.settings,snap:shot,analysis:{side:'WAIT'},now}).analysis.vnext;
   assert.equal(b.futureEntryRows[0].mode,'automatic');
   assert.equal(b.futureEntryRows[0].holdingSeconds,holdingSeconds);
   assert.equal(b.engineId,engine);
   assert.equal(b.cards.length,3);
  }
 }
});
test('history cache updates without repeating full path scans for every quote',()=>{
 const q=quotes(2233,2700),shot=snap(q),now=shot.quoteTs;
 const settings=config('automatic',60,{entryTimeMode:'automatic'});
 const start=performance.now();
 const a=futureEntrySchedule({settings,snap:shot,now});
 const firstMs=performance.now()-start;
 const repeatStart=performance.now();
 for(let i=0;i<5;i++){
  const updated=futureEntrySchedule({settings,snap:shot,now:now+50*i});
  assert.equal(updated[0].mode,'automatic');
 }
 const repeatMs=performance.now()-repeatStart;
 console.log('SENTINEL_AUTOMATIC_ENTRY_BUDGET='+JSON.stringify({
  firstMs:Math.round(firstMs),fiveSubsequentMs:Math.round(repeatMs),
  selectedLead:a[0]?.delaySeconds,status:a[0]?.status}));
 assert.ok(firstMs<4000,'one future-entry analysis must not block the card for seconds');
 assert.ok(repeatMs<3000,'cached market context should not monopolize live updates');
});
