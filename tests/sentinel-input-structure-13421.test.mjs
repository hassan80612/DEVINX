import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {PredictionInputState} from '../sentinel-trading-lab/agent/src/core/forecast-evidence.mjs';
import {analyzePrediction} from '../sentinel-trading-lab/agent/src/core/strategy.mjs';
import {scenarioInvalidation} from '../sentinel-trading-lab/agent/src/core/scenario-invalidation.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {replayJournal,analyzeReplayFrame} from '../sentinel-trading-lab/agent/worker/replay.mjs';
import {MarketJournal} from '../sentinel-trading-lab/agent/worker/market-journal.mjs';
const bars=(period,end,count=50)=>Array.from({length:count},(_,i)=>({from:end-(count-i)*period,to:end-(count-i-1)*period,open:100,high:101,low:99,close:100}));

test('fresh quotes cannot authorize predictions from a stale pinned interval; recovery keeps the interval',()=>{
 const now=1_800_000_000_000,state=new PredictionInputState();
 const first=state.prepare({candles:bars(60,now/1000),now,requireFresh:true},'asset');assert.equal(first.inputQuality.ready,true);
 const stale=state.prepare({candles:[...bars(60,now/1000-900),...bars(120,now/1000)],now,requireFresh:true},'asset');
 assert.equal(stale.inputQuality.periodSeconds,60);assert.equal(stale.inputQuality.ageMs,900000);assert.equal(stale.inputQuality.reason,'stale-period-history');assert.equal(stale.inputQuality.ready,false);
 const analysis=analyzePrediction({...stale,now,requireFresh:true,quoteTs:now,quoteHistory:[{ts:now,price:100}],experimentalTiming:false});
 assert.ok(Object.values(analysis.entryPlanner.horizons).every(p=>!p.outlookReady&&!p.directionReady));
 assert.equal(state.prepare({candles:bars(60,now/1000),now,requireFresh:true},'asset').inputQuality.ready,true);
});

test('CALL and PUT preserve a wick rejection and close only on a completed structural break',()=>{
 for(const side of ['CALL','PUT']){
  const flip=p=>side==='CALL'?p:200-p,main={side,createdAt:10000,deadline:70000,invalidation:flip(95)};
  const run=(now,qs)=>scenarioInvalidation(main,{price:flip(qs.at(-1)[1]),quoteTs:now,quoteHistory:qs.map(([ts,p])=>({ts,price:flip(p)}))},now);
  assert.deepEqual(run(11000,[[10000,96],[11000,94]]),{broken:false,testing:true,evidence:null});
  assert.equal(run(15000,[[10000,96],[11000,94],[14000,97]]).broken,false);
  const broken=run(20000,[[16000,94],[19000,93]]);assert.equal(broken.broken,true);assert.equal(broken.evidence.to,20000);
  assert.equal(run(19000,[[16000,94],[19000,93]]).broken,false);
 }
});

test('future, duplicate, stale and pre-scenario samples cannot confirm invalidation',()=>{
 const main={side:'CALL',createdAt:10000,deadline:70000,invalidation:95};
 for(const quotes of [[{ts:9999,price:90}],[{ts:16000,price:90},{ts:21000,price:90}],[{ts:19000,price:90},{ts:19000,price:89}],[{ts:15100,price:90},{ts:15200,price:89}]]){
  assert.equal(scenarioInvalidation(main,{price:90,quoteTs:20000,quoteHistory:quotes},20000).broken,false);
 }
});

