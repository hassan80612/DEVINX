import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {autonomousSelectiveEntry} from '../sentinel-trading-lab/agent/src/core/selective-autonomous.mjs';
import {futureEntrySchedule,confirmWindowEntry} from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';
import {forwardHorizonMatrix} from '../sentinel-trading-lab/agent/src/core/forward-horizon-matrix.mjs';
import {evolveOpportunity} from '../sentinel-trading-lab/agent/src/core/single-opportunity-window.mjs';
import {pcAuthoritativeWindow} from '../sentinel-trading-lab/src/lib/pc-authoritative-window.mjs';
const now=1800000003500;
const settings={asset:'TEST',engine:'automatic',forecastMode:'selective',orderDurationMs:30000};
function history(mirror=false){
 return Array.from({length:1801},(_,i)=>{
  const p=1.1+.0015*Math.sin((i+4)*2*Math.PI/104)+.00025*Math.sin((i+4)*2*Math.PI/(104*.43));
  return {ts:now-(1800-i)*1000,price:mirror?1.21/p:p};
 });
}
const snapFor=q=>({quoteHistory:q,quoteTs:now,price:q.at(-1).price,provider:'iq_option'});
const evaluate=q=>confirmWindowEntry({settings,snap:snapFor(q),now});

test('CALL and PUT confirmations observe a retracement inside the former frozen 15s interval',()=>{
 for(const mirror of [false,true]){
  const q=history(mirror),before=evaluate(q);
  assert.equal(before.side,mirror?'CALL':'PUT');
  assert.equal(before.featureAnchorAt,now);
  assert.ok(Math.abs(before.projectedEntryPrice/q.at(-1).price-1)<1e-10);
  const retracted=q.map(x=>x.ts>1800000000000?
   {...x,price:x.price*(mirror?1/1.003:1.003)}:x);
  const after=evaluate(retracted);
  assert.equal(after.side,null,'unseen reversal cannot reuse a saturated old pattern');
  assert.equal(after.status,'no-comparable-historical-pattern');
 }
});

test('a small new quote is reflected in the immediate entry price without waiting for a bar boundary',()=>{
 const q=history(),adjusted=q.map((x,i)=>i===q.length-1?{...x,price:x.price*1.000001}:x);
 const a=evaluate(q),b=evaluate(adjusted);
 assert.equal(b.side,'PUT');
 assert.notEqual(b.projectedEntryPrice,a.projectedEntryPrice);
 assert.ok(Math.abs(b.projectedEntryPrice/adjusted.at(-1).price-1)<1e-10);
});

test('retracted confirmation cannot fire, flip or restart an open selective window',()=>{
 const q=history(),initial=evaluate(q);
 const start=now-10000;
 let window=evolveOpportunity({settings,now:start,quoteAt:start,candidate:{
  ...initial,issuedAt:start,entryAt:now-1000,exitAt:now+29000}});
 assert.equal(window.phase,'open');
 const changed=q.map(x=>x.ts>1800000000000?{...x,price:x.price*1.003}:x);
 window=evolveOpportunity({previous:window,settings,now,quoteAt:now,confirmation:evaluate(changed)});
 assert.equal(window.phase,'open');
 assert.equal(window.side,'PUT');
 assert.equal(window.windowEndsAt,start+30000);
 assert.equal(window.entryReadyNow,false);
 assert.equal(pcAuthoritativeWindow({...window,now,quoteAt:now}).label,'↓ PUT · JANELA ABERTA · AGUARDE');
 window=evolveOpportunity({previous:window,settings,now:now+1000,quoteAt:now+1000,confirmation:initial});
 assert.equal(window.phase,'fired');
 assert.equal(pcAuthoritativeWindow({...window,now:now+1000,quoteAt:now+1000}).label,'ENTRADA AGORA · ↓ PUT');
 const again=evolveOpportunity({previous:window,settings,now:now+2000,quoteAt:now+2000,confirmation:initial});
 assert.equal(again.entryReadyNow,false);
 assert.equal(again.entryTriggeredAt,window.entryTriggeredAt);
});

test('selective candidates fit the remaining original window with time for a fresh confirmation',()=>{
 const q=history(),snap=snapFor(q);
 for(const remaining of [4000,8000,16000]){
  const activeWindow=evolveOpportunity({settings,now:now-30000+remaining,quoteAt:now-30000+remaining});
  const [r]=futureEntrySchedule({settings,snap,now,delays:[30],activeWindow});
  assert.equal(r.windowEndsAt,now+remaining);
  if(r.side)assert.ok(r.entryAt+1000<=activeWindow.windowEndsAt);
 }
});

test('expandable horizons use the selective estimator and leave the selected window untouched',()=>{
 const q=history(),snap=snapFor(q);
 const first=forwardHorizonMatrix({settings,snap,now});
 assert.deepEqual(first.entryRows.map(r=>r.delaySeconds),[5,10,30,60,120,300]);
 for(const h of [5,10,60,120,300]){
  const row=first.entryRows.find(r=>r.delaySeconds===h);
  const own=autonomousSelectiveEntry({quoteHistory:q,now,quoteTs:now,delaySeconds:h,holdingSeconds:h,asset:'TEST',engineId:'automatic'});
  assert.deepEqual(row,own);
 }
 const window=evolveOpportunity({settings,now,quoteAt:now,candidate:first.entryRows.find(r=>r.delaySeconds===30)});
 assert.equal(window.phase,'open');
 const next=forwardHorizonMatrix({settings,snap,now:now+500,previous:first,activeWindow:window});
 assert.equal(next.entryRows.length,6);
 assert.deepEqual(next.entryRows.find(r=>r.delaySeconds===30),window);
 const liveQ=[...q,{ts:now+1000,price:q.at(-1).price*1.000001}];
 const live=forwardHorizonMatrix({settings,snap:{...snapFor(liveQ),quoteTs:now+1000},now:now+1000,previous:next,activeWindow:window});
 assert.deepEqual(live.entryRows.find(r=>r.delaySeconds===30),window);
 assert.equal(live.entryRows.find(r=>r.delaySeconds===60).issuedAt,now+1000);
});

test('both PC and mobile expose expandable horizons in selective mode',()=>{
 const mobile=fs.readFileSync('sentinel-trading-lab/src/components/LiveScenarioCard.tsx','utf8');
 const pc=fs.readFileSync('sentinel-trading-lab/agent/worker/local-playwright-driver.mjs','utf8');
 assert.match(mobile,/const forecastHorizonStrip=vnext\?<details/);
 assert.doesNotMatch(pc,/d\.forecastMode==='selective'\?'':`<details[^\n]+data-sentinel-vnext-horizon-matrix/);
 for(const source of [mobile,pc])assert.match(source,/OUTROS HORÁRIOS FUTUROS · expandir/);
 assert.doesNotMatch(pc,/d\.vnext\?\.futureEntryForecast\?\.reason\|\|'ANALISANDO'/);
});
