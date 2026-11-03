import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {POST_EXPIRY_REASSESS_MS,advanceNowOpportunity,fiveMinuteReversalOnly} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {reviewEarlyDistantReversal} from '../sentinel-trading-lab/agent/src/core/historical-extreme-timing.mjs';
import {verifyBrokerExpiryForOrder} from '../sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs';
import {normalize228RuntimeReadout} from './helpers/sentinel-228-normalize-readout-and-resume.mjs';
import {normalize230RuntimeWarmup} from './helpers/sentinel-230-normalize-warmup.mjs';
const root=new URL('../sentinel-trading-lab/agent/',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
test('204: preserves the 197 runtime except the three explicit admission reviews',()=>{
 const runtime=read('src/core/runtime.mjs'),room=read('src/core/continuation-room-risk.mjs');
 const gitSha=s=>createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex');
 assert.match(runtime,/eligible=reviewStretchedContinuationEntry\(/);
 // Preserve the published 197 SHA guard: subtract only the audited H207 additions.
 assert.match(runtime,/indicatorEvidence:readoutIndicators/);
 const withoutH207=normalize228RuntimeReadout(normalize230RuntimeWarmup(runtime))
  .replace(/\n\/\/ H207 experimental unified admission\.[\s\S]*?\n\}\n\n(?=function iso)/,'')
  .replace(/      \/\/ H207: shared 30s\/1m entry admission; preserve broker and 5m paths\.\n      eligible=reviewH207UnifiedAdmission\(\{[\s\S]*?      \}\);\n/,'');
 assert.ok(!withoutH207.includes('reviewH207UnifiedAdmission'));
 const without222=withoutH207
  .replace("          probabilityCall:expiryCalibration?.qualified===true?expiryCalibration.pCall:(preliminary?.pCall??null),\n          probabilityPut:expiryCalibration?.qualified===true?expiryCalibration.pPut:(preliminary?.pPut??null),\n          probabilityQualified:expiryCalibration?.qualified===true,\n          probabilitySamples:expiryCalibration?.qualified===true?expiryCalibration.samples:0,\n          probabilitySource:expiryCalibration?.qualified===true?expiryCalibration.probabilitySource:(preliminary?.source??null)","          probabilityCall:preliminary?.pCall??null,\n          probabilityPut:preliminary?.pPut??null,\n          probabilitySource:preliminary?.source??null")
  .replace("          probabilityCall:expiryCalibration?.qualified===true?expiryCalibration.pCall:(preliminary?.pCall??null),probabilityPut:expiryCalibration?.qualified===true?expiryCalibration.pPut:(preliminary?.pPut??null),","          probabilityCall:preliminary?.pCall??null,probabilityPut:preliminary?.pPut??null,")
  .replace("          probabilityCalibrated:expiryCalibration?.qualified===true,","          probabilityCalibrated:expiryCalibration?.calibrated===true,")
  .replace("          probabilitySource:expiryCalibration?.qualified===true?expiryCalibration.probabilitySource:(preliminary?.source??null),\n          probabilityInfluenced","          probabilitySource:preliminary?.source??null,\n          probabilityInfluenced");
 const previousRuntime=without222
  .replace("import {reviewStretchedContinuationEntry} from './stretched-continuation-admission.mjs';\n",'')
  .replace("      // An otherwise healthy trend can be too late at the 60-second edge.\n      // Admission-only: no reversal flip, no artificial wait, no expiry change.\n      eligible=reviewStretchedContinuationEntry({candidate:eligible,quoteHistory:snap.quoteHistory,\n        quoteAt:snap.quoteTs,now,price:snap.price,durationMs:settings.orderDurationMs});\n",'')
   .replace("import {reviewPreEntryRisk} from './pre-entry-risk-review.mjs';\n",'')
   .replace(/      \/\/ Review the proposed entry[\s\S]*?      eligible=reviewPreEntryRisk\(\{[\s\S]*?      \}\);\n/,'')
   .replace("import {reviewPreviousClosedCandlePrice} from './previous-closed-price-admission.mjs';\n",'')
   .replace(/      \/\/ Compare a qualified entry[\s\S]*?      eligible=reviewPreviousClosedCandlePrice\(\{[\s\S]*?      \}\);\n/,'')
   .replace("import {reviewSetupIntegrity} from './setup-integrity-admission.mjs';\n",'')
   .replace(/      \/\/ Review only already-qualified[\s\S]*?      eligible=reviewSetupIntegrity\(\{[\s\S]*?      \}\);\n/,'');
 assert.equal(gitSha(previousRuntime),'f5118600856c7846e6e5a8470aed81acc95c167b');
 const previousRoom=room
  // 226 adds only a recognized fresh-continuation family; all old opposing
  // wall admission logic must still reproduce the original 197 blob.
  .replace(" 'locally-verified-opposite-direction',\n 'fresh-pullback-continuation'"," 'locally-verified-opposite-direction'")
  .replace("import {structuralQuoteMaxAgeMs} from './structure-quote-freshness.mjs';\n",'')
  .replace('clock-at<=structuralQuoteMaxAgeMs(durationMs)','clock-at<=1450');
 assert.match(room,/fresh-pullback-continuation/);
 assert.equal(gitSha(previousRoom),'ee6a97c64ddfeb42c38f1696b4f4c6192450311e');
 assert.match(runtime,/reviewOneMinuteRejectionProof/);
 assert.match(runtime,/reviewSetupIntegrity/);
 assert.doesNotMatch(runtime,/reviewDynamicEntryQuality|arbitrateFinalSide/);
});
test('196: original 189 fast 1m reversal route softened only from 50 to 40 prior candles',()=>{
 const timing=read('src/core/historical-extreme-timing.mjs');
 assert.match(timing,/Number\(durationMs\)!==60000\|\|!candidate/);
 assert.match(timing,/candidate.ready===true&&entryFamilyOf\(candidate\)!=='continuation'/);
 assert.match(timing,/map\?\.observedCandles>=40/);
 assert.match(timing,/lastTwoConfirm\(rows,event.side\)/);
 assert.match(timing,/proof\.pivots>=1&&zone\?\.independentTests>=2/);
 assert.equal(reviewEarlyDistantReversal({candidate:{ready:false},map:null,durationMs:60000}).ready,false);
});
test('196: expiry starts from first new genuine quote, without fixed pause, and no duplicate',()=>{
 assert.equal(POST_EXPIRY_REASSESS_MS,0);
 const at=1800000000000,durationMs=60000;
 const v={ready:true,side:'CALL',observedAt:at,entryPrice:1.234};
 const current=advanceNowOpportunity({candidate:v,asset:'EUR/USD',provider:'iq_option',engineId:'automatic',durationMs,now:at,quoteAt:at});
 assert.equal(current.phase,'fired');
 const later=at+durationMs;
 const stale=advanceNowOpportunity({previous:current,candidate:{...v,observedAt:later,side:'PUT'},
  asset:'EUR/USD',provider:'iq_option',engineId:'automatic',durationMs,now:later,quoteAt:later});
 assert.notEqual(stale.phase,'fired','expiry-boundary quote is not a new opportunity');
});
test('196: stricter previously chosen 5-minute reversal-only policy still protects 5m',()=>{
 const at=1800000000000,spot=1.234;
 const candidate={ready:true,side:'CALL',observedAt:at,entryPrice:spot,reason:'closed-structure-and-live-impulse'};
 const checked=fiveMinuteReversalOnly({candidate,quoteAt:at,now:at,price:spot,durationMs:300000});
 assert.equal(checked.ready,false);
 assert.equal(checked.reason,'five-minute-reversal-only-awaiting-proof');
});
test('196: broker native expiry remains as in latest correction, no unknown-expiry analyzer lock',()=>{
 for(const requiredDurationMs of [30000,60000,300000]){
  assert.equal(verifyBrokerExpiryForOrder({requiredDurationMs,inspection:{currentMs:null}}).allowed,true);
  assert.equal(verifyBrokerExpiryForOrder({requiredDurationMs,inspection:{currentMs:requiredDurationMs}}).allowed,true);
  assert.equal(verifyBrokerExpiryForOrder({requiredDurationMs,inspection:{currentMs:requiredDurationMs===30000?60000:30000}}).allowed,false);
 }
 assert.match(read('worker/broker-native-expiry-keeper.mjs'),/revision:17/);
 assert.match(read('worker/broker-chart-period-keeper.mjs'),/revision:7/);
 assert.match(read('worker/index.mjs'),/retryAlreadyOpenMarketIfMissing/);
});
