import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {ForecastResearch,forecastFeatures} from '../sentinel-trading-lab/agent/src/core/forecast-research.mjs';
import {aggregateTimedCandles} from '../sentinel-trading-lab/agent/src/core/indicators.mjs';
import {analyzeMarket} from '../sentinel-trading-lab/agent/src/core/strategy.mjs';
import {MarketJournal} from '../sentinel-trading-lab/agent/worker/market-journal.mjs';
import {replayJournal} from '../sentinel-trading-lab/agent/worker/replay.mjs';
const t=Date.UTC(2026,9,7,12);
function fixture(side='CALL'){
  const r=new DemoTradingRuntime();Object.assign(r.settings,{asset:'TEST',forecastHorizonSeconds:60,orderDurationMs:30000,futureDisplayThreshold:70});r.settings.risk.minConfidence=55;
  const call=side==='CALL',p={asset:'TEST',horizonSeconds:60,rawBias:side,bias:side,outlookReady:true,directionReady:true,confidence:80,agreement:80,callProbability:call?80:20,putProbability:call?20:80,strategyFutureBias:side,strategyFuture:{activeCount:1,evidence:80,confidence:80},callTrigger:100,putTrigger:100,callInvalidation:90,putInvalidation:110,callRule:'romper',putRule:'romper'};
  const a={quality:{entrySide:call?'BUY':'SELL'},generalConsensus:{rapid:{side},strategies:{side,strength:80}},metrics:{micro:{},shortModel:{}},entryPlanner:{horizons:{'30':{...p,horizonSeconds:30},'60':p}}};return{r,a};
}
test('a first touch is insufficient, independent quotes can confirm without a fixed delay',()=>{
  for(const side of ['CALL','PUT']){const{r,a}=fixture(side),price=side==='CALL'?100.01:99.99;
    const first=r._operationalSignalState(a,{price,quoteTs:t,quoteHistory:[{ts:t,price}]},t);assert.equal(first.actionable,false);
    const duplicate=r._operationalSignalState(a,{price,quoteTs:t,quoteHistory:[{ts:t,price}]},t+100);assert.equal(duplicate.actionable,false);
    const second=r._operationalSignalState(a,{price,quoteTs:t+200,quoteHistory:[{ts:t,price},{ts:t+200,price}]},t+200);assert.equal(second.actionable,true);assert.equal(second.createdAt,t);
  }
});
test('touch, failed hold, retouch must not reuse the previous confirmation',()=>{
  const{r,a}=fixture();r._operationalSignalState(a,{price:100.1,quoteTs:t},t);r._operationalSignalState(a,{price:99.9,quoteTs:t+100},t+100);
  const retry=r._operationalSignalState(a,{price:100.1,quoteTs:t+200},t+200);assert.equal(retry.actionable,false);
});
test('unconfirmed reversal candidates cannot bypass violent opposite flow',()=>{
  for(const side of ['CALL','PUT']){const{r,a}=fixture(side),call=side==='CALL',sign=call?-1:1,price=call?100.1:99.9;
    a.metrics.shortModel={ready:true,reversalCallCandidate:call,reversalPutCandidate:!call,turnUp:false,turnDown:false};a.metrics.micro={delta5:sign*.01,delta15:sign*.02,p5:sign*2.1,pulse:sign*14};
    const op=r._operationalSignalState(a,{price,quoteTs:t,quoteHistory:[{ts:t-200,price},{ts:t,price}]},t);assert.equal(op.actionable,false);assert.equal(op.state,'AGUARDAR FORÇA');
  }
});
test('opposition evaluations require different quotes and stretched state alone does not cancel',()=>{
  const{r,a}=fixture();r._operationalSignalState(a,{price:99.9,quoteTs:t},t);
  a.entryPlanner.horizons['60'].safety={blocked:true,chaseBlocked:true,blockedSide:'CALL'};
  for(const ms of [100,200,300])assert.notEqual(r._operationalSignalState(a,{price:99.9,quoteTs:t},t+ms).state,'INVALIDADO');
  a.metrics.shortModel={ready:true};a.metrics.micro={delta5:-.01,delta15:-.02,p5:-2.1,pulse:-14};
  const one=r._operationalSignalState(a,{price:99.9,quoteTs:t+500},t+500);assert.notEqual(one.state,'INVALIDADO');
  assert.notEqual(r._operationalSignalState(a,{price:99.9,quoteTs:t+500},t+600).state,'INVALIDADO');
  assert.equal(r._operationalSignalState(a,{price:99.9,quoteTs:t+700},t+700).state,'INVALIDADO');
});
test('timeframe buckets stay on clock boundaries when new candles arrive',()=>{
  const bars=Array.from({length:10},(_,i)=>({from:i*60,to:(i+1)*60,open:i,high:i+1,low:i,close:i+.5}));
  const first=aggregateTimedCandles(bars.slice(0,8),300),next=aggregateTimedCandles(bars,300);assert.deepEqual(next[0],first[0]);assert.equal(next[0].from,0);assert.equal(next[1].from,300);
});
function market(direction=1){
  const base=Math.floor(t/1000)-180*60,candles=Array.from({length:180},(_,i)=>{const close=100+i*.02*direction;return{from:base+i*60,to:base+(i+1)*60,open:close-.005*direction,close,high:close+.02,low:close-.02}}),last=candles.at(-1).close;
  const quoteHistory=Array.from({length:181},(_,i)=>({ts:t-(180-i)*1000,price:last-(180-i)*.004*direction}));return{candles,quoteHistory,quoteTs:t,now:t,durationMs:30000,minConfidence:55};
}
test('strategy specialists produce different projections and reversal strategies can recognize continuation',()=>{
  const input=market(),plans=['trend','support_resistance','price_action','mean_reversion'].map(strategy=>analyzeMarket({...input,strategy,candidateModel:true}).entryPlanner.horizons['60']);
  assert.ok(new Set(plans.map(p=>p.rawCallProbability)).size>1);
  assert.notEqual(plans[1].scenario.kind,'reversal');assert.match(plans[1].callRule,/romper/);
  for(const p of plans)assert.ok(p.callInvalidation<input.quoteHistory.at(-1).price);
});
test('future quotes cannot change the present forecast',()=>{
  const input=market(),a=analyzeMarket({...input,strategy:'trend'}),b=analyzeMarket({...input,strategy:'trend',quoteHistory:[...input.quoteHistory,{ts:t+1000,price:150}]});assert.equal(a.entryPlanner.horizons['30'].signal,b.entryPlanner.horizons['30'].signal);
});
test('research learns only matured outcomes, retains blocked forecasts and does not overlap samples',()=>{
  const research=new ForecastResearch(),{a}=fixture();a.entryPlanner.horizons={'30':{...a.entryPlanner.horizons['30'],callProbability:70}};
  const obs=(now,price,quotes=[])=>research.observe({asset:'TEST',analysis:a,snap:{price,quoteHistory:quotes},now});
  obs(t,100);obs(t+10000,101);assert.equal(research.pending.length,1);assert.equal(Object.keys(research.models).length,0);
  obs(t+30000,99,[{ts:t+30000,price:99}]);assert.equal(research.outcomes[0].baselineWon,false);assert.equal(research.models['TEST|30'].updates,1);assert.equal(research.forecast('TEST',a.entryPlanner.horizons['30']).qualified,false);
  const restored=new ForecastResearch(research.snapshot());assert.deepEqual(restored.summary(),research.summary());assert.equal(forecastFeatures(a.entryPlanner.horizons['30']).length,19);
});
test('shadow model qualification requires later evaluated outcomes across sessions',()=>{
  const{a}=fixture(),p=a.entryPlanner.horizons['30'],research=new ForecastResearch();research.outcomes=Array.from({length:120},(_,i)=>({key:'TEST|30',createdAt:t+Math.floor(i/40)*86400000,baselineLoss:.4,modelLoss:.2,draw:false}));assert.equal(research.forecast('TEST',p).qualified,true);research.outcomes=research.outcomes.slice(0,80);assert.equal(research.forecast('TEST',p).qualified,false);
});
test('journal deduplicates quotes, writes checkpoints and excludes account details',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'sentinel-journal-'));try{const j=new MarketJournal({directory:dir}),m={provider:'test',symbol:'TEST',feedValidated:true,quote:100,quoteTs:t,quoteHistory:[{ts:t,price:100}],candles:market().candles,balance:12345,token:'PRIVATE'};j.market(m,{strategy:'trend',risk:{minConfidence:70}},t);j.market(m,{strategy:'trend'},t);assert.equal(j.queue.length,1);await j.flush();const content=await readFile(j.file,'utf8');assert.doesNotMatch(content,/PRIVATE|balance/);assert.equal(JSON.parse(content).candles.length,180);assert.equal(j.status().eventsWritten,1)}finally{await rm(dir,{recursive:true,force:true})}
});
test('replay uses chronological prices, measures execution delay, and never calls a broker',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'sentinel-replay-'));try{const path=join(dir,'test.jsonl'),candles=market().candles,rows=[0,1000,30000,31000].map((offset,i)=>({schema:1,type:'market',provider:'test',asset:'TEST',ts:t+offset,quoteTs:t+offset,quote:i<2?100:99,quotes:[{ts:t+offset,price:i<2?100:99}],candles,settings:{orderDurationMs:30000,forecastHorizonSeconds:60}}));await writeFile(path,rows.map(x=>JSON.stringify(x)).join('\n'));
    const report=await replayJournal([path],{analyze:(_r,_s,now)=>({operationalSignal:{actionable:now===t,side:'CALL',createdAt:t,activeUntil:t+3500,durationMs:30000}})});assert.equal(report.results[0].losses,1);assert.equal(report.results[1].losses,1);assert.equal(report.signals,1);
    rows[1].quotes[0].ts=t+100000;await writeFile(path,rows.map(x=>JSON.stringify(x)).join('\n'));await assert.rejects(replayJournal([path]),/future_quote/);
  }finally{await rm(dir,{recursive:true,force:true})}
});

 test('research never settles or learns a same-symbol forecast using another broker',()=>{
  const research=new ForecastResearch(),{a}=fixture();a.entryPlanner.horizons={'30':a.entryPlanner.horizons['30']};
  research.observe({asset:'TEST',analysis:a,snap:{provider:'broker-a',price:100,quoteHistory:[]},now:t});
  research.observe({asset:'TEST',analysis:a,snap:{provider:'broker-b',price:200,quoteHistory:[{ts:t+30000,price:200}]},now:t+30000});
  assert.equal(research.outcomes.length,0);assert.equal(Object.keys(research.models).length,0);
  research.observe({asset:'TEST',analysis:a,snap:{provider:'broker-a',price:99,quoteHistory:[{ts:t+30000,price:99}]},now:t+30001});
  assert.equal(research.outcomes.length,1);assert.equal(research.outcomes[0].baselineWon,false);
  assert.equal(research.models['broker-a|TEST|30'].updates,1);assert.equal(research.forecast('TEST',a.entryPlanner.horizons['30'],'broker-b').samples,0);
 });

