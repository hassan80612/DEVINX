import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {oppositeTurnPressure} from '../sentinel-trading-lab/agent/src/core/turn-pressure.mjs';
import {validateSelectiveHistory} from '../sentinel-trading-lab/agent/src/core/selective-autonomous.mjs';
import {analystSnapshot,fitAnalystFrame} from '../sentinel-trading-lab/agent/worker/live-bridge.mjs';
import {LatestOverlayScheduler} from '../sentinel-trading-lab/agent/worker/latest-overlay-scheduler.mjs';
import {evolveOpportunity} from '../sentinel-trading-lab/agent/src/core/single-opportunity-window.mjs';
const now=1900000000000,settings={asset:'TEST',engine:'automatic',forecastMode:'selective',orderDurationMs:30000};
const sample=fn=>Array.from({length:31},(_,i)=>({ts:now-(30-i)*1000,price:Math.exp(fn(i))}));
for(const side of ['CALL','PUT']){
 const dir=side==='CALL'?1:-1;
 test(side+': sustained trend does not get blocked',()=>{
   const r=oppositeTurnPressure({quoteHistory:sample(i=>dir*i*.001),now,quoteTs:now,side});
   assert.equal(r.blocked,false);
 });
 test(side+': opposite turn is recognized on actual received quotes',()=>{
   const r=oppositeTurnPressure({quoteHistory:sample(i=>dir*(i<=24?i*.001:24*.001-(i-24)*.003)),now,quoteTs:now,side});
   assert.equal(r.blocked,true);
   assert.equal(r.phase,'counterpressure-confirmed');
 });
 test(side+': shallow pullback is not treated as reversal',()=>{
   const r=oppositeTurnPressure({quoteHistory:sample(i=>dir*(i<=24?i*.001:24*.001-(i-24)*.0002)),now,quoteTs:now,side});
   assert.equal(r.blocked,false);
 });
 test(side+': future-arriving ticks cannot prove a turn',()=>{
   const rows=sample(i=>dir*(i<=24?i*.001:24*.001-(i-24)*.003))
     .map((q,i)=>({...q,receivedAt:i>27?now+3000:q.ts}));
   const r=oppositeTurnPressure({quoteHistory:rows,now,quoteTs:now,side});
   assert.equal(r.blocked,false);
 });
}
const candidate=(start,side='CALL')=>({side,issuedAt:start,entryAt:start+5000,
  exitAt:start+35000,projectedEntryPrice:1.1,
  projectedExitPrice:side==='CALL'?1.11:1.09,delaySeconds:30,holdingSeconds:30});
test('a missed confirmation does not flip or restart the original opportunity window',()=>{
 const start=now-8000;let w=evolveOpportunity({settings,now:start,quoteAt:start,candidate:candidate(start)});
 assert.equal(w.phase,'open');
 const end=w.windowEndsAt;
 w=evolveOpportunity({settings,previous:w,now:start+7000,quoteAt:start+7000,confirmation:null});
 assert.equal(w.phase,'open');assert.equal(w.entryReadyNow,false);
 assert.equal(w.side,'CALL');assert.equal(w.windowEndsAt,end);
 const later=evolveOpportunity({settings,previous:w,now:start+8000,quoteAt:start+8000,
   candidate:candidate(start+8000,'PUT'),confirmation:null});
 assert.equal(later.phase,'open');assert.equal(later.windowEndsAt,end);
 assert.equal(later.side,'CALL');
});
test('on-time confirmation still triggers exactly once',()=>{
 const start=now-8000;let w=evolveOpportunity({settings,now:start,quoteAt:start,candidate:candidate(start)});
 w=evolveOpportunity({settings,previous:w,now:start+5350,quoteAt:start+5300,
   confirmation:{side:'CALL',projectedEntryPrice:1.1,projectedExitPrice:1.11}});
 assert.equal(w.phase,'fired');assert.equal(w.entryTriggeredAt,start+5350);
 const duplicate=evolveOpportunity({settings,previous:w,now:start+5800,quoteAt:start+5800,
   confirmation:{side:'CALL',projectedEntryPrice:1.1,projectedExitPrice:1.11}});
 assert.equal(duplicate.phase,'fired');assert.equal(duplicate.entryReadyNow,false);
});
test('counterturn checks remain Seletiva-only; Contínua is restored to original 67.26',()=>{
 const f=fs.readFileSync('sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs','utf8');
 const s=fs.readFileSync('sentinel-trading-lab/agent/src/core/selective-autonomous.mjs','utf8');
 const continuous=f.slice(f.indexOf('function continuousWindow('),f.indexOf('export function futureEntrySchedule('));
 const confirm=f.slice(f.indexOf(' const engineId=String(settings.engine||\'automatic\');',f.indexOf('export function confirmWindowEntry(')));
 assert.doesNotMatch(continuous,/oppositeTurnPressure/);
 assert.doesNotMatch(confirm,/oppositeTurnPressure/);
 assert.match(f,/forecast.side&&oppositeTurnPressure/);
 assert.match(f,/if\(inSelective\)/);
 assert.match(s,/validateSelectiveHistory\(\{tested,hits\}\)/);
});

