import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {applyFinalRouteCalibration} from '../experiments/final-route-calibration-20261018.mjs';
import {advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const model=JSON.parse(readFileSync(new URL('../reports/sentinel-final-route-model-20261018.json',import.meta.url))),T=1800000000000;
for(const side of ['CALL','PUT'])test('only trained weak route flips '+side+' without changing price, observation or readiness',()=>{
 const candidate={ready:true,side,reason:'multiscale-candle-rejection',observedAt:T,entryPrice:100,predictedPrice:101,expectedLogMove:.01,strength:90};const before=JSON.stringify(candidate);const next=applyFinalRouteCalibration({candidate,model});assert.equal(next.side,side==='CALL'?'PUT':'CALL');assert.equal(next.entryPrice,100);assert.equal(next.observedAt,T);assert.ok(next.ready);assert.equal(next.predictedPrice,null);assert.equal(next.strength,null);assert.equal(JSON.stringify(candidate),before);
});
test('untrained, supported, unready and non-30s decisions remain unchanged',()=>{
 for(const reason of ['break-retest-continuation','unknown','bootstrap-expiry-penalized-fit']){const candidate={ready:true,side:'CALL',reason};assert.equal(applyFinalRouteCalibration({candidate,model}),candidate);}
 const c={ready:true,side:'CALL',reason:'multiscale-candle-rejection'};assert.equal(applyFinalRouteCalibration({candidate:c,model,durationMs:60000}),c);const u={...c,ready:false};assert.equal(applyFinalRouteCalibration({candidate:u,model}),u);
});
test('an already issued CALL remains immutable with original full deadline',()=>{
 const old=advanceNowOpportunity({candidate:{ready:true,side:'CALL',observedAt:T,entryPrice:100},now:T,quoteAt:T,asset:'BTCUSDT',durationMs:30000});const c=applyFinalRouteCalibration({candidate:{ready:true,side:'CALL',reason:'causal-expiry-analogue',observedAt:T+1000,entryPrice:99},model});const next=advanceNowOpportunity({previous:old,candidate:c,now:T+1000,quoteAt:T+1000,asset:'BTCUSDT',durationMs:30000});assert.equal(next.side,'CALL');assert.equal(next.exitAt,T+30000);assert.equal(next.entryReadyNow,false);
});
