import test from 'node:test';
import assert from 'node:assert/strict';
import {invertSignalDirection,invertPublishedSignal} from '../sentinel-trading-lab/agent/src/core/published-signal-inversion.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {setup} from './fixtures/executor-13946.mjs';

test('CALL/PUT and BUY/SELL invert for every exposed field without mutating model output',()=>{
 const raw={side:'BUY',plan:{side:'SELL',signal:'PUT'},
  analysis:{side:'BUY',forecast30:{side:'CALL',callStrength:72,putStrength:28},
   vnext:{futureEntryAnchor:{phase:'fired',side:'CALL',entryTriggeredAt:1800000000000,
      exitAt:1800000030000,entryReadyNow:true},
    opportunityWindow:{phase:'fired',side:'CALL'},
    nowObservation:{side:'PUT',provisionalSide:'CALL'},
    outcomeQuality:{source:'observed-broker-quotes-not-trade-settlements',
      correct:4,failed:9,completed:13,excludedTies:0}},
   operationalSignal:{side:'CALL',entryAnalyst:{signal:{side:'PUT'}},state:'EM ANDAMENTO'},
   generalConsensus:{rapid:{side:'CALL',callPct:71,putPct:29}},
   strategyCards:[{side:'PUT',signalCallPct:31,signalPutPct:69}],
   reasons:['Possível CALL','PUT AGORA','CALL/PUT da analista']},order:null};
 const a=invertPublishedSignal(raw);
 assert.equal(a.side,'SELL');
 assert.equal(a.plan.side,'BUY');assert.equal(a.plan.signal,'CALL');
 assert.equal(a.analysis.forecast30.side,'PUT');
 assert.equal(a.analysis.forecast30.callStrength,28);
 assert.equal(a.analysis.forecast30.putStrength,72);
 assert.equal(a.analysis.vnext.futureEntryAnchor.side,'PUT');
 assert.equal(a.analysis.vnext.futureEntryAnchor.entryTriggeredAt,1800000000000);
 assert.equal(a.analysis.vnext.opportunityWindow.side,'PUT');
 assert.equal(a.analysis.vnext.nowObservation.side,'CALL');
 assert.equal(a.analysis.vnext.nowObservation.provisionalSide,'PUT');
 assert.equal(a.analysis.vnext.outcomeQuality.correct,9);
 assert.equal(a.analysis.vnext.outcomeQuality.failed,4);
 assert.match(a.analysis.vnext.outcomeQuality.source,/inverted-signal/);
 assert.equal(a.analysis.operationalSignal.side,'PUT');
 assert.equal(a.analysis.operationalSignal.entryAnalyst.signal.side,'CALL');
 assert.equal(a.analysis.generalConsensus.rapid.side,'PUT');
 assert.equal(a.analysis.generalConsensus.rapid.callPct,29);
 assert.equal(a.analysis.strategyCards[0].side,'CALL');
 assert.equal(a.analysis.strategyCards[0].signalCallPct,69);
 assert.deepEqual(a.analysis.reasons,['Possível PUT','CALL AGORA','PUT/CALL da analista']);
 assert.equal(raw.analysis.vnext.futureEntryAnchor.side,'CALL','raw market model must stay intact');
 assert.equal(raw.analysis.vnext.outcomeQuality.correct,4);
 assert.equal(invertSignalDirection('call agora, Put AGORA, BUY / SELL'),
  'put agora, Call AGORA, SELL / BUY');
});
for(const provider of ['iq_option','exnova']){
 for(const side of ['CALL','PUT']){
  test(provider+': raw '+side+' becomes opposite in PC, signed phone source and exactly one matching broker click',async()=>{
   const x=setup(provider);x.c.brokerBalance=null;
   await x.bot.start();
   const anchorRaw={context:provider+'|EURUSDOTC|automatic|30000',engineId:'automatic',
    phase:'fired',side,entryTriggeredAt:x.now(),exitAt:x.now()+30000,
    holdingSeconds:30,entryReadyNow:true,entryPrice:1.1};
   const inverted=invertPublishedSignal(anchorRaw);
   const signedPC={analysis:{vnext:{futureEntryAnchor:inverted,
     opportunityWindow:{side:inverted.side}}}};
   const signedPhone=structuredClone(signedPC);
   assert.equal(signedPC.analysis.vnext.futureEntryAnchor.side,side==='CALL'?'PUT':'CALL');
   assert.deepEqual(signedPhone,signedPC);
   x.bot.pulse(inverted);await x.bot.inflight;
   assert.equal(x.calls.length,1);
   assert.equal(x.calls[0].side,inverted.side);
   x.c.analysis=signedPC.analysis;
   x.bot.pulse();await x.bot.inflight;
   assert.equal(x.calls.length,1,'fallback cannot undo or repeat the inverted click');
   assert.equal(anchorRaw.side,side,'do not corrupt original research/model');
  });
 }
}
test('actual runtime sends inverted 30s trend CALL to immediate bot callback and published public analysis',()=>{
 const rt=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
 rt.settings.engine='trend';rt.settings.asset='EUR/USD OTC';rt.settings.orderDurationMs=30000;
 const now=Date.now();
 const quoteHistory=Array.from({length:151},(_,i)=>({ts:now-150000+i*1000,
  receivedAt:now-150000+i*1000,price:1.1+i*0.00001}));
 const snap={provider:'exnova',quoteHistory,quoteTs:now,price:quoteHistory.at(-1).price,
  historicalCandlesVerified:false,candles:[]};
 const emitted=[];rt.onNowOpportunity=a=>emitted.push(a);
 const r=rt._signalValidationGate({analysis:{},snap,settings:rt.settings,now});
 assert.equal(r.analysis.vnext.mode,'now');
 assert.equal(rt.vnextWindowState?.side,'CALL');
 assert.equal(emitted.length,1);
 assert.equal(emitted[0].side,'PUT');
 assert.equal(rt.vnextFutureEntryAnchor.side,'PUT');
 const visible=invertPublishedSignal({analysis:r.analysis});
 assert.equal(visible.analysis.vnext.futureEntryAnchor.side,'PUT');
 assert.equal(visible.analysis.vnext.opportunityWindow.side,'PUT');
 assert.equal(visible.analysis.operationalSignal.side,'PUT');
});
