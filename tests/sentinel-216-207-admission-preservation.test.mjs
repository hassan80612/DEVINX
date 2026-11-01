import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {usesLegacy207OpportunityAdmission} from '../sentinel-trading-lab/agent/src/core/hybrid-family-proof-213.mjs';
import {reviewDistinctOpportunity} from '../sentinel-trading-lab/agent/src/core/distinct-opportunity-review.mjs';
import {reviewCausalEntry215} from '../sentinel-trading-lab/agent/src/core/causal-entry-quality-215.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const runtime=read('sentinel-trading-lab/agent/src/core/runtime.mjs');
const blob=s=>createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex');
test('216: final routing protects 207 impulse and confirmed structural reversal without removing duplicate check',()=>{
 for(const reason of ['closed-structure-and-live-impulse','confirmed-level-structure-reversal'])
  assert.equal(usesLegacy207OpportunityAdmission({reason}),true);
 for(const reason of ['failed-breakout-structure-change','historical-level-breakout','break-retest-continuation'])
  assert.equal(usesLegacy207OpportunityAdmission({reason}),false);
 const pos=s=>runtime.indexOf(s);
 assert.ok(pos('const restore207Admission=')>0);
 assert.ok(pos('const restore207Admission=')<pos('eligible=reviewDistinctOpportunity('));
 assert.ok(pos('eligible=reviewDistinctOpportunity(')<pos('if(!restore207Admission){'));
 assert.ok(pos('if(!restore207Admission){')<pos('eligible=reviewCausalEntry215('));
 assert.ok(pos('eligible=reviewCausalEntry215(')<pos('let next=advanceNowOpportunity('));
 assert.match(runtime,/restore207Admission=\[30000,60000\]/);
});
test('216: genuine same-side opportunity reuse is blocked immediately at expiry, fresh side is not',()=>{
 const at=1800000000000,now=at+60000;
 const last={provider:'exnova',asset:'EUR/USD OTC',durationMs:60000,at,
  exitAt:now,side:'CALL',family:'continuation',entryPrice:1.1000,reason:'closed-structure-and-live-impulse'};
 const quoteHistory=Array.from({length:61},(_,i)=>({ts:at+i*1000,receivedAt:at+i*1000,price:1.1+i*.000002}));
 const candidate={ready:true,side:'CALL',reason:last.reason,observedAt:now,entryPrice:quoteHistory.at(-1).price};
 const input={candidate,last,provider:last.provider,asset:last.asset,durationMs:60000,quoteHistory,
  quoteAt:now,now,price:candidate.entryPrice,tolerance:.000003};
 assert.equal(reviewDistinctOpportunity(input).entryRisk?.kind,'same-opportunity-after-expiry');
 const other={...input,candidate:{...candidate,side:'PUT'}};
 assert.strictEqual(reviewDistinctOpportunity(other),other.candidate);
});
test('216: no later 215 exhausted-spike veto for original 207 impulse, 215 remains available for other families',()=>{
 const at=1800000000000;
 const q=Array.from({length:121},(_,i)=>{
  const ts=at+(i-120)*1000;
  return{ts,receivedAt:ts,price:1.1+(i-120)*.000001+(i>115?(i-115)*.00004:0)};
 });
 const candidate={ready:true,side:'CALL',reason:'closed-structure-and-live-impulse',observedAt:at,entryPrice:q.at(-1).price};
 const result=reviewCausalEntry215({candidate,quoteHistory:q,quoteAt:at,now:at,price:candidate.entryPrice,durationMs:60000});
 assert.equal(result.ready,false,'215 had this extra veto');
 assert.equal(usesLegacy207OpportunityAdmission(candidate),true,'216 skips that reviewer for 207');
});
test('216: 207 market core and current broker native expiry/chart are unchanged byte-for-byte',()=>{
 for(const [path,expected] of [
  ['sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs','2ea7af14e969b684665ccbc8804f7afde31ce316'],
  ['sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs','be2aa95874922b94564400979aad4dedd1d61485'],
  ['sentinel-trading-lab/agent/worker/broker-chart-period-keeper.mjs','a59968654723e4c8124164844745eee30ef89655']
 ])assert.equal(blob(read(path)),expected,path);
 assert.match(runtime,/entryAdmissionDenials:\(this.entryAdmissionDenials\|\|\[\]\)/);
 const r=JSON.parse(read('sentinel-trading-lab/agent/release.json'));
 assert.equal(r.version,'13.9.216');
 assert.equal(r.publicVersion,r.version);
});
