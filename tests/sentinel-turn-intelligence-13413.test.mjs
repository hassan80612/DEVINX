import test from 'node:test';
import assert from 'node:assert/strict';
import {assessTurn,TurnLearning} from '../sentinel-trading-lab/agent/src/core/turn-intelligence.mjs';
import {entryOpportunities} from '../sentinel-trading-lab/agent/src/core/entry-opportunities.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';

const now=Date.UTC(2026,9,8,12);
const trail=[100,100.016,100.044,100.068,100.089,100.10,100.096,100.093];
const quotes=prices=>prices.map((price,i)=>({price,ts:now-(prices.length-1-i)*250}));
const market=prices=>({quoteHistory:quotes(prices),quoteTs:now,price:prices.at(-1),provider:'iq_option',asset:'TEST'});
function analysis(side='PUT'){
 const isPut=side==='PUT';
 return {metrics:{last:100.093,shortModel:{ready:true,sr:{support:99.65,resistance:100.10},range:.02,
   callScore:isPut?82:19,putScore:isPut?19:82,structureReadyCall:true,structureReadyPut:true,
   callRoomOk:true,putRoomOk:true,callSetup:true,putSetup:true},
   micro:{delta5:isPut?.085:-.085,delta2:isPut?-.007:.007,delta15:isPut?.05:-.05,
     expected2:.01,expected5:.018,expected30:.05,lead:isPut?-.4:.4}},
   quality:{entrySide:isPut?'BUY':'SELL'},generalConsensus:{rapid:{side:isPut?'CALL':'PUT'},strategies:{side:'CALL',strength:80}},
   entryPlanner:{horizons:{'30':{asset:'TEST',horizonSeconds:30,rawBias:isPut?'CALL':'PUT',
     bias:isPut?'CALL':'PUT',outlookReady:true,directionReady:true,confidence:82,
     callProbability:isPut?82:18,putProbability:isPut?18:82,expectedMove:.05,
     callTrigger:100.02,putTrigger:100.02,callInvalidation:99.5,putInvalidation:100.5}}}};
}
const cfg=()=>{const r=new DemoTradingRuntime();Object.assign(r.settings,{asset:'TEST',forecastHorizonSeconds:30,orderDurationMs:30000,futureDisplayThreshold:70});r.settings.risk.minConfidence=55;return r};
test('live rally warns of possible PUT at resistance before waiting for 5s momentum to turn',()=>{
 const a=analysis(),m=market(trail.slice(0,6));
 const turn=assessTurn({analysis:a,snap:m,now,durationMs:30000});
 assert.equal(turn.confirmed,false);
 assert.equal(turn.watchSide,'PUT');
 assert.equal(turn.risk,true);
});
test('two independent downward prices qualify PUT with positive 5s and 15s momentum',()=>{
 const a=analysis(),m=market(trail),turn=assessTurn({analysis:a,snap:m,now,durationMs:30000});
 assert.equal(turn.confirmed,true,JSON.stringify(turn));
 assert.equal(turn.side,'PUT');
 assert.equal(turn.reaction.preMapped,true);
 assert.equal(turn.reaction.quoteConfirmations,2);
 const result=entryOpportunities({analysis:a,snap:m,now,durationMs:30000,minPoints:70,turn});
 assert.equal(result[0].allowed,false,'not CALL during proven PUT reversal');
 assert.equal(result[1].allowed,true,JSON.stringify(result[1]));
 const runtime=cfg(),out=runtime._operationalSignalState(a,m,now);
 assert.equal(out.side,'PUT');
 assert.equal(out.actionable,true,JSON.stringify({state:out.state,reason:out.reason}));
 assert.equal(out.entryAnalyst.turnWatch.confirmed,true);
});
test('plain rising candle without a tested structural barrier never creates PUT',()=>{
 const a=analysis(),m=market(trail.map(x=>x-1)),turn=assessTurn({analysis:a,snap:m,now});
 assert.equal(turn.confirmed,false);
 assert.equal(turn.watchSide,null);
 const out=entryOpportunities({analysis:a,snap:m,now,minPoints:70,turn});
 assert.equal(out[1].allowed,false);
});
test('single tick, duplicated timestamp and stale quotes do not confirm any reversal',()=>{
 const a=analysis();
 for(const m of [market(trail.slice(0,7)),{...market(trail),quoteTs:now-2000},
   {...market(trail),quoteHistory:[...quotes(trail.slice(0,7)),{ts:now-250,price:100.093}]}]){
   const turn=assessTurn({analysis:a,snap:m,now});
   assert.equal(turn.confirmed,false,JSON.stringify(turn));
 }
});
test('late pullback and an actually broken resistance do not emit early PUT',()=>{
 const a=analysis();
 for(const prices of [[...trail.slice(0,6),100.08,100.05],[...trail.slice(0,6),100.13,100.14]]){
  const m=market(prices),turn=assessTurn({analysis:a,snap:m,now});
  assert.equal(turn.confirmed,false,JSON.stringify(turn));
 }
});
test('shadow learner records peak warnings, labels only at true expiry, and persists its state',()=>{
 const a=analysis(),m=market(trail.slice(0,6));
 const turn=assessTurn({analysis:a,snap:m,now}),learner=new TurnLearning();
 const entryTime=now,price=m.price;
 const first=learner.observe({turn,provider:'iq_option',asset:'TEST',durationMs:30000,price,
  now:entryTime,quoteTs:m.quoteTs});
 assert.equal(first.samples,0);assert.equal(first.qualified,false);assert.equal(learner.pending.length,1);
 learner.settle({provider:'iq_option',asset:'TEST',snap:{quoteHistory:[{ts:entryTime+12000,price:99.6}]},now:entryTime+12000});
 assert.equal(learner.outcomes.length,0);
 const due=entryTime+30000;
 learner.settle({provider:'iq_option',asset:'TEST',snap:{quoteHistory:[{ts:due,price:price-.03}]},now:due});
 assert.equal(learner.outcomes.length,1);assert.equal(learner.outcomes[0].won,true);
 const restored=new TurnLearning(learner.snapshot());
 assert.equal(restored.status(learner.key({provider:'iq_option',asset:'TEST',durationMs:30000,side:'PUT'})).samples,1);
 assert.equal(restored.status(learner.key({provider:'iq_option',asset:'TEST',durationMs:30000,side:'PUT'})).qualified,false);
});
