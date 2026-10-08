import test from 'node:test';
import assert from 'node:assert/strict';
import {PersistentReversalMonitor,reversalBars} from '../sentinel-trading-lab/agent/src/core/persistent-reversal.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {RUNTIME_OPTIONS} from '../sentinel-trading-lab/agent/worker/release.mjs';
import {scenarioViewFromRuntime} from '../sentinel-trading-lab/agent/worker/scenario-view.mjs';
import {LatestOverlayScheduler} from '../sentinel-trading-lab/agent/worker/latest-overlay-scheduler.mjs';
import {runtimeMarketFromLive} from '../sentinel-trading-lab/agent/worker/runtime-market.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';

const t=1800000000000;
const shape=[[112,114,110,112],[108,109,106,107],[107,107.5,104,105],[105,105.5,102,103],[103,106.8,101.8,106.5],[106.5,108.5,106.3,108]];
function fixture(side='CALL',rows=shape){
 const flip=p=>side==='CALL'?p:200-p,quotes=rows.flatMap((row,i)=>row.map((p,j)=>({ts:t+i*5000+[0,1000,2500,4000][j],price:flip(p)})));
 quotes.push({ts:t+rows.length*5000,price:flip(rows.at(-1)[3])});
 return{provider:'test',price:quotes.at(-1).price,quoteTs:quotes.at(-1).ts,quoteHistory:quotes};
}
function update(m,snap,now=snap.quoteTs,asset='TEST'){return m.update({snap,now,asset,provider:'test'});}

test('CALL and PUT alert only after a broken prior trend and a completed hold; own levels stay frozen',()=>{
 for(const side of ['CALL','PUT']){
  const m=new PersistentReversalMonitor(),snap=fixture(side),before={...snap,quoteTs:t+25000,price:snap.quoteHistory.find(q=>q.ts===t+24000).price,quoteHistory:snap.quoteHistory.filter(q=>q.ts<=t+25000)};
  assert.equal(update(m,before).active,false);
  const a=update(m,snap);assert.equal(a.active,true);assert.equal(a.alert.side,side);assert.equal(a.advisoryOnly,true);
  assert.equal(a.alert.evidence.approachBars,3);assert.equal(a.alert.createdAt,t+30000);
  const next={...snap,quoteTs:t+31000,price:side==='CALL'?107.5:92.5,quoteHistory:[...snap.quoteHistory,{ts:t+31000,price:side==='CALL'?107.5:92.5}]};
  const b=update(m,next);assert.equal(b.alert.id,a.alert.id);assert.equal(b.alert.trigger,a.alert.trigger);assert.equal(b.alert.invalidation,a.alert.invalidation);
 }
});

test('a repique, failed retest, absent room or noncontinuous structure does not issue a reversal alert',()=>{
 const failed=shape.map(r=>r.slice());failed[5]=[106.5,108.5,103,108];
 const noRoom=shape.map(r=>r.slice());noRoom[0]=[108,108.1,107.8,108];
 const repique=shape.map(r=>r.slice());repique[4]=[103,105,102,104];repique[5]=[104,105,103.5,104.5];
 for(const rows of [failed,noRoom,repique])assert.equal(update(new PersistentReversalMonitor(),fixture('CALL',rows)).active,false);
 const gap=fixture();gap.quoteHistory=gap.quoteHistory.filter(q=>q.ts<t+10000||q.ts>=t+15000);
 assert.equal(update(new PersistentReversalMonitor(),gap).active,false);
});

test('unclosed, future, duplicate and sparse bars cannot supply persistence evidence',()=>{
 const snap=fixture(),future={...snap,quoteTs:t+29999,quoteHistory:snap.quoteHistory};
 assert.equal(update(new PersistentReversalMonitor(),future).active,false);
 const sparse={...snap,quoteHistory:snap.quoteHistory.filter(q=>q.ts<t+25000||q.ts===t+29000||q.ts===t+30000)};
 assert.equal(update(new PersistentReversalMonitor(),sparse).active,false);
 const duplicated={...sparse,quoteHistory:[...sparse.quoteHistory,...sparse.quoteHistory]};
 assert.equal(reversalBars(duplicated,duplicated.quoteTs).length,reversalBars(sparse,sparse.quoteTs).length);
 assert.equal(update(new PersistentReversalMonitor(),duplicated).active,false);
});

test('a wick preserves the alert; a completed break closes it without an opposite fake signal',()=>{
 const m=new PersistentReversalMonitor(),snap=fixture(),a=update(m,snap);
 const q=[...snap.quoteHistory,{ts:t+31000,price:100},{ts:t+32500,price:100},{ts:t+34000,price:100}];
 const wick=update(m,{...snap,quoteTs:t+31000,price:100,quoteHistory:q});assert.equal(wick.alert.id,a.alert.id);assert.equal(wick.alert.testing,true);
 const closed=update(m,{...snap,quoteTs:t+35000,price:100,quoteHistory:q});assert.equal(closed.active,false);assert.equal(closed.alert,null);
});

