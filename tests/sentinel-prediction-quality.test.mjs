import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fuseForecastEvidence,attenuateForecast,predictionInput,mergePredictionBars} from '../sentinel-trading-lab/agent/src/core/forecast-evidence.mjs';
import {analyzeMarket,analyzePrediction} from '../sentinel-trading-lab/agent/src/core/strategy.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {ForecastResearch} from '../sentinel-trading-lab/agent/src/core/forecast-research.mjs';
const f=(key,value,weight=.2)=>({key,value,weight,available:true});
const fixture=async()=>JSON.parse(await readFile('tests/fixtures/sentinel-continuation-prices.json','utf8'));
test('correlated readings share a bounded budget and duplicate keys have no second vote',()=>{
 const features=[f('micro',.8),f('momentum',.8),f('trend',.8,8),f('history',.8,8),f('mtf',.8,8),f('reversal',-.8),f('strategy',.8)];
 const a=fuseForecastEvidence(features),b=fuseForecastEvidence([...features,f('trend',.8,8)]);
 assert.deepEqual(b,a);assert.ok(a.signal>0);assert.ok(a.rows.every(r=>r.weight<=.28+1e-10));assert.ok(Math.abs(a.rows.reduce((v,r)=>v+r.weight,0)-1)<1e-10);
 assert.ok(a.rows.find(r=>r.family==='structure').weight<=.28+1e-10);
});
test('exhaustion attenuates a forecast without manufacturing a reversal',()=>{
 for(const signal of [-.8,-.04,.04,.8]){const result=attenuateForecast(signal,{overextended:true,turning:true,flowConflict:true,accelerationConflict:true,seconds:30});assert.equal(Math.sign(result),Math.sign(signal));assert.ok(Math.abs(result)<Math.abs(signal));}
 assert.ok(fuseForecastEvidence([f('micro',-.8),f('momentum',-.8),f('trend',.4),f('reversal',-.9),f('strategy',-.5)]).signal<0,'independent opposite evidence can still forecast PUT');
});
test('prediction uses one candle interval, unique points, and only received timestamps',async()=>{
 const x=await fixture(),clean=predictionInput(x);assert.ok(clean.candles.length>=35);assert.equal(new Set(clean.candles.map(c=>c.to-c.from)).size,1);assert.equal(new Set(clean.candles.map(c=>c.from)).size,clean.candles.length);
 const a=analyzePrediction({...x,quoteTs:x.now,predictionStrategies:['trend','trend']}),b=analyzePrediction({...x,quoteTs:x.now,predictionStrategies:['trend']});assert.deepEqual(a.entryPlanner,b.entryPlanner);
 const next={from:x.now/1000+1,to:x.now/1000+61,open:999,high:999,low:999,close:999};
 const c=analyzePrediction({...x,quoteTs:x.now,predictionStrategies:['trend'],candles:[...x.candles,next],quoteHistory:[...x.quoteHistory,{ts:x.now+1000,price:999}]});assert.deepEqual(c.entryPlanner,b.entryPlanner);
 for(const p of Object.values(a.entryPlanner.horizons)){assert.equal(p.modelVersion,'future-v6.0');assert.equal(p.rawCallProbability+p.rawPutProbability,100);assert.ok(p.familyEvidence.every(r=>r.weight<=.28+1e-10));assert.equal(p.reliability.familyAgreement,p.agreement);}
});
test('runtime changes future forecasts while preserving current readings and all three totals',async()=>{
 const x=await fixture(),snap={...x,quoteTs:x.now,price:x.quoteHistory.at(-1).price,provider:'test'};
 const r=new DemoTradingRuntime();r.settings.strategy='trend';r.settings.orderDurationMs=30000;
 const a=analyzeMarket({...snap,strategy:'trend',now:x.now,durationMs:30000}),panel=r._strategyPanel(snap,x.now);
 a.generalConsensus=r._generalConsensus(a,panel);
 const before=structuredClone({totals:a.generalConsensus,metrics:a.metrics,final:a.finalConfluence});
 r._mergeScenarioConfluence(a,panel,snap,x.now);
 assert.deepEqual({totals:a.generalConsensus,metrics:a.metrics,final:a.finalConfluence},before);
 assert.equal(a.entryPlanner.horizons['30'].modelVersion,'future-v6.0');assert.equal(a.entryPlanner.horizons['30'].strategyFuture.blend,0);
 assert.ok(a.predictionMetrics);assert.ok(a.predictionInputQuality.excludedCandles>0);
 assert.deepEqual(r._generalConsensus(a,panel),before.totals);
});
test('legacy model history cannot qualify a different prediction version or profile',()=>{
 const research=new ForecastResearch(),p={horizonSeconds:30,researchContext:'future-v6.0:trend',evidenceFamilies:{}};
 research.outcomes=Array.from({length:150},(_,i)=>({key:'test|TEST|30',draw:false,createdAt:1700000000000+Math.floor(i/50)*86400000,baselineLoss:.4,modelLoss:.1}));
 assert.equal(research.forecast('TEST',{horizonSeconds:30},'test').qualified,true);
 assert.equal(research.forecast('TEST',p,'test').samples,0);assert.equal(research.forecast('TEST',p,'test').qualified,false);
});
test('manager, worker, tray and recovery use the same release metadata',async()=>{
 const base='sentinel-trading-lab/agent/',release=JSON.parse(await readFile(base+'release.json','utf8')),manifest=JSON.parse(await readFile(base+'package.json','utf8'));
 assert.equal(manifest.version,release.version);
 for(const p of ['worker/index.mjs','worker/agent-manager.mjs'])assert.match(await readFile(base+p,'utf8'),/import \{VERSION,BUILD\} from '\.\/release.mjs'/);
 for(const p of ['worker/tray-host.ps1','worker/watchdog.ps1']){const s=await readFile(base+p,'utf8');assert.match(s,/release\.json/);assert.match(s,/\$h\.version -eq \$release\.version/);assert.doesNotMatch(s,/13\.4\.17/);}
});

test('partial quote windows cannot rewrite closed history or erase the forming candle range',()=>{
 const closed={from:0,to:60,open:100,high:104,low:98,close:103},forming={from:60,to:120,open:103,high:106,low:101,close:104};
 const a=mergePredictionBars([closed,forming],[{from:0,to:60,open:101,high:102,low:100,close:101},{from:60,to:120,open:105,high:105,low:104,close:104.5}],90000);
 assert.deepEqual(a[0],closed);assert.deepEqual(a[1],{...forming,close:104.5});
});