test('margin changes do not reopen canceled scenarios; a completed reclaim can reopen',()=>{
 const r=new DemoTradingRuntime({scenarioPolicy:'closed-structure-v1'});r.settings.asset='TEST';r.settings.forecastHorizonSeconds=60;r.settings.orderDurationMs=30000;r.settings.risk.minConfidence=55;r.settings.futureDisplayThreshold=50;
 const plan={rawBias:'CALL',callProbability:70,putProbability:30,confidence:70,outlookReady:true,directionReady:true,callInvalidation:95,callTrigger:101};
 const call=(now,price,quotes,p=plan)=>r._operationalSignalState({metrics:{},entryPlanner:{horizons:{60:p,30:p}}},{provider:'test',price,quoteTs:now,quoteHistory:quotes},now).scenario;
 const a=call(10000,100,[{ts:10000,price:100}]);
 assert.equal(call(11000,94,[{ts:10000,price:100},{ts:11000,price:94}]).id,a.id);
 assert.equal(call(15000,97,[{ts:10000,price:100},{ts:11000,price:94},{ts:14000,price:97}]).status,'OPEN');
 const b=call(20000,93,[{ts:16000,price:94},{ts:19000,price:93}]);assert.equal(b.status,'INVALIDADO');
 const c=call(21000,94,[{ts:21000,price:94}],{...plan,callInvalidation:93,callTrigger:102});assert.equal(c.id,a.id);assert.equal(c.status,'INVALIDADO');
 const d=call(25000,97,[{ts:22000,price:96},{ts:24000,price:97}],{...plan,callInvalidation:94});assert.notEqual(d.id,a.id);assert.equal(d.status,'OPEN');
});

test('forecast history retains both intervals while the original totals input stays unchanged',()=>{
 const d=new LocalPlaywrightDriver(),st=d.state('iq_option');st.activeId=1382;st.symbol='USD/HKD OTC';
 const request=(id,size)=>d.ingest('iq_option',JSON.stringify({name:'sendMessage',request_id:id,msg:{name:'get-candles',body:{active_id:1382,size}}}),'direct-out');
 const reply=(id,candles)=>d.ingest('iq_option',JSON.stringify({name:'candles',request_id:id,msg:{candles}}),'direct-in');
 const start=Math.floor(Date.now()/1000)-120;
 request('a',60);reply('a',[{from:start,to:start+60,open:100,high:101,low:99,close:100}]);
 request('b',120);reply('b',[{from:start,to:start+120,open:100,high:102,low:98,close:101}]);
 assert.equal(st.candles.length,1);assert.equal(st.candles[0].to-start,120);
 assert.equal(st.predictionCandles.length,2);assert.deepEqual(st.predictionCandles.map(c=>c.to-c.from).sort((a,b)=>a-b),[60,120]);
 d.applyActiveSelection('iq_option',{symbol:'EUR/USD OTC',activeId:2,source:'protocol-page'});assert.equal(st.predictionCandles.length,0);
});

test('maintenance refreshes history using request.at even when the current quote and candles are fresh',async()=>{
 const d=new LocalPlaywrightDriver(),st=d.state('iq_option'),now=Date.now();
 Object.assign(st,{activeId:1382,candleActiveId:1382,symbol:'USD/HKD OTC',quote:100,candles:bars(60,now/1000),lastFullDomAt:now,lastRequestAt:now,lastExecutionScanAt:now,lastCandleRequest:{at:now-10000},balance:1});
 let force=null;d.requestMarketData=async(_,args)=>{force=args.force};
 await d.maintain('iq_option');assert.equal(force,true);
});

test('pinned forecast backfill does not retarget the chart or add subscriptions',async()=>{
 const d=new LocalPlaywrightDriver(),st=d.state('iq_option');Object.assign(st,{activeId:1382,candleSize:60});d.setPredictionPeriod('iq_option',120);
 d.directFeed=async()=>null;const sent=[];d.wsSend=async(_,p)=>{sent.push(p);return{ok:true}};
 assert.equal(await d.refreshPredictionHistory('iq_option',Date.now()),true);assert.equal(st.candleSize,60);
 assert.equal(sent.length,1);assert.equal(sent[0].msg.body.size,120);assert.equal(sent[0].msg.name,'get-candles');
 assert.equal(await d.refreshPredictionHistory('iq_option',Date.now()),false);
});