test('50 percent means >=4 genuine validations, never a zero-sample pass',()=>{
 for(const [tested,hits,valid] of [
   [0,0,false],[1,1,false],[3,3,false],[4,2,true],
   [4,3,true],[5,3,true],[5,2,false],[6,3,true],
   [7,4,true],[10,5,true],[10,6,true]]){
   assert.equal(validateSelectiveHistory({tested,hits}),valid,`n=${tested}, hits=${hits}`);
 }
});

test('quote more than 2s after scheduled entry follows original 67.26 confirmation, no rearm',()=>{
 const continuous={...settings,forecastMode:'continuous'};
 const start=now-8000;
 let w=evolveOpportunity({settings:continuous,now:start,quoteAt:start,candidate:candidate(start)});
 const originalDeadline=w.windowEndsAt;
 w=evolveOpportunity({settings:continuous,previous:w,now:start+7200,quoteAt:start+7200,
   confirmation:{side:'CALL',projectedEntryPrice:1.1,projectedExitPrice:1.11}});
 assert.equal(w.phase,'fired');
 assert.equal(w.entryReadyNow,true);
 assert.equal(w.entryTriggeredAt,start+7200);
 assert.equal(w.windowEndsAt,originalDeadline);
 assert.equal(w.side,'CALL');
 const repeated=evolveOpportunity({settings:continuous,previous:w,now:start+9000,quoteAt:start+9000,
   confirmation:{side:'CALL',projectedEntryPrice:1.1,projectedExitPrice:1.11}});
 assert.equal(repeated.phase,'fired');assert.equal(repeated.entryReadyNow,false);
});
test('oversized optional cards cannot discard the mobile signed entry event',()=>{
 const t=1800000000000,asset='EUR/USD OTC';
 const state={state:'running',agentVersion:'13.4.67.26',settings:{asset,engine:'automatic',forecastMode:'selective',orderDurationMs:30000},
  lastResult:{asset,analysis:{operationalSignal:{side:'WAIT',state:'ANALISANDO'},
   vnext:{engineId:'automatic',expirySeconds:30,
    cards:Array.from({length:3},(_,i)=>({id:'card'+i+'-'.padEnd(4500,'!'),side:'CALL'})),
    opportunityWindow:{phase:'fired',windowStartedAt:t,windowEndsAt:t+30000,entryAt:t+10000},
    futureEntryAnchor:{side:'PUT',asset,engineId:'automatic',delaySeconds:30,
      issuedAt:t,holdingSeconds:30,entryAt:t+10000,exitAt:t+40000,phase:'fired',entryTriggeredAt:t+10000}}}}};
 const frame=fitAnalystFrame(analystSnapshot(state,{
  symbol:asset,validatedSymbol:asset,assetValidated:true,analysisFeedValidated:true,lastQuoteAt:t+10000,quote:1.1}),2920);
 assert.ok(frame,'critical frame was dropped');
 assert.equal(frame.lastResult.analysis.vnext.ea[1],'PUT');
 assert.equal(frame.lastResult.analysis.vnext.ow[0],'fired');
 assert.ok(Buffer.byteLength(JSON.stringify(frame))<=2920);
});
test('urgent PC overlay queue exposes actual wait and render delay',async()=>{
 const scheduler=new LatestOverlayScheduler(async()=>{}, {minIntervalMs:1200,slowThresholdMs:800,slowCooldownMs:3000});
 try{
   scheduler.publish('iq_option',{side:'CALL'},{urgent:true});
   await new Promise(r=>setTimeout(r,105));
   const metrics=scheduler.metrics();
   assert.equal(metrics.urgentRenderCount,1);
   assert.ok(metrics.lastQueueDelayMs>=0);
   assert.ok(metrics.lastUrgentDeliveryMs>=0);
 }finally{if(scheduler.timer)clearTimeout(scheduler.timer)}
});