test('stale feeds, asset changes and actual quote gaps suppress stale alerts',()=>{
 const m=new PersistentReversalMonitor(),snap=fixture();assert.equal(update(m,snap).active,true);
 assert.equal(update(m,snap,snap.quoteTs+3000).active,false);
 assert.equal(update(m,snap,snap.quoteTs,'OTHER').active,false);
 const other=new PersistentReversalMonitor();update(other,snap);
 const gap={...snap,quoteTs:t+50000,price:108,quoteHistory:[...snap.quoteHistory,{ts:t+50000,price:108}]};
 assert.equal(update(other,gap).active,false);
});

test('released analyst can alert opposite to the main scenario and never authorizes a trade',()=>{
 const r=new DemoTradingRuntime(RUNTIME_OPTIONS);Object.assign(r.settings,{asset:'TEST',orderDurationMs:30000,forecastHorizonSeconds:60,futureDisplayThreshold:50});r.settings.risk.minConfidence=55;
 const p={rawBias:'CALL',callProbability:80,putProbability:20,confidence:80,outlookReady:true,directionReady:true,callTrigger:95,callInvalidation:80};
 const op=r._operationalSignalState({metrics:{},entryPlanner:{horizons:{60:p,30:p}}},fixture('PUT'),t+30000);
 assert.equal(op.scenario.side,'CALL');assert.equal(op.subanalyst.alert.side,'PUT');assert.equal(op.ready,false);assert.equal(op.actionable,false);assert.equal(op.entryAnalyst.qualification.allowed,false);
 const view=scenarioViewFromRuntime({operational:op,asset:'TEST',horizonSeconds:60,durationMs:30000,now:t+30000});
 assert.equal(view.side,'CALL');assert.equal(view.canEnter,false);assert.equal(view.entrySide,null);
 assert.equal(r.entryResearch.pending.length,0);
});

test('reversal structure is evaluated once per received closed-bar boundary, not every tick',()=>{
 const m=new PersistentReversalMonitor(),snap=fixture();update(m,snap);
 for(let i=1;i<=100;i++)update(m,{...snap,quoteTs:snap.quoteTs+i*10},snap.quoteTs+i*10);
 assert.equal(m.evaluations,1);
});

test('slow overlay updates leave evaluation free and coalesce the pending frames; errors recover',async()=>{
 let unblock;const gate=new Promise(r=>unblock=r),sent=[];
 const scheduler=new LatestOverlayScheduler(async(_,d)=>{sent.push(d.id);if(d.id===1)await gate;else if(d.id===3)throw Error('page closed');});
 scheduler.publish('test',{id:1});scheduler.publish('test',{id:2});scheduler.publish('test',{id:3});
 assert.deepEqual(sent,[1]);unblock();await new Promise(r=>setImmediate(r));
 assert.deepEqual(sent,[1,3]);assert.equal(scheduler.errors,1);assert.equal(scheduler.running,false);
 scheduler.publish('test',{id:4});await new Promise(r=>setImmediate(r));assert.deepEqual(sent,[1,3,4]);
});

test('the live Worker bridge delivers both verified intervals to the runtime without replacing totals history',()=>{
 const d=new LocalPlaywrightDriver(),st=d.state('iq_option');Object.assign(st,{activeId:2,symbol:'TEST',uiSymbol:'TEST',mode:'demo',quote:100,lastQuoteAt:t,balance:10});
 for(const size of [60,120]){
  const id='period-'+size;
  d.ingest('iq_option',JSON.stringify({name:'sendMessage',request_id:id,msg:{name:'get-candles',body:{active_id:2,size}}}),'direct-out');
  const candles=Array.from({length:55},(_,i)=>({from:t/1000-(55-i)*size,to:t/1000-(54-i)*size,open:100,high:101,low:99,close:100}));
  d.ingest('iq_option',JSON.stringify({name:'candles',request_id:id,msg:{candles}}),'direct-in');
 }
 const m=d.liveStatus('iq_option'),r=new DemoTradingRuntime(RUNTIME_OPTIONS),mapped=runtimeMarketFromLive('iq_option',m,'TEST');
 r.setExternalMarket(mapped);const snap=r._marketSnapshot();
 assert.equal(snap.predictionCandles.length,110);assert.deepEqual(snap.candles,m.candles);
 assert.deepEqual([...new Set(snap.predictionCandles.map(c=>c.to-c.from))].sort((a,b)=>a-b),[60,120]);
 assert.equal(r.predictionInputState.prepare({candles:snap.predictionCandles,now:t,requireFresh:true},'TEST').inputQuality.ready,true);
});