test('entry quality blocks mediocre setups without delaying a strong setup after the trigger',()=>{
  const{r,a}=fixture('CALL');
  for(const key of ['30','60']){
    const p=a.entryPlanner.horizons[key];
    p.callProbability=72;p.putProbability=28;p.confidence=74;p.modelConfidence=74;p.agreement=52;p.dataQuality=66;
    p.reliability={familyAgreement:50,evidenceFamilyCount:3};
    p.strategyFuture={activeCount:1,evidence:20,confidence:74};
  }
  const weak=r._operationalSignalState(a,{price:100.01,quoteTs:t,quoteHistory:[{ts:t-200,price:100.01},{ts:t,price:100.01}]},t);
  assert.equal(weak.actionable,false);
  assert.ok(weak.entryQuality<weak.entryQualityThreshold,JSON.stringify(weak));

  for(const key of ['30','60']){
    const p=a.entryPlanner.horizons[key];
    p.callProbability=86;p.putProbability=14;p.confidence=86;p.modelConfidence=86;p.agreement=82;p.dataQuality=88;
    p.reliability={familyAgreement:82,evidenceFamilyCount:4};
    p.strategyFuture={activeCount:2,evidence:80,confidence:86};
  }
  a.generalConsensus.strategies.strength=86;
  const strong=r._operationalSignalState(a,{price:100.02,quoteTs:t+200,quoteHistory:[{ts:t,price:100.01},{ts:t+200,price:100.02}]},t+200);
  assert.equal(strong.qualityQualified,true);
  assert.equal(strong.actionable,true);
  assert.equal(strong.side,'CALL');
});
