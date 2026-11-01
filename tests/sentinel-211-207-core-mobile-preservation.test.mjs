import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {reviewPreEntryRisk} from '../sentinel-trading-lab/agent/src/core/pre-entry-risk-review.mjs';
import {reviewDistinctOpportunity} from '../sentinel-trading-lab/agent/src/core/distinct-opportunity-review.mjs';
const get=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const blob=s=>createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex');

test('211: the three 207 analytical modules are faithfully restored',()=>{
 assert.equal(blob(get('sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs')),'2ea7af14e969b684665ccbc8804f7afde31ce316');
 assert.equal(blob(get('sentinel-trading-lab/agent/src/core/expiry-trend-adjudicator.mjs')),'4beaac679a3912842a4d6a28e93c6481e3cc7f1e');
 const liveReviewer=get('sentinel-trading-lab/agent/src/core/pre-entry-risk-review.mjs');
 const baselineReviewer=liveReviewer.replace("import {entryFamilyOf} from './entry-family.mjs';\\n",'')
   .split('// Historical 208 alignment functions for replay tests only. NOT invoked by 207')[0].trimEnd()+'\\n';
 assert.equal(blob(baselineReviewer),'50c282497a7c4f80e51c745612e454ad21d5739b');
 assert.match(liveReviewer,/if\\(!review\\.blocked\\)return candidate;/,'208 hard cutoff is not called by live reviewer');
});
test('211: native broker expiration, selected chart period and Agent executor stay byte-for-byte as 210',()=>{
 assert.equal(blob(get('sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs')),'be2aa95874922b94564400979aad4dedd1d61485');
 assert.equal(blob(get('sentinel-trading-lab/agent/worker/broker-chart-period-keeper.mjs')),'a59968654723e4c8124164844745eee30ef89655');
 assert.equal(blob(get('sentinel-trading-lab/agent/worker/index.mjs')),'a376e187ae5d8456ca7500439317727fc9afb861');
 assert.equal(blob(get('sentinel-trading-lab/src/components/LiveScenarioCard.tsx')),'c8a71e287acaa552dc871b028e8142c35a81d383');
});
test('211: late 1m qualified 207 continuation is not automatically blocked by candle second',()=>{
 const at=1800000056000,price=1.081;
 const candidate={ready:true,side:'CALL',reason:'closed-structure-and-live-impulse',observedAt:at,entryPrice:price};
 const result=reviewPreEntryRisk({candidate,original:candidate,price,quoteAt:at,now:at,durationMs:60000,quoteHistory:[{ts:at,price,receivedAt:at}],candles:[]});
 assert.strictEqual(result,candidate);
});
test('211: repetition review still distinguishes exact reused entry from a new direction and never affects 5m',()=>{
 const at=1800000000000,durationMs=60000,price=1.081;
 const last={provider:'exnova',asset:'EUR/GBP OTC',durationMs,at,exitAt:at+durationMs,side:'CALL',family:'continuation',entryPrice:price,reason:'closed-structure-and-live-impulse',level:null};
 const quoteHistory=Array.from({length:71},(_,i)=>({ts:at+i*1000,receivedAt:at+i*1000,price:price+i*.000001}));
 const candidate={ready:true,side:'CALL',reason:last.reason,observedAt:at+70000,entryPrice:quoteHistory.at(-1).price};
 const input={candidate,last,provider:'exnova',asset:'EUR/GBP OTC',durationMs,quoteHistory,quoteAt:at+70000,now:at+70000,price:candidate.entryPrice};
 const veto=reviewDistinctOpportunity(input);
 assert.equal(veto.ready,false);
 assert.equal(veto.entryRisk.kind,'same-opportunity-after-expiry');
 assert.strictEqual(reviewDistinctOpportunity({...input,candidate:{...candidate,side:'PUT'}}).ready,true);
 assert.strictEqual(reviewDistinctOpportunity({...input,durationMs:300000}).ready,true);
});
test('211: mobile compact heading and blue reading use fixed 26+34px layout without hiding timers',()=>{
 const css=get('sentinel-trading-lab/src/app/globals.css');
 assert.match(css,/13\.9\.211: single-line fixed-height mobile live heading/);
 assert.match(css,/grid-template-rows:26px 34px!important/);
 assert.match(css,/height:62px!important;min-height:62px!important;max-height:62px!important/);
 assert.match(css,/font-size:23px!important;line-height:27px!important/);
 assert.doesNotMatch(css.slice(css.lastIndexOf('13.9.211:')),/setTimeout|setInterval|orderDurationMs|\.click\(/);
});
