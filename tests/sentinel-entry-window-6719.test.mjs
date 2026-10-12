import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {entryOffsets,planEntryWindow} from '../sentinel-trading-lab/agent/src/core/entry-window-planner.mjs';
import {futureEntrySchedule} from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';
import {forwardHorizonMatrix} from '../sentinel-trading-lab/agent/src/core/forward-horizon-matrix.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const now=1800000003500;
const quotes=Array.from({length:2501},(_,i)=>({
 ts:now-(2500-i)*1000,price:1.1+.0006*Math.sin(i*.06)+.00012*Math.cos(i*.19)
}));
const snap={quoteHistory:quotes,quoteTs:now,price:quotes.at(-1).price,provider:'iq_option'};
test('window candidates include early, middle and near-end opportunities for all selected expirations',()=>{
 for(const h of [5,10,15,30,60,120,300,600,900,3600]){
  const c=entryOffsets(h);
  assert.ok(c.length>=3);
  assert.ok(c[0]>=2&&c[0]<=Math.max(3,h*.2));
  assert.ok(c.at(-1)<=h);
  assert.ok(c.at(-1)>=h*.8);
  assert.ok(c.some(x=>x>h*.35&&x<h*.85));
 }
});
test('selected opportunity is determined by OWN directional forecast quality, never forced at deadline',()=>{
 const samples={};
 for(const lead of [3,7,14,22,29])samples[lead]=.3;
 samples[14]=2.2;
 const r=planEntryWindow({now,windowSeconds:30,holdingSeconds:30,engineId:'automatic',asset:'TEST',
  evaluateLead:lead=>({side:'PUT',projectedEntryPrice:1.1,projectedExitPrice:1.08,
    selectionStrength:samples[lead]})});
 assert.equal(r.entryOffsetSeconds,14);
 assert.equal(r.entryAt,now+14000);
 assert.equal(r.exitAt,now+44000);
 assert.equal(r.windowEndsAt,now+30000);
 assert.equal(r.side,'PUT');
 assert.equal(r.actionable,false);
 const absent=planEntryWindow({now,windowSeconds:30,evaluateLead:()=>null});
 assert.equal(absent.side,null);
 assert.equal(absent.status,'scanning-entry-window');
 assert.equal(absent.entryAt,null);
});
test('historical selective and continuous evaluate the window independently at the chosen expiry',()=>{
 for(const mode of ['selective','continuous'])for(const h of [5,30,60]){
  const matrix=forwardHorizonMatrix({settings:{engine:'automatic',asset:'TEST',
   forecastMode:mode,orderDurationMs:h*1000},snap,now,
   forecastModel:'selected-strengths-67.5'});
  const r=matrix.entryRows.find(x=>x.delaySeconds===h);
  assert.ok(r);
  assert.equal(r.holdingSeconds,h);
  assert.equal(r.windowEndsAt,now+h*1000);
  if(r.side){
   assert.ok(r.entryOffsetSeconds>=2&&r.entryOffsetSeconds<=h);
   assert.equal(r.entryAt,now+r.entryOffsetSeconds*1000);
   assert.equal(r.exitAt,r.entryAt+h*1000);
   assert.equal(r.side,r.projectedExitPrice>r.projectedEntryPrice?'CALL':'PUT');
  }else assert.equal(r.status,'scanning-entry-window');
  assert.ok(!('qualification' in r));
  if(mode==='selective')assert.equal(r.forecastOwner,'selective-historical-outcomes-v2');
  else assert.equal(r.forecastOwner,'continuous-selected-engine-window-v1');
 }
});
test('selected specialist remains independently selected only in continuous; selective ignores it',()=>{
 const common={snap,now,delays:[30]};
 const a=futureEntrySchedule({...common,settings:{engine:'trend',asset:'TEST',forecastMode:'selective',orderDurationMs:30000}});
 const b=futureEntrySchedule({...common,settings:{engine:'breakout',asset:'TEST',forecastMode:'selective',orderDurationMs:30000}});
 assert.equal(a[0].side,b[0].side);
 assert.equal(a[0].entryAt,b[0].entryAt);
 const c=futureEntrySchedule({...common,settings:{engine:'trend',asset:'TEST',forecastMode:'continuous',orderDurationMs:30000},
  forecastModel:'selected-strengths-67.5'});
 assert.equal(c[0].engineId,'trend');
});
test('old planned entry may be confirmed ONLY by a fresh independently matched market reading',()=>{
 const rt=new DemoTradingRuntime({enableVNext:true,forecastModel:'selected-strengths-67.5'});
 rt.patchSettings({engine:'automatic',asset:'TEST',forecastMode:'selective',orderDurationMs:30000});
 const raw=fs.readFileSync('sentinel-trading-lab/agent/src/core/runtime.mjs','utf8');
 assert.match(raw,/const nextWindow=evolveOpportunity/);
 assert.match(raw,/confirmWindowEntry/);
 const contract=fs.readFileSync('sentinel-trading-lab/agent/src/core/single-opportunity-window.mjs','utf8');
 assert.match(contract,/confirmation\?\.side===old.side/);
 assert.match(contract,/now<old.entryAt/);
 assert.match(contract,/Number\(quoteAt\)<old.entryAt/);
});
test('PC/mobile get EXACT Agent timestamp and entry-now requires renewed quote',()=>{
 const bridge=fs.readFileSync('sentinel-trading-lab/agent/worker/live-bridge.mjs','utf8');
 const mobile=fs.readFileSync('sentinel-trading-lab/src/lib/live-card-model.ts','utf8');
 const card=fs.readFileSync('sentinel-trading-lab/src/components/LiveScenarioCard.tsx','utf8');
 const pc=fs.readFileSync('sentinel-trading-lab/agent/worker/local-playwright-driver.mjs','utf8');
 assert.match(bridge,/Number\(e.entryAt\)\|\|0,Number\(e.exitAt\)\|\|0,e.entryReadyNow===true\?1:0/);
 assert.match(mobile,/entryAt:Number\(v\[6\]\)/);
 assert.match(card,/readyNow=\{entryMoment\}/);
 assert.match(pc,/data-entry-ready=/);
 assert.match(pc,/verifiedNow=pane.getAttribute/);
 assert.match(pc,/target>nowClock\|\|verifiedNow/);
});
