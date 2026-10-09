import assert from 'node:assert/strict';
import {liveCardModel} from '../sentinel-trading-lab/src/lib/live-card-model.ts';
const now=1800000000000;
const fixture=()=>({state:'running',runtimeKind:'remote-agent',remote:{online:true},settings:{asset:'TEST',forecastHorizonSeconds:60,orderDurationMs:60000},liveBroker:{symbol:'TEST',assetValidated:true,feedValidated:true},feed:{quoteTs:now,price:107},lastEvalMs:now,lastResult:{asset:'TEST',analysis:{operationalSignal:{asset:'TEST',forecastHorizonSeconds:60,durationMs:60000,scenario:{side:'CALL',confidence:70,createdAt:now-1000,deadline:now+60000},subanalyst:{mode:'reversal-alert',active:true,alert:{side:'PUT',trigger:105,invalidation:109,target:100}}},generalConsensus:{rapid:{callPct:72},strategies:{callPct:66},displayCallPct:69}}}});
const f=fixture(),m=liveCardModel(f,now);assert.equal(m.side,'CALL');assert.equal(m.alert.side,'PUT');assert.equal(m.average,69);assert.equal(m.averageSide,'CALL');assert.equal(m.tone,'call');assert.equal(m.scenarioInactive,false);assert.equal(m.scenarioLabel,'CENÁRIO CALL');assert.equal(m.analysisAge,0);
let x=fixture();x.lastResult.analysis.operationalSignal.scenario.status='REAVALIANDO';assert.equal(liveCardModel(x,now).tone,'review');
x.lastResult.analysis.operationalSignal.scenario.status='INVALIDADO';x.lastResult.analysis.operationalSignal.scenario.closed=true;assert.equal(liveCardModel(x,now).tone,'closed');assert.equal(liveCardModel(x,now).remaining,null);assert.equal(liveCardModel(x,now).scenarioLabel,'CENÁRIO ANTERIOR CALL');
x=fixture();x.lastResult.analysis.operationalSignal.scenario.deadline=now-1;assert.equal(liveCardModel(x,now).state,'JANELA ENCERRADA');assert.equal(liveCardModel(x,now).scenarioInactive,true);assert.equal(liveCardModel(x,now).remaining,null);
// Remote heartbeat can be 8 seconds apart. Keep previous percentages as
// labelled historical context, never as an active entry recommendation.
for(const mutate of [s=>s.feed.quoteTs=now-9000,s=>s.lastEvalMs=now-11000,s=>s.liveBroker.analysisFeedValidated=false]){
  x=fixture();mutate(x);
  const r=liveCardModel(x,now);
  assert.equal(r.fresh,false);assert.equal(r.side,null);assert.equal(r.alert,null);
  assert.equal(r.average,69);assert.equal(r.totalsStale,true);
  assert.equal(r.averageSide,'AGUARDAR');
}
for(const mutate of [s=>s.remote.online=false,s=>s.state='paused',s=>s.lastResult.asset='OTHER',s=>s.liveBroker.assetValidated=false,s=>s.feed.quoteTs=now-31000]){
  x=fixture();mutate(x);const r=liveCardModel(x,now);
  assert.equal(r.fresh,false);assert.equal(r.side,null);assert.equal(r.alert,null);assert.equal(r.average,null);
}
x=fixture();x.liveBroker.lastQuoteAt=now-12000;x.liveBroker.lastCandleAt=now;x.feed.quoteTs=now;
assert.equal(liveCardModel(x,now).fresh,false,'new candle must never disguise an old live quote');
assert.equal(liveCardModel(x,now).average,69,'last valid matching averages must remain labelled as historical');
x=fixture();x.lastResult.analysis.operationalSignal.subanalyst={mode:'reversal-alert',active:false,status:'SEM LEITURA'};assert.equal(liveCardModel(x,now).subStatus,'AGUARDANDO COTAÇÕES');
assert.equal(liveCardModel(f,now,75).averageSide,'AGUARDAR');assert.equal(liveCardModel(null,now).state,'PC OFFLINE');console.log('PASS: mobile model, independent opposite alert, three totals, stale-history fallback/offline/paused/mismatched inputs and expiry');
