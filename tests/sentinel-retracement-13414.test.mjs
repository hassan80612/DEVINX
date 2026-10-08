import test from 'node:test';
import assert from 'node:assert/strict';
import {retracementWatch,RetracementResearch} from '../sentinel-trading-lab/agent/src/core/subanalyst-retracement.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {entryOpportunities} from '../sentinel-trading-lab/agent/src/core/entry-opportunities.mjs';

const now=Date.UTC(2026,9,8,12);
const base=[99.92,99.965,99.97,99.975,99.98,99.985,99.99,99.996,100.001,100.006];
const turned=[...base,100.004,99.999,99.992,99.988];
const quotes=(prices,end=now)=>prices.map((price,i)=>({ts:end-(prices.length-1-i)*230,price}));
const snap=(prices,end=now)=>({provider:'iq_option',asset:'TEST',price:prices.at(-1),quoteTs:end,quoteHistory:quotes(prices,end)});
function analysis(side='CALL'){
 return{metrics:{shortModel:{ready:true,sr:{support:99.6,resistance:100.0},range:.05,
       callScore:82,putScore:15,callRoomOk:true,putRoomOk:true,structureReadyCall:true,structureReadyPut:true,
       callSetup:true,putSetup:false},micro:{delta5:.04,delta15:.05,delta2:-.012,lead:-.5,
       expected2:.012,expected5:.04,expected30:.05}},
     entryPlanner:{horizons:{'30':{rawBias:side,bias:side,confidence:82,callProbability:82,putProbability:18,
       outlookReady:true,directionReady:true,callTrigger:99.99,callInvalidation:99.3,putTrigger:100.01,putInvalidation:100.3}}}};
}
test('subanalyst sees resistance before a PUT and does not relabel an active CALL as PUT',()=>{
 const a=analysis(),up=snap(base);
 const watch=retracementWatch({analysis:a,snap:up,now});
 assert.equal(watch.watchSide,'PUT');
 assert.equal(watch.state,'WATCH');
 assert.equal(watch.confirmed,false);
 const r=new DemoTradingRuntime();
 r.settings.asset='TEST';r.settings.orderDurationMs=30000;r.settings.forecastHorizonSeconds=30;
 const op=r._operationalSignalState(a,up,now);
 assert.equal(op.entryAnalyst.retracement?.state,'WATCH');
 assert.equal(op.scenarioFeedback.watchSide,'PUT');
 assert.equal(op.scenarioFeedback.advisoryOnly,true);
 const direct=entryOpportunities({analysis:a,snap:up,now,minPoints:70,durationMs:30000});
 assert.equal(direct[1].allowed,false);
});
test('several independent significant down ticks are recognized, but cannot bypass original entry gates',()=>{
 const a=analysis(),m=snap(turned),watch=retracementWatch({analysis:a,snap:m,now});
 assert.equal(watch.watchSide,'PUT');
 assert.equal(watch.state,'CONFIRMED',JSON.stringify(watch));
 const direct=entryOpportunities({analysis:a,snap:m,now,minPoints:70,durationMs:30000});
 assert.equal(direct[1].allowed,false);
 const rt=new DemoTradingRuntime();rt.settings.asset='TEST';
 rt.settings.orderDurationMs=30000;rt.settings.forecastHorizonSeconds=30;
 const op=rt._operationalSignalState(a,m,now);
 assert.equal(op.entryAnalyst.retracement?.confirmed,true);
 assert.equal(op.scenarioFeedback.advisoryOnly,true);
 assert.equal(op.entryAnalyst.candidates[1].allowed,false);
});
test('a pair of tiny falling quotes during a rally is not a confirmed reversal',()=>{
 const p=[...base,100.005,100.0048],a=analysis(),w=retracementWatch({analysis:a,snap:snap(p),now});
 assert.notEqual(w.state,'CONFIRMED');
});
test('price through resistance is not mistaken for an upper-barrier PUT',()=>{
 const p=[...base,100.019,100.022,100.025,100.028],a=analysis(),w=retracementWatch({analysis:a,snap:snap(p),now});
 assert.equal(w.watchSide,null);
});
test('old and duplicated quotes cannot generate a fresh structural reversal',()=>{
 const a=analysis(),m=snap(turned);
 assert.equal(retracementWatch({analysis:a,snap:m,now:now+2500}).state,'NONE');
 const fake=snap([...base,100.002,100.001,99.995],now);
 fake.quoteHistory=fake.quoteHistory.map((q,i)=>i>6?{...q,ts:now-500}:q);
 assert.notEqual(retracementWatch({analysis:a,snap:fake,now}).state,'CONFIRMED');
});
test('shadow research scores only expiration quote for the same asset and preserves state',()=>{
 const watch=retracementWatch({analysis:analysis(),snap:snap(base),now}),research=new RetracementResearch();
 research.observe({advisory:watch,provider:'iq_option',asset:'TEST',durationMs:30000,now,price:base.at(-1)});
 research.observe({advisory:watch,provider:'iq_option',asset:'TEST',durationMs:30000,now:now+200,price:base.at(-1)});
 assert.equal(research.pending.length,1);
 research.settle({provider:'iq_option',asset:'TEST',now:now+10000,snap:{quoteHistory:[{ts:now+10000,price:98}]}});
 assert.equal(research.outcomes.length,0);
 research.settle({provider:'iq_option',asset:'OTHER',now:now+30000,snap:{quoteHistory:[{ts:now+30000,price:98}]}});
 assert.equal(research.outcomes.length,0);
 research.settle({provider:'iq_option',asset:'TEST',now:now+30000,snap:{quoteHistory:[{ts:now+30000,price:100.05}]}});
 assert.equal(research.outcomes.length,1);
 assert.equal(research.outcomes[0].won,false);
 const restored=new RetracementResearch(research.snapshot());
 assert.equal(restored.summary().observations,1);
 assert.equal(restored.summary().qualified,false);
});