test('journal records release, input freshness and actual totals beside the original signal',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'sentinel-journal-'));
 try{const journal=new MarketJournal({directory,release:{version:'13.4.21',build:'test'}}),totals={rapid:{callPct:61},strategies:{callPct:62},displayCallPct:63};
  journal.analysis({operationalSignal:{side:'CALL'},generalConsensus:totals,predictionInputQuality:{periodSeconds:60,ageMs:900000,ready:false}},'TEST',Date.now());await journal.flush();
  const row=JSON.parse((await readFile(journal.file,'utf8')).trim());assert.deepEqual(row.generalConsensus,totals);assert.equal(row.release.version,'13.4.21');assert.equal(row.predictionInputQuality.ready,false);assert.equal(row.operational.side,'CALL');
 }finally{await rm(directory,{recursive:true,force:true})}
});


test('the installed prediction path blocks stale-base authorization without modifying the three totals',async()=>{
 const x=JSON.parse(await readFile('tests/fixtures/sentinel-continuation-prices.json','utf8'));
 const snap={provider:'test',candles:x.candles.map(c=>({...c,from:c.from-900,to:c.to-900})),quoteHistory:x.quoteHistory,quoteTs:x.now,price:x.quoteHistory.at(-1).price};
 const old=new DemoTradingRuntime({predictionModel:'family-v6-stable',entryPolicy:'structural-reversals-v1'}),fixed=new DemoTradingRuntime({predictionModel:'family-v6-verified-input',entryPolicy:'structural-reversals-v1',scenarioPolicy:'closed-structure-v1'});
 for(const r of [old,fixed]){r.settings.asset='TEST';r.settings.strategy='trend';r.settings.risk.minConfidence=55;r.settings.futureDisplayThreshold=50;}
 const a=analyzeReplayFrame(old,snap,x.now),b=analyzeReplayFrame(fixed,snap,x.now);
 assert.deepEqual(b.generalConsensus,a.generalConsensus);assert.equal(b.predictionInputQuality.ready,false);
 assert.equal(b.entryPlanner.modelVersion,'future-v6.2-verified-input');
 assert.notEqual(b.entryPlanner.horizons['60'].modelVersion,a.entryPlanner.horizons['60'].modelVersion);
 assert.equal(b.operationalSignal.actionable,false);assert.equal(b.operationalSignal.scenario,null);
 assert.ok(b.operationalSignal.entryAnalyst.candidates.every(c=>!c.allowed&&c.blockedBy==='prediction-history'));
});

test('schema 2 replay uses recorded release options and separates versions while preserving official closed bars',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'sentinel-replay-v2-'));
 try{
  const t=1800000000000,path=join(directory,'events.jsonl');
  const runtime={predictionModel:'family-v6-verified-input',entryPolicy:'structural-reversals-v1',scenarioPolicy:'closed-structure-v1'};
  const rows=[0,1000,2000].map((offset,i)=>({schema:2,type:'market',ts:t+offset,provider:'test',asset:'TEST',release:{version:'13.4.21',build:i===2?'second-build':'first-build',runtime},candles:bars(60,t/1000),predictionCandles:bars(120,t/1000),quote:103,quoteTs:t+offset,quotes:[{ts:t+offset,price:103}],settings:{minConfidence:55}}));
  await writeFile(path,rows.map(e=>JSON.stringify(e)).join('\n'));
  let calls=0;
  const report=await replayJournal([path],{analyze:(r,snap)=>{calls++;assert.equal(r.predictionModel,runtime.predictionModel);assert.equal(r.scenarioPolicy,runtime.scenarioPolicy);assert.equal(snap.candles.at(-1).close,100);assert.equal(snap.predictionCandles.at(-1).to-snap.predictionCandles.at(-1).from,120);return{}}});
  assert.equal(calls,3);assert.equal(report.research.length,2);
 }finally{await rm(directory,{recursive:true,force:true})}
});
