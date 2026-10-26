import test from 'node:test';
import assert from 'node:assert/strict';
import {observedLevelSequence as reference} from './fixtures/sentinel-13934-level-sequence.mjs';
import {observedLevelSequence} from '../sentinel-trading-lab/agent/src/core/observed-level-sequence.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const T=1792250000000;
for(const provider of ['iq_option','exnova'])test(`${provider}: two sparse hours preserve only the required quote working set and all candles`,()=>{
 const driver=new LocalPlaywrightDriver(),state=driver.state(provider);state.activeId=1;state.symbol='EUR/USD';
 const candles=Array.from({length:100},(_,i)=>({from:(T-(100-i)*60000)/1000,to:(T-(99-i)*60000)/1000,open:1.1,close:1.1,high:1.101,low:1.099}));state.candles=candles;
 for(let i=0;i<=7200;i++){
  const ts=T+i*1000,price=1.1+.0001*Math.sin(i/17);
  driver.ingest(provider,{name:'quote-generated',msg:{active_id:1,price,time:ts/1000}},'direct-in');
  if(i%600===0){assert.ok(state.quoteHistory.length<=301);assert.ok(state.quoteHistory[0].ts>=ts-300000);assert.equal(state.quoteHistory.at(-1).ts,ts);assert.equal(state.quoteHistory.at(-1).price,price);}
 }
 assert.deepEqual(state.candles,candles);
});
test('runtime expires a sparse input below the old count cap without changing the projection window',()=>{
 const rows=Array.from({length:1801},(_,i)=>({ts:T-(1800-i)*1000,price:1.1+.0001*Math.sin(i/17)}));
 const runtime=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
 runtime.setExternalMarket({provider:'iq_option',symbol:'EUR/USD',quote:rows.at(-1).price,quoteTs:T,quoteFeedValidated:true,quoteHistory:rows});
 assert.deepEqual(runtime.externalMarket.quoteHistory,rows.slice(-301));
 assert.deepEqual(runtime._marketSnapshot().quoteHistory.filter(q=>q.ts>=T-180000),rows.slice(-181));
});
test('indexed turns preserve swings, continuation and structural direction across 40 dense, sparse, mirrored and gapped paths',()=>{
 let seed=917603;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 for(let trial=0;trial<40;trial++){
  const hz=[1,5,20,40][trial%4],span=40+trial*3,rows=[],direction=trial%2?1:-1;
  for(let i=0;i<=span*hz;i++){
   const seconds=i/hz-span;
   rows.push({ts:T+seconds*1000,price:1.1+direction*(.0004*Math.sin(seconds/(5+trial%9))+.00003*Math.sin(seconds/.3)+(random()-.5)*.000008),receivedAt:T+seconds*1000});
  }
  const quoteHistory=trial%5===0?rows.filter(q=>q.ts<T-15000||q.ts>T-10000):rows;
  const map={observedCandles:100,asOf:T-60000,tolerance:.000003,levels:Array.from({length:20},(_,i)=>({low:1.0995+i*.00005,high:1.0995+i*.00005,level:1.0995+i*.00005,confirmedPivots:1,independentRejections:2,windows:[3,10,20,50,100]}))};
  const args={map,quoteHistory,quoteAt:T,now:T,price:quoteHistory.at(-1).price};
  const {structureChange:current,...actual}=observedLevelSequence(args);
  const {structureChange:old,...expected}=reference(args);
  // The frozen reference restamps each old reclaim on every tick. That
  // timestamp/ranking bug is covered by sentinel-decision-event-origin;
  // preserve all unaffected price geometry and continuation calculations.
  assert.deepEqual(actual,expected,`path ${trial}`);
  assert.equal(!!current,!!old,`structural evidence availability ${trial}`);
  if(current){assert.equal(current.side,old.side);assert.ok(current.confirmedAt<=old.confirmedAt);}
 }
});
