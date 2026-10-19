import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {endpointFeatures,endpointPrediction,ENDPOINT_FEATURE_NAMES} from '../experiments/expiry-endpoint-features-20261019.mjs';
const read=p=>{const u=new URL('../'+p,import.meta.url);return JSON.parse(existsSync(u)?readFileSync(u):gunzipSync(readFileSync(new URL('../'+p+'.gz',import.meta.url))));};
const model=read('reports/sentinel-expiry-endpoint-model-20261019.json');
const report=read('reports/sentinel-expiry-endpoint-development-summary-20261019.json');
const fixture=read('tests/fixtures/sentinel-endpoint-inference-20261019.json');
const entry={p:fixture.expectedProbability,side:fixture.expectedSide,at:fixture.entryAt};
const qs=fixture.quoteHistory,args={quoteHistory:qs,quoteAt:qs.at(-1).ts,price:qs.at(-1).price,now:entry.at};
test('production-language inference matches the frozen Python logistic model',()=>{
 assert.equal(model.featureNames.length,ENDPOINT_FEATURE_NAMES.length);assert.deepEqual(model.featureNames,ENDPOINT_FEATURE_NAMES);
 const r=endpointPrediction(args,model);assert.ok(r);assert.ok(Math.abs(r.callProbability-entry.p)<1e-12);assert.equal(r.side,entry.side);
});
test('future prices and late-arriving historical quotes cannot enter the features',()=>{
 const base=endpointFeatures(args),at=args.quoteAt;
 const contaminated=[...qs,{ts:at+1000,price:1,receivedAt:at+1000},{ts:at-1000,price:999999,receivedAt:at+1000}];
 assert.deepEqual(endpointFeatures({...args,quoteHistory:contaminated}),base);
});
test('missing or stale observations preserve the existing side through unavailable inference',()=>{
 assert.equal(endpointPrediction({...args,now:args.quoteAt+1451},model),null);
 assert.equal(endpointPrediction({...args,quoteHistory:qs.filter(q=>q.ts<args.quoteAt-80000||q.ts>args.quoteAt-70000)},model),null);
});
test('the failed fixed screen did not meet release criteria',()=>{
 assert.equal(report.developmentPassed,false);assert.equal(report.summary['crypto-screen'].candidate.netAt86Percent<0,true);
 assert.equal(report.summary['crypto-screen'].candidate.maxLossStreak>report.summary['crypto-screen'].baseline.maxLossStreak,true);
});
