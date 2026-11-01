import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {reviewHybridFamilyProof,usesLegacy207OpportunityAdmission} from '../sentinel-trading-lab/agent/src/core/hybrid-family-proof-213.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const blob=s=>createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex');
const AT=1800000037000, P=1.2;
function scenario(reason='failed-breakout-structure-change',side='CALL') {
 const s=side==='CALL'?1:-1;
 const quotes=Array.from({length:61},(_,i)=>{
  const progress=i/60,offset=progress<=.5?
   (.0002-.00028*progress*2):(-.00008+.00008*(progress-.5)*2);
  return{ts:AT-60000+i*1000,receivedAt:AT-60000+i*1000,price:P+s*offset};
 });
 const level=P-s*.0002;
 const seq={kind:reason,side,brokenAt:AT-45000,reclaimedAt:AT-20000,
  confirmedAt:AT,level:{level}};
 const cand={ready:true,side,reason,observedAt:AT,entryPrice:P,
  priceStructure:{observedSequence:{structureChange:seq}}};
 const zone={level,low:level-.00003,high:level+.00003,confirmedPivots:2,
   supportPivots:side==='CALL'?0:2,resistancePivots:side==='CALL'?2:0,
   supportRejections:side==='CALL'?0:3,resistanceRejections:side==='CALL'?3:0};
 const structure={candleLevelMap:{observedCandles:45,asOf:AT-1000,
   tolerance:.00001,levels:[zone]}};
 return{candidate:cand,quoteHistory:quotes,quoteAt:AT,now:AT,price:P,
   durationMs:60000,structure,candles:[]};
}
test('214: original 207 main decision runtime is byte-exact after removing later isolated extensions',()=>{
 let code=read('sentinel-trading-lab/agent/src/core/runtime.mjs');
 code=code.replace("import {reviewDistinctOpportunity,rememberFiredOpportunity} from './distinct-opportunity-review.mjs';\n",'')
   .replace("import {reviewLateBreakoutTransition} from './late-breakout-transition-review.mjs';\n",'')
   .replace("import {reviewHybridFamilyProof,usesLegacy207OpportunityAdmission} from './hybrid-family-proof-213.mjs';\n",'')
   .replace("this.reactionOpportunityMemory=new ReactionOpportunityMemory();this.lastDistinctOpportunity=null;",
      "this.reactionOpportunityMemory=new ReactionOpportunityMemory();")
   .replace(/      \/\/ A new quote after expiry alone is NOT a new opportunity\.[\s\S]*?(?=      let next=advanceNowOpportunity\()/,'')
   .replace(/        this.lastDistinctOpportunity=rememberFiredOpportunity\(\{[\s\S]*?\n        \}\);\n/,'');
 assert.equal(blob(code),'3226855b87438ded475a064f5a01d2caadafea31');
 const risk=read('sentinel-trading-lab/agent/src/core/pre-entry-risk-review.mjs')
   .replace("import {entryFamilyOf} from './entry-family.mjs';\n",'')
   .split('// Historical 208 alignment functions for replay tests only.')[0].trimEnd()+'\n';
 assert.equal(blob(risk),'50c282497a7c4f80e51c745612e454ad21d5739b');
});
test('214: 207 impulse and structural path bypass later repetition rule; 212 rapid and breakout still use it',()=>{
 assert.equal(usesLegacy207OpportunityAdmission({reason:'closed-structure-and-live-impulse'}),true);
 assert.equal(usesLegacy207OpportunityAdmission({reason:'confirmed-level-structure-reversal'}),true);
 assert.equal(usesLegacy207OpportunityAdmission({reason:'confirmed-fast-level-reversal'}),false);
 assert.equal(usesLegacy207OpportunityAdmission({reason:'historical-level-breakout'}),false);
 for(const [path,sha] of [
  ['sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs','2ea7af14e969b684665ccbc8804f7afde31ce316'],
  ['sentinel-trading-lab/agent/src/core/entry-family.mjs','fe086df157758c8ba2150902fc088c3996f8a6c6'],
  ['sentinel-trading-lab/agent/src/core/early-reversal-transition.mjs','e3109dab00dc406d95296feede07b9400fab8fd8'],
  ['sentinel-trading-lab/agent/src/core/observed-level-sequence.mjs','c876378ae8cc56099ef3a304df5617cbe0c69818'],
  ['sentinel-trading-lab/agent/src/core/late-breakout-transition-review.mjs','b16fa7911fc5101aa1c9d454f7f5cafc6aca79be']
 ])assert.equal(blob(read(path)),sha,path);
});
test('214: verified fresh failed-breakout structure can override opposite old minute',()=>{
 for(const side of ['CALL','PUT']){
  const i=scenario('failed-breakout-structure-change',side);
  const frozen=structuredClone(i);
  assert.strictEqual(reviewHybridFamilyProof(i),i.candidate,'207 fresh level reclaim preserved');
  assert.deepEqual(i,frozen,'does not mutate original signals');
  const stale=structuredClone(i);
  stale.candidate.priceStructure.observedSequence.structureChange.confirmedAt=AT-8000;
  assert.equal(reviewHybridFamilyProof(stale).ready,false,'stale reclaim does not override risk');
  const shallow=structuredClone(i);
  shallow.structure.candleLevelMap.tolerance=.0002;
  assert.equal(reviewHybridFamilyProof(shallow).ready,false,'insufficient confirmed clearance');
  const missing=structuredClone(i);
  delete missing.candidate.priceStructure.observedSequence.structureChange;
  assert.equal(reviewHybridFamilyProof(missing).ready,false,'no fabricated reclaim');
 }
});
test('214: retest at verified opposing historical role is blocked without proved role conversion',()=>{
 for(const side of ['CALL','PUT']){
  const i=scenario('break-retest-continuation',side);
  const r=reviewHybridFamilyProof(i);
  assert.equal(r.ready,false);
  assert.equal(r.side,null);
  assert.equal(r.provisionalSide,side);
  assert.deepEqual(r.entryRisk.reasons,['retest-without-verified-new-level-role']);
  const noMap={...i,structure:null};
  assert.strictEqual(reviewHybridFamilyProof(noMap),i.candidate,'unknown role does not create a veto');
  const known=structuredClone(i);
  const z=known.structure.candleLevelMap.levels[0];
  if(side==='CALL'){z.supportPivots=2;z.supportRejections=3}
  else{z.resistancePivots=2;z.resistanceRejections=3}
  assert.strictEqual(reviewHybridFamilyProof(known),known.candidate,'already-confirmed role remains eligible');
 }
});
test('214: real crossing, retest and departure permits a changed role for CALL',()=>{
 const i=scenario('break-retest-continuation','CALL');
 const z=i.structure.candleLevelMap.levels[0];
 i.quoteHistory=[
  {ts:AT-5000,receivedAt:AT-5000,price:z.low-.00009},
  {ts:AT-4000,receivedAt:AT-4000,price:z.high+.00006},
  {ts:AT-3000,receivedAt:AT-3000,price:z.level},
  {ts:AT-2000,receivedAt:AT-2000,price:z.high+.00004},
  {ts:AT-1000,receivedAt:AT-1000,price:P-.00001},
  {ts:AT,receivedAt:AT,price:P}
 ];
 assert.strictEqual(reviewHybridFamilyProof(i),i.candidate);
});
test('214: 212 fast reversal and level breakout, 207 impulse unchanged at every expiry',()=>{
 for(const durationMs of [30000,60000,300000]){
  for(const reason of ['closed-structure-and-live-impulse','confirmed-fast-level-reversal','historical-level-breakout']){
   const i=scenario(reason);
   i.durationMs=durationMs;
   assert.strictEqual(reviewHybridFamilyProof(i),i.candidate,reason+durationMs);
  }
 }
});
test('214: expiry/worker/UI binaries untouched and no fixed wait introduced',()=>{
 for(const [p,sha] of [
  ['sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs','be2aa95874922b94564400979aad4dedd1d61485'],
  ['sentinel-trading-lab/agent/worker/broker-chart-period-keeper.mjs','a59968654723e4c8124164844745eee30ef89655'],
  ['sentinel-trading-lab/agent/worker/index.mjs','a376e187ae5d8456ca7500439317727fc9afb861'],
  ['sentinel-trading-lab/src/components/LiveScenarioCard.tsx','c8a71e287acaa552dc871b028e8142c35a81d383']
 ])assert.equal(blob(read(p)),sha,p);
 const risk=read('sentinel-trading-lab/agent/src/core/hybrid-family-proof-213.mjs');
 assert.doesNotMatch(risk,/setTimeout\(|setInterval\(|sleep\(|click\(|setNativeExpiry|orderDurationMs\s*=/);
 const runtime=read('sentinel-trading-lab/agent/src/core/runtime.mjs');
 assert.match(runtime,/candidate:eligible,structure:reactionStructure,quoteHistory:snap\.quoteHistory/);
});
