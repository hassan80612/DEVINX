import test from 'node:test';
import assert from 'node:assert/strict';
import {entryOpportunities} from '../sentinel-trading-lab/agent/src/core/entry-opportunities.mjs';
import {chosenStrategiesPermit} from '../sentinel-trading-lab/agent/src/core/strategy-selection-guidance.mjs';

const T=1800000000000;
const prices=[100.11,100.07,100.025,99.99,100.018,100.044,100.065];
const quotes=prices.map((price,i)=>({ts:T+i*250,price}));
const last=quotes.at(-1);
const create=(support=100)=>({
  now:last.ts,
  durationMs:30000,
  minPoints:74,
  entryPolicy:'structural-reversals-v1',
  snap:{price:last.price,quoteTs:last.ts,quoteHistory:quotes},
  analysis:{
    metrics:{
      shortModel:{
        ready:true,range:.05,sr:{support:98,resistance:101},
        callScore:80,putScore:15,reversalCallScore:60,reversalPutScore:10,
        callRoomOk:true,putRoomOk:true
      },
      micro:{expected5:.10,expected30:.20,delta2:.01,delta5:.03},
      srZones:{tolerance:.07,zones:[
        {type:'support',price:support,touches:3,strength:80},
        {type:'resistance',price:101,touches:3,strength:80}
      ]}
    },
    entryPlanner:{horizons:{'30':{rawBias:'PUT',scenario:{continuationReady:false},
      expectedMove:.2,callProbability:45,putProbability:55}}}
  }
});
test('mapped historical support with independent rebounds qualifies CALL despite old PUT bias',()=>{
  const rows=entryOpportunities(create());
  const call=rows.find(r=>r.side==='CALL');
  assert.equal(call.allowed,true,call.reason);
  assert.equal(call.kind,'reversal');
  assert.equal(call.structuralReaction,true);
  assert.equal(call.level,100);
  assert.equal(call.levelSource,'confirmed-historical-zone');
  assert.equal(call.plan.reaction.quoteConfirmations,2);
});
test('support never turns into reversal entry from a touch alone',()=>{
 const opts=create();opts.snap.quoteHistory=quotes.slice(0,4);
 opts.snap.price=opts.snap.quoteHistory.at(-1).price;opts.snap.quoteTs=opts.snap.quoteHistory.at(-1).ts;
 opts.now=opts.snap.quoteTs;
 const call=entryOpportunities(opts).find(x=>x.side==='CALL');
 assert.equal(call.structuralReaction,false);
 assert.equal(call.allowed,false);
});
test('distant or weak historic zone does not create an entry',()=>{
 const opts=create(99.6);
 const call=entryOpportunities(opts).find(x=>x.side==='CALL');
 assert.equal(call.structuralReaction,false);
 const weak=create();weak.analysis.metrics.srZones.zones[0].strength=40;
 assert.equal(entryOpportunities(weak).find(x=>x.side==='CALL').structuralReaction,false);
});
test('confirmed structural reversal has equal authority, but an unconfirmed one never bypasses chosen strategies',()=>{
 const cards=[{strategy:'trend',side:'PUT',active:true,paused:false,evidence:.8}];
 assert.equal(chosenStrategiesPermit({cards,side:'CALL'}).allowed,false);
 assert.equal(chosenStrategiesPermit({cards,side:'CALL',verifiedStructuralReversal:true}).allowed,true);
 assert.equal(chosenStrategiesPermit({cards,side:'PUT'}).allowed,true);
 const contradictory=[...cards,{strategy:'support_resistance',side:'CALL',active:true,paused:false,evidence:.8}];
 assert.equal(chosenStrategiesPermit({cards:contradictory,side:'CALL'}).allowed,false);
 assert.equal(chosenStrategiesPermit({cards:contradictory,side:'CALL',verifiedStructuralReversal:true}).allowed,true);
});
test('continuation and breakout selection keep their existing veto rules',()=>{
 const cards=[{strategy:'trend',side:'PUT',active:true,paused:false,evidence:.8}];
 assert.equal(chosenStrategiesPermit({cards,side:'CALL'}).status,'opposed');
 assert.equal(chosenStrategiesPermit({cards,side:'PUT'}).status,'aligned');
});
