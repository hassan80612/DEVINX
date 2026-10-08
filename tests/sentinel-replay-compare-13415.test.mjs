import test from 'node:test';
import assert from 'node:assert/strict';
import {compareReplayReports} from '../sentinel-trading-lab/agent/worker/replay-compare.mjs';
const day0=Date.UTC(2026,9,1),oneDay=86400000;
const fake=(perDay,winsPerDay,delay=0)=>({signalOutcomes:Array.from({length:7},(_,d)=>
  Array.from({length:perDay},(_,i)=>({key:'broker|TEST',side:'CALL',signalAt:day0+d*oneDay+i*20000,
    entryAt:day0+d*oneDay+i*20000+delay,settledAt:day0+d*oneDay+i*20000+30000,
    filled:true,won:i<winsPerDay,delayMs:delay}))).flat()});
test('no journal or too few sessions can never approve a release',()=>{
 const empty=compareReplayReports({signalOutcomes:[]},{signalOutcomes:[]});
 assert.equal(empty.approvedToPromote,false);
 assert.equal(empty.sufficientData,false);
 assert.equal(empty.evaluated.length,3);
});
test('a worse 13.4.15 loses even if all old software tests pass',()=>{
 const b=fake(40,25),trial=fake(40,13);
 const result=compareReplayReports(b,trial,{delays:[0]});
 assert.equal(result.sufficientData,true);
 assert.equal(result.approvedToPromote,false);
 assert.equal(result.evaluated[0].passed,false);
 assert.ok(result.evaluated[0].heldOut.winDeltaPp<0);
});
test('guard with fewer losses and adequate time/coverage passes retrospective gate',()=>{
 const b=fake(45,25),trial=fake(38,31);
 const r=compareReplayReports(b,trial,{delays:[0]});
 assert.equal(r.sufficientData,true);
 assert.equal(r.approvedToPromote,true,JSON.stringify(r.evaluated[0]));
 assert.equal(r.evaluated[0].heldOut.improvementDays,3);
});
test('an apparently excellent guard that suppresses nearly all trades is rejected',()=>{
 const b=fake(45,25),trial=fake(5,5);
 const r=compareReplayReports(b,trial,{delays:[0]});
 assert.equal(r.approvedToPromote,false);
 assert.ok(r.evaluated[0].heldOut.coverage<.65);
});
test('the same conclusion must survive all 3 simulated execution delays',()=>{
 const b={signalOutcomes:[...fake(45,25,0).signalOutcomes,...fake(45,25,1000).signalOutcomes,...fake(45,25,2000).signalOutcomes]};
 const t={signalOutcomes:[...fake(38,31,0).signalOutcomes,...fake(38,31,1000).signalOutcomes,...fake(45,17,2000).signalOutcomes]};
 const r=compareReplayReports(b,t);
 assert.equal(r.sufficientData,true);
 assert.equal(r.approvedToPromote,false);
 assert.equal(r.evaluated[2].passed,false);
});
test('invalid assumed payout is rejected',()=>{
 assert.throws(()=>compareReplayReports(fake(10,5),fake(10,5),{payout:1.3}),/payout/);
});