import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {selectiveEvidence,qualifyStrategyInterval} from '../sentinel-trading-lab/agent/src/core/selective-forward-model.mjs';
import {futureEntrySchedule} from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';
import {selectiveClosedEntry} from '../sentinel-trading-lab/agent/src/core/selective-closed-entry.mjs';
const now=1800000000000;
const quotes=(seconds=52,interval=1000)=>Array.from(
 {length:Math.floor(seconds*1000/interval)+1},(_,i)=>({
 ts:now-seconds*1000+i*interval,
 price:1.05+0.00001*i+0.000002*Math.sin(i/3)
 }));
test('5s Seletiva uses three actual completed 10s bars, never a 12m31s wait',()=>{
 const q=quotes(),e=selectiveEvidence({quoteHistory:q,asOf:now,selectedSeconds:5});
 assert.equal(e.earlyReady,true);
 assert.equal(e.barSeconds,10);
 assert.equal(e.earlyDirection,'CALL');
 const f={side:'CALL',holdingSeconds:5,delaySeconds:5,
   projectedEntryPrice:1.06,projectedExitPrice:1.061};
 const accepted=qualifyStrategyInterval({forecast:f,evidence:e,asOf:now});
 assert.equal(accepted.qualification.requiredSeconds,30);
 assert.equal(accepted.qualification.evidence,'three-completed-bars');
 assert.equal(accepted.side,'CALL');
});
test('selected future forecast never waits 12 minutes for 5s, 30s or 60s',()=>{
 const q=quotes(100),snap={quoteHistory:q,quoteTs:now,price:q.at(-1).price,provider:'test'};
 for(const h of [5,30,60]){
  const e=selectiveEvidence({quoteHistory:q,asOf:now,selectedSeconds:h});
  assert.equal(e.earlyReady,true);
  const r=futureEntrySchedule({settings:{engine:'automatic',forecastMode:'selective',
   asset:'EUR/USD',orderDurationMs:h*1000},snap,now,delays:[h],
   adaptiveHistory:q,forecastModel:'selected-strengths-67.5'})[0];
  assert.equal(r.qualification.requiredSeconds,Math.max(10,Math.min(30,h))*3);
  assert.ok(['forecast','waiting-selective-entry'].includes(r.status));
  assert.ok(r.qualification.historySeconds<751);
  assert.ok(r.reason===undefined||!r.reason.includes('12min'));
 }
});
test('old research history cannot force permission, stale and contrary forecasts stay blocked',()=>{
 const q=quotes(100),ctx=selectiveEvidence({quoteHistory:q,asOf:now+4000,selectedSeconds:5});
 const f={side:'CALL',holdingSeconds:5,projectedEntryPrice:1.06,projectedExitPrice:1.061};
 const stale=qualifyStrategyInterval({forecast:f,evidence:ctx,asOf:now+4000});
 assert.equal(stale.qualification.status,'waiting-quote');
 assert.equal(stale.side,null);
 const fresh=selectiveEvidence({quoteHistory:q,asOf:now,selectedSeconds:5});
 const contrary=qualifyStrategyInterval({forecast:{...f,side:'PUT'},evidence:fresh,asOf:now});
 assert.equal(contrary.side,null);
});
test('forming current candle cannot invert a completed 10s selective prediction',()=>{
 const q=quotes(65),base=q.at(-1).price;
 const p={quoteHistory:q,now,delaySeconds:5,holdingSeconds:5,engineId:'automatic',
  forecastModel:'selected-strengths-67.5',asset:'EUR/USD',provider:'test',currentQuoteAt:now};
 const a=selectiveClosedEntry({...p,currentPrice:base});
 const b=selectiveClosedEntry({...p,currentPrice:base*(1+0.00000001)});
 assert.equal(a.side,b.side);
 assert.equal(a.status,b.status);
});
test('the mobile 0:00 receipt is dismissed in under one second, and normal layout is unchanged',()=>{
 const c=fs.readFileSync('sentinel-trading-lab/src/components/LiveScenarioCard.tsx','utf8');
 const engine=fs.readFileSync('sentinel-trading-lab/agent/src/core/runtime.mjs','utf8');
 assert.match(c,/const expired=pinned&&now-plannedAt>=400/);
 assert.match(c,/entryPlanDisplayable=entryPlanValid&&plannedAt>now/);
 assert.match(engine,/now-Number\(oldEntry.entryAt\)<400/);
 assert.match(c,/forecastMode!=='selective'&&<details className="vnextForecastDetails"/);
 assert.doesNotMatch(c,/PREVISÃO ENCERRADA · AGUARDANDO NOVA/);
});
