import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {selectiveClosedEntry} from '../sentinel-trading-lab/agent/src/core/selective-closed-entry.mjs';
import {selectiveEvidence,qualifyStrategyInterval} from '../sentinel-trading-lab/agent/src/core/selective-forward-model.mjs';
import {futureEntrySchedule} from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';
import {structureForecast} from '../sentinel-trading-lab/agent/src/core/automatic-structure-forecast.mjs';
const AT=1800000030000;
const now=AT+12000;
function data(step=4000,minutes=23){
 const samples=[];let i=0;
 for(let t=AT-minutes*60000;t<=AT;t+=step,i++)
   samples.push({ts:t,price:Math.exp(Math.log(1.04)+.000005*i+
    .00002*Math.sin(i/17)+.000015*Math.sin(i/47))});
 return samples;
}
const input=(quotes=data(),price=quotes.at(-1).price,at=now)=>({
 quoteHistory:quotes,now:at,delaySeconds:30,holdingSeconds:30,
 engineId:'automatic',forecastModel:'selected-strengths-67.5',
 asset:'EUR/USD',provider:'test',currentQuoteAt:at, currentPrice:price
});
test('closed selective direction does not flip when current forming candle flickers',()=>{
 const history=data();
 const a=selectiveClosedEntry(input(history,history.at(-1).price,now));
 const b=selectiveClosedEntry(input(history,history.at(-1).price*1.000001,now));
 const c=selectiveClosedEntry(input(history,history.at(-1).price*.999999,now));
 assert.ok(['CALL','PUT'].includes(a.side),JSON.stringify(a));
 assert.equal(b.side,a.side);
 assert.equal(c.side,a.side);
 assert.equal(b.projectedEntryPrice,a.projectedEntryPrice);
 assert.equal(c.projectedExitPrice,a.projectedExitPrice);
 assert.equal(a.asOf,AT);
});
test('realized closed candle movement changes the forecast base without seeing a future quote',()=>{
 const original=data(),extra={ts:AT+16000,price:original.at(-1).price*1.03};
 const base=selectiveClosedEntry(input(original));
 const future=selectiveClosedEntry(input([...original,extra],original.at(-1).price));
 assert.deepEqual(future,base);
 const arrivingLate={ts:AT-12000,price:original.at(-1).price*100,receivedAt:AT+8000};
 const late=selectiveClosedEntry(input([...original,arrivingLate],original.at(-1).price));
 assert.deepEqual(late,base);
});
test('live short shock cannot reuse a stale closed-candle signal',()=>{
 const q=data(),old=q.at(-1).price;
 const shocked=selectiveClosedEntry(input(q,old*1.02));
 assert.equal(shocked.side,null);
 assert.equal(shocked.status,'unconfirmed-live-breakout');
});
test('selective long regression accepts genuine 4s historical continuity while live prices remain strict',()=>{
 const quotes=data(),fresh=selectiveEvidence({quoteHistory:quotes,asOf:AT});
 assert.ok(fresh.historySeconds>776);
 const details={};
 const structure=structureForecast({quoteHistory:quotes,asOf:AT,selectedSeconds:30,
   historicalQuoteGapMs:8000,diagnostics:details});
 assert.ok(details.historySeconds>776);
 assert.notEqual(details.status,'waiting-history');
 const blocked=qualifyStrategyInterval({forecast:{side:'CALL',holdingSeconds:30,
   projectedEntryPrice:1,projectedExitPrice:1.001},quoteHistory:quotes,asOf:AT+5000});
 assert.equal(blocked.side,null);
 assert.equal(blocked.qualification.status,'waiting-quote');
});
test('actual selective matrix uses closed-bars forecast and never grants stale entry',()=>{
 const q=data();
 const snap={quoteHistory:q,quoteTs:now,price:q.at(-1).price,provider:'test'};
 const result=futureEntrySchedule({settings:{forecastMode:'selective',engine:'automatic',
     asset:'EUR/USD',orderDurationMs:30000},
   snap,now,delays:[30],adaptiveHistory:q,forecastModel:'selected-strengths-67.5'})[0];
 assert.equal(result.modelVersion,'adaptive-direct-trajectory-v1');
 assert.equal(result.issuedAt,now);
 assert.equal(result.entryAt,now+30000);
 assert.equal(result.exitAt,now+60000);
 assert.ok(result.qualification);
 assert.equal(result.actionable,false);
});
test('all existing 15-minute and 60-minute options keep a completed-bar model',()=>{
 const q=data(),p=q.at(-1).price;
 for(const h of [900,3600]){
   const projected=selectiveClosedEntry({...input(q,p),delaySeconds:h,holdingSeconds:h});
   assert.notEqual(projected.status,'invalid-interval');
   assert.ok(Number.isFinite(projected.projectedEntryPrice)||projected.projectedEntryPrice===null);
 }
});
test('mobile quote is published before expensive selected forecast without faking a fresh signal',()=>{
 const w=fs.readFileSync('sentinel-trading-lab/agent/worker/index.mjs','utf8');
 const handler=w.slice(w.indexOf('driver.setMarketUpdateHandler?.('),w.indexOf('async function ensureLocalCockpitBroker'));
 const tick=w.slice(w.indexOf('async function loop()'),w.indexOf('const brokerSwitching'));
 assert.ok(handler.indexOf('publishLiveFrame()')>=0);
 assert.ok(handler.indexOf('publishLiveFrame()')<handler.indexOf('realtimeQuotes.request()'));
 assert.ok(tick.indexOf('publishLiveFrame()')<tick.indexOf('await runtime.tick(loopNow'));
 assert.ok(tick.indexOf('await runtime.tick(loopNow')<tick.lastIndexOf('publishLiveFrame()'));
});

test('forecast deadline keeps original direction briefly',()=>{
 const code=fs.readFileSync('sentinel-trading-lab/agent/src/core/runtime.mjs','utf8');
 assert.ok(code.includes('const entryAnchor=sameEntry?oldEntry:newEntryValid?currentEntry:null'));
 const view=fs.readFileSync('sentinel-trading-lab/src/components/LiveScenarioCard.tsx','utf8');
 assert.ok(!view.includes('HORÁRIO PREVISTO ATINGIDO'));
});

test('selective customers see no future technical details but continuous mode retains them',()=>{
 const card=fs.readFileSync('sentinel-trading-lab/src/components/LiveScenarioCard.tsx','utf8');
 assert.ok(card.includes("{forecastMode!=='selective'&&<details className=\"vnextForecastDetails\""));
 assert.ok(card.includes("const forecastHorizonStrip=vnext&&forecastMode!=='selective'?<details"));
 assert.ok(card.includes("m.quoteFresh?'Aguardando confirmação':'Aguardando cotação atual'"));
 assert.ok(card.includes('data-testid="forecast-countdown-clock"'));
 assert.ok(card.includes('data-testid="future-price-projection"'));
});
