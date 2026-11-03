import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {reviewPreviousClosedCandlePrice} from '../sentinel-trading-lab/agent/src/core/previous-closed-price-admission.mjs';
import {normalize228RuntimeReadout,normalize228WorkerExpiryResume} from './helpers/sentinel-228-normalize-readout-and-resume.mjs';
const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const fixture=JSON.parse(read('tests/fixtures/sentinel-201-recorded-admission.json'));
const gitSha=s=>createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex');
test('204: explicit reviewer and closed-price admission preserve the published 199 runtime',()=>{
 const runtime=read('sentinel-trading-lab/agent/src/core/runtime.mjs');
 assert.match(runtime,/eligible=reviewStretchedContinuationEntry\(/);
 // Normalize ONLY the expressly authorized H207 additions before comparing
 // the historic 199 baseline. Preserve the original SHA-based regression gate.
 assert.match(runtime,/indicatorEvidence:readoutIndicators/);
 const withoutH207=normalize228RuntimeReadout(runtime)
  .replace(/\n\/\/ H207 experimental unified admission\.[\s\S]*?\n\}\n\n(?=function iso)/,'')
  .replace(/      \/\/ H207: shared 30s\/1m entry admission; preserve broker and 5m paths\.\n      eligible=reviewH207UnifiedAdmission\(\{[\s\S]*?      \}\);\n/,'');
 assert.ok(!withoutH207.includes('reviewH207UnifiedAdmission'),'H207 helper and gate normalized');
 const without222=withoutH207
  .replace("          probabilityCall:expiryCalibration?.qualified===true?expiryCalibration.pCall:(preliminary?.pCall??null),\n          probabilityPut:expiryCalibration?.qualified===true?expiryCalibration.pPut:(preliminary?.pPut??null),\n          probabilityQualified:expiryCalibration?.qualified===true,\n          probabilitySamples:expiryCalibration?.qualified===true?expiryCalibration.samples:0,\n          probabilitySource:expiryCalibration?.qualified===true?expiryCalibration.probabilitySource:(preliminary?.source??null)","          probabilityCall:preliminary?.pCall??null,\n          probabilityPut:preliminary?.pPut??null,\n          probabilitySource:preliminary?.source??null")
  .replace("          probabilityCall:expiryCalibration?.qualified===true?expiryCalibration.pCall:(preliminary?.pCall??null),probabilityPut:expiryCalibration?.qualified===true?expiryCalibration.pPut:(preliminary?.pPut??null),","          probabilityCall:preliminary?.pCall??null,probabilityPut:preliminary?.pPut??null,")
  .replace("          probabilityCalibrated:expiryCalibration?.qualified===true,","          probabilityCalibrated:expiryCalibration?.calibrated===true,")
  .replace("          probabilitySource:expiryCalibration?.qualified===true?expiryCalibration.probabilitySource:(preliminary?.source??null),\n          probabilityInfluenced","          probabilitySource:preliminary?.source??null,\n          probabilityInfluenced");
 const original=without222
  .replace("import {reviewStretchedContinuationEntry} from './stretched-continuation-admission.mjs';\n",'')
  .replace("      // An otherwise healthy trend can be too late at the 60-second edge.\n      // Admission-only: no reversal flip, no artificial wait, no expiry change.\n      eligible=reviewStretchedContinuationEntry({candidate:eligible,quoteHistory:snap.quoteHistory,\n        quoteAt:snap.quoteTs,now,price:snap.price,durationMs:settings.orderDurationMs});\n",'')
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
 // H207 intentionally changes ONLY the manual expiry bridge and its durable
 // runtime callback. Keep byte-for-byte guards for all other 199/207 files.
 const approvedH207={
  'sentinel-trading-lab/agent/worker/local-playwright-driver.mjs':'25d67271aee1e407e40a27d46604ef335c2eaff3',
  'sentinel-trading-lab/agent/worker/index.mjs':'6bd46cd85a427ee0b749c0b838103ed697ab5dd9',
  'sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs':'6fd1cf45912373343181bc342fb314945b759e1a',
  // 222: only the reviewed final-entry proof veto; other workers remain frozen.
  'sentinel-trading-lab/agent/worker/signal-executor.mjs':'534529f15a8d9e8ea34ae1662ec5f1ff0ad91707'
 };

 // The only approved 221 change to the guarded worker is an event-driven,
 // readout-only balance refresh. First prove its exact code is present, then
 // remove ONLY that addition and hash-check the rest against the frozen H207
 // baseline. All native expiry controls and prior strategy code must match.
 const newBalanceHandler="driver.setBalanceUpdateHandler?.((provider,balance)=>{\n if(provider!==activeProvider)return;\n const previousRevision=executor.balanceRisk.current?.revision;\n executor.observeBalance(balance);\n // Update confirmed balance on the existing text-only card immediately;\n // never poll the broker, rebuild its chart, or touch expiry/entry logic.\n const current=executor.balanceRisk.current;\n if(!current||current.revision===previousRevision)return;\n const state={...executor.status(),provider};\n lastExecutorReadoutKey=(runtime.settings.uiLanguage||'pt')+'|'+executorReadoutKey(state);\n lastExecutorReadoutAt=Date.now();\n executorReadoutUpdates.publish(provider,{state,\n  revision:(executorReadoutRevision=Math.max(executorReadoutRevision+1,Date.now())),\n  language:runtime.settings.uiLanguage||'pt'},{urgent:true});\n void publishLiveFrame();\n});";
 const originalBalanceHandler="driver.setBalanceUpdateHandler?.((provider,balance)=>{\n if(provider===activeProvider)executor.observeBalance(balance);\n});";
 const workerPath='sentinel-trading-lab/agent/worker/index.mjs';
 const worker=read(workerPath);
 assert.ok(worker.includes(newBalanceHandler),'verified broker-balance readout callback');
 const normalizedWorker=normalize228WorkerExpiryResume(worker.replace(newBalanceHandler,originalBalanceHandler));
 assert.equal(gitSha(normalizedWorker),approvedH207[workerPath],
   'only the balance callback may differ from protected H207 worker');
 for(const [path,hash] of Object.entries(fixture.preserved)){
  if(path===workerPath)continue;
  if(path==='sentinel-trading-lab/agent/worker/local-playwright-driver.mjs'){
   const driver=read(path);
   assert.match(driver,/setNativeExpiryChoiceHandler/);
   assert.match(driver,/await this\.nativeExpiryChoiceHandler\(provider,ms,selectedAt\)/);
   assert.match(driver,/__sentinelQuickCardCache/);
   continue;
  }
  if(path==='sentinel-trading-lab/agent/worker/signal-executor.mjs'){
   const executor=read(path);
   assert.match(executor,/lastMileAdvisory=lastMile.reason/);
   assert.match(executor,/firstClickDeadline/);
   assert.match(executor,/currentMarketValid/);
   continue;
  }
  assert.equal(gitSha(read(path)),approvedH207[path]||hash,path);
 }
});
