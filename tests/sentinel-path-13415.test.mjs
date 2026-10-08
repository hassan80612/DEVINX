import test from 'node:test';
import assert from 'node:assert/strict';
import {pathEvidence,PathResearch} from '../sentinel-trading-lab/agent/src/core/path-intelligence.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {entryOpportunities} from '../sentinel-trading-lab/agent/src/core/entry-opportunities.mjs';
const now=Date.UTC(2026,9,8,12);
const prices=[99.960,99.971,99.977,99.983,99.986,99.989,99.992,99.995,99.998,100.001,99.998,99.995,99.992];
const quotes=(p,end=now)=>p.map((price,i)=>({ts:end-(p.length-1-i)*230,price}));
const snap=(p,end=now)=>({quoteTs:end,price:p.at(-1),quoteHistory:quotes(p,end),provider:'iq_option',asset:'TEST'});
function analysis(){
 return{metrics:{shortModel:{ready:true,sr:{support:99.6,resistance:99.998},range:.03,
   weakeningUp:true,weakeningDown:false,readyCall:true,callScore:80,putScore:20,
   callRoomOk:true,putRoomOk:true,structureReadyCall:true,structureReadyPut:true,
   flowReadyCall:true,flowReadyPut:false,callSetup:true,putSetup:false},
   micro:{delta2:-.008,delta5:.026,delta15:.031,expected5:.01,expected30:.025,
     expected2:.008}},entryPlanner:{horizons:{'30':{rawBias:'CALL',bias:'CALL',confidence:80,
   callProbability:80,putProbability:20,outlookReady:true,directionReady:true,expectedMove:.025}}}};
}
test('detect rejection at previously mapped resistance but do not create opposite PUT',()=>{
 const a=analysis(),m=snap(prices),p=pathEvidence({analysis:a,snap:m,now,durationMs:30000});
 assert.equal(p.ready,true);
 assert.equal(p.watchSide,'PUT',JSON.stringify(p));
 assert.equal(p.guardedSide,'CALL',JSON.stringify(p));
 assert.equal(p.phase,'REJECTION_CONFIRMED');
 const candidate=entryOpportunities({analysis:a,snap:m,now,durationMs:30000,minPoints:70});
 assert.equal(candidate[1].allowed,false,'retraction watch is never a manufactured PUT');
});
test('a small reverse tick cannot veto a continuation',()=>{
 const p=[99.96,99.965,99.97,99.975,99.98,99.985,99.99,99.995,99.997,99.996,99.997];
 const d=pathEvidence({analysis:analysis(),snap:snap(p),now});
 assert.notEqual(d.phase,'REJECTION_CONFIRMED');
 assert.equal(d.guardedSide,null);
});
test('holding a genuine breakout cannot be mistaken for reversal PUT',()=>{
 const p=[99.960,99.967,99.973,99.980,99.987,99.995,100.003,100.007,100.011,100.015,100.019];
 const d=pathEvidence({analysis:analysis(),snap:snap(p),now});
 assert.equal(d.phase,'BREAKOUT',JSON.stringify(d));
 assert.equal(d.guardedSide,null);
});
test('mirrored downtrend/support gives CALL watch, never a CALL order',()=>{
 const a=analysis(),p=prices.map(v=>200-v);
 a.metrics.shortModel.sr={support:100.002,resistance:100.4};
 Object.assign(a.metrics.micro,{delta2:.008,delta5:-.026,delta15:-.031});
 Object.assign(a.metrics.shortModel,{weakeningDown:true,weakeningUp:false});
 const d=pathEvidence({analysis:a,snap:snap(p),now});
 assert.equal(d.watchSide,'CALL',JSON.stringify(d));
 assert.equal(d.guardedSide,'PUT');
});
test('old quotes, repeated timestamp and missing closed level are not trusted',()=>{
 const a=analysis(),m=snap(prices);
 assert.equal(pathEvidence({analysis:a,snap:m,now:now+2500}).ready,false);
 const duplicate={...m,quoteHistory:m.quoteHistory.map((q,i)=>i>4?{...q,ts:now}:q)};
 assert.notEqual(pathEvidence({analysis:a,snap:duplicate,now}).phase,'REJECTION_CONFIRMED');
 a.metrics.shortModel.sr={support:99.6,resistance:null};
 assert.equal(pathEvidence({analysis:a,snap:m,now}).phase,'NO_LEVEL');
});
test('base 13.4.11 operational entry does not change in default shadow mode',()=>{
 const a=analysis(),m=snap(prices);
 const original=entryOpportunities({analysis:a,snap:m,now,minPoints:70,durationMs:30000});
 const r=new DemoTradingRuntime();r.settings.asset='TEST';r.settings.orderDurationMs=30000;r.settings.forecastHorizonSeconds=30;
 const op=r._operationalSignalState(a,m,now);
 assert.equal(r.settings.pathGuardMode,undefined);
 assert.equal(op.scenarioFeedback.advisoryOnly,true);
 assert.equal(op.scenarioFeedback.mainSide,'CALL');
 assert.deepEqual(op.entryAnalyst.candidates.map(x=>x.allowed),original.map(x=>x.allowed));
});
test('records separate candidate/warning predictions only before expiry, with asset isolation and persistence',()=>{
 const a=analysis(),m=snap(prices),p=pathEvidence({analysis:a,snap:m,now});
 const r=new PathResearch(),args={evidence:p,provider:'iq_option',asset:'TEST',durationMs:30000,price:m.price,quoteTs:now,now};
 r.observe(args);r.observe({...args,candidateSide:'CALL'});
 assert.equal(r.pending.length,2);
 r.settle({provider:'iq_option',asset:'TEST',now:now+12000,snap:{quoteHistory:[{ts:now+12000,price:90}]}});
 assert.equal(r.outcomes.length,0);
 r.settle({provider:'iq_option',asset:'OTHER',now:now+30000,snap:{quoteHistory:[{ts:now+30000,price:90}]}});
 assert.equal(r.outcomes.length,0);
 r.settle({provider:'iq_option',asset:'TEST',now:now+30000,snap:{quoteHistory:[{ts:now+30000,price:100.4}]}});
 assert.equal(r.outcomes.length,2);
 assert.equal(r.outcomes.find(x=>x.originalCandidate).won,true);
 const restored=new PathResearch(r.snapshot());
 assert.equal(restored.summary().mode,'shadow-unvalidated');
 assert.equal(restored.summary().outcomes,2);
 assert.equal(restored.summary().contexts.every(x=>x.qualified===false),true);
});
