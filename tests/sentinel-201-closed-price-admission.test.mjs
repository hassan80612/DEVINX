import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {reviewPreviousClosedCandlePrice} from '../sentinel-trading-lab/agent/src/core/previous-closed-price-admission.mjs';
const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const fixture=JSON.parse(read('tests/fixtures/sentinel-201-recorded-admission.json'));
const gitSha=s=>createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex');
test('204: explicit reviewer and closed-price admission preserve the published 199 runtime',()=>{
 const runtime=read('sentinel-trading-lab/agent/src/core/runtime.mjs');
 const original=runtime
  .replace("import {reviewPreEntryRisk} from './pre-entry-risk-review.mjs';\n",'')
  .replace(/      \/\/ Review the proposed entry[\s\S]*?      eligible=reviewPreEntryRisk\(\{[\s\S]*?      \}\);\n/,'')
  .replace("import {reviewPreviousClosedCandlePrice} from './previous-closed-price-admission.mjs';\n",'')
  .replace(/      \/\/ Compare a qualified entry[\s\S]*?      eligible=reviewPreviousClosedCandlePrice\(\{[\s\S]*?      \}\);\n/,'');
 assert.equal(gitSha(original),'9ade5cb89128dc64dac05b84d96c5069e2972cf0');
 assert.ok(runtime.indexOf('eligible=reviewPreviousClosedCandlePrice(')>runtime.indexOf('eligible=reviewSetupIntegrity('));
 assert.ok(runtime.indexOf('eligible=reviewPreviousClosedCandlePrice(')<runtime.indexOf('let next=advanceNowOpportunity('));
 assert.match(runtime,/candles:snap.historicalCandlesVerified===false\?\[\]:\(snap.candles\|\|\[\]\)/);
});
test('201: replay the authorized tradeoff honestly across all three recorded batches',()=>{
 const totals={};assert.equal(fixture.cases.length,36);
 for(const row of fixture.cases){
  const copy=structuredClone(row.input),out=reviewPreviousClosedCandlePrice(row.input);
  assert.deepEqual(row.input,copy,'no mutation '+row.id);
  assert.equal(out.ready,row.keep,row.id);
  assert.notEqual(out.side,row.input.candidate.side==='CALL'?'PUT':'CALL','no opposite order '+row.id);
  totals[row.sourceVersion]??={keptWin:0,keptLoss:0,removedWin:0,removedLoss:0};
  const key=(out.ready?'kept':'removed')+(row.outcome==='win'?'Win':'Loss');totals[row.sourceVersion][key]++;
 }
 assert.deepEqual(totals,{
  196:{keptWin:3,keptLoss:3,removedWin:2,removedLoss:3},
  197:{keptWin:6,keptLoss:0,removedWin:1,removedLoss:0},
  199:{keptWin:5,keptLoss:6,removedWin:2,removedLoss:5}
 });
});
test('201: future prices and unfinished candles cannot change the pre-entry verdict',()=>{
 for(const {input,id} of fixture.cases){
  const before=reviewPreviousClosedCandlePrice(input);
  const changed={...input,quoteHistory:[...input.quoteHistory,{ts:input.quoteAt+1000,price:input.price*2,receivedAt:input.now+1000}],
   candles:[...input.candles,{from:input.quoteAt/1000,to:input.quoteAt/1000+60,open:input.price,high:input.price*2,low:input.price*.5,close:input.price*2,receivedAt:input.now}]};
  assert.equal(reviewPreviousClosedCandlePrice(changed).ready,before.ready,id);
 }
});
test('201: existing 5m policy, unknown history and startup remain available without a new wait',()=>{
 for(const {input,id} of fixture.cases){
  assert.equal(reviewPreviousClosedCandlePrice({...input,durationMs:300000}),input.candidate,'5m '+id);
  assert.equal(reviewPreviousClosedCandlePrice({...input,candles:[]}),input.candidate,'missing history '+id);
 }
});

test('201: latest expiry persistence, broker controls, stops and the tested price rule are byte-identical to 199',()=>{
 for(const [path,hash] of Object.entries(fixture.preserved))assert.equal(gitSha(read(path)),hash,path);
});
