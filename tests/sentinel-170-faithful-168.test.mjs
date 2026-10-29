import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {marketDataStatus} from '../sentinel-trading-lab/agent/src/core/market-reading.mjs';
import {assessDirectionalPersistence,reviewDirectionalPersistence,fiveMinuteReversalOnly} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
// Exact Git blob hashes from the published 168 tree, not the modified 169.
const blob=raw=>createHash('sha1').update(Buffer.from('blob '+raw.length+'\0')).update(raw).digest('hex');
for(const [name,sha] of [
 ['fast-level-reversal.mjs','810d78b3229d3eeb427e6c28dcb63a8f6647e9aa'],
 ['observed-level-sequence.mjs','cb3c9a914c1f3cc0ea62ab98a2b0e44690572624'],
 ['entry-price-timing.mjs','36ddcb35492721a7a92fc11466a77f43541f0778']
])test(name+' is byte-identical to the approved published 168',()=>{
 const raw=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/'+name,import.meta.url));
 assert.equal(blob(raw),sha);
});
test('173 preserves the whole 172 engine except the audited fresh-floor review',()=>{
 const raw=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs',import.meta.url),'utf8');
 const addedImport="import {verifiedFastLevelReversal} from './fast-level-reversal.mjs';\n";
 const addedGuard=" const shallowCountertrendFastReversal=\n  candidate.reason==='confirmed-fast-level-reversal'&&candidate.side!==state.side&&\n  state.phase==='reversal-testing'&&Number(state.retracement)<.25;\n const ownVerifiedFastReversal=shallowCountertrendFastReversal&&\n  verifiedFastLevelReversal({\n   reversalEvidence:candidate.priceStructure?.confirmedReversal,\n   quoteHistory,quoteAt,now,price,side:candidate.side\n  });\n if(shallowCountertrendFastReversal&&!ownVerifiedFastReversal)\n  return {...candidate,...diagnostic,ready:false,side:null,provisionalSide:candidate.side,\n   reason:'Reversão rápida ainda sem confirmação própria contra o fluxo maior.'};\n";
 const originalGuard=" const shallowCountertrendFastReversal=\n  candidate.reason==='confirmed-fast-level-reversal'&&candidate.side!==state.side&&\n  state.phase==='reversal-testing'&&Number(state.retracement)<.25;\n if(shallowCountertrendFastReversal)\n  return {...candidate,...diagnostic,ready:false,side:null,provisionalSide:candidate.side,\n   reason:'Reversão rápida ainda rasa contra o fluxo maior.'};\n";
 assert.equal(raw.split(addedImport).length,2,'verified reversal import must occur once');
 assert.equal(raw.split(addedGuard).length,2,'verified reversal exemption must occur once');
 const newFloor=" // A NEW LOW by itself is not evidence that a 60s continuation\n // still has room. A closed-candle impulse can otherwise authorize PUT at\n // the fresh floor even though no independently observed break/retest exists.\n // Keep already-qualified independent breakouts and structural continuations\n // available; this screen does not turn PUT into CALL or schedule a retest.\n const sequence=candidate.priceStructure?.observedSequence?.continuation;\n const independentlyConfirmedBreak=sequence?.kind==='break-retest-continuation'&&\n  sequence.side==='PUT'&&Number(sequence.confirmedAt)>0&&\n  Number(sequence.confirmedAt)<=at&&clock-Number(sequence.confirmedAt)<=2500;\n const closedBarOnly=candidate.reason==='closed-structure-and-live-impulse'&&\n  !independentlyConfirmedBreak;\n if(priorLow-spot>Math.max(typical*3,width*.1)&&!closedBarOnly)return null;\n return {kind:'unverified-late-put-near-recent-floor',position,rangeSeconds:90,\n  priorLow,typicalStep:typical};";
 const oldFloor=" // A significant NEW verified downward break retains the continuation path.\n // Otherwise wait for the independently assessed current-price reversal;\n // do not reverse a signal merely because the price is low.\n if(priorLow-spot>Math.max(typical*3,width*.1))return null;\n return {kind:'unverified-late-put-near-recent-floor',position,rangeSeconds:90,\n  priorLow,typicalStep:typical};";
 assert.equal(raw.split(newFloor).length,2,'173 floor review occurs exactly once');
 const restored172=raw.replace(newFloor,oldFloor);
 assert.equal(blob(Buffer.from(restored172)),'db6123f7bb59823124401c53538335ce895d7619','173 must preserve all 172 engine logic outside the floor review');
 const restored=Buffer.from(restored172.replace(addedImport,'').replace(addedGuard,originalGuard));
 assert.equal(blob(restored),'898d1a79204f5ca2e6580dad6e1a49617ce6d2ec','no other 170 engine code may change');
});
test('runtime matches published 168 except for its read-only observation quote timestamp',()=>{
 const raw=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/runtime.mjs',import.meta.url),'utf8');
 const stamp='observedAt:eligible.observedAt,quoteAt:snap.quoteTs,strength:eligible.strength,';
 assert.equal(raw.split(stamp).length,2);
 const newerFresh="      // Every 60s entry uses the same 1450ms freshness limit as its\n      // last-mile market-risk checks. Do not trade on a quote after those\n      // checks have ceased to be applicable; no new timer or wait.\n      const maxEntryQuoteAgeMs=Number(settings.orderDurationMs)<=10000?800:\n        Number(settings.orderDurationMs)<=30000?1450:\n        Number(settings.orderDurationMs)<=60000?1450:2500;";
 const olderFresh="      const maxEntryQuoteAgeMs=Number(settings.orderDurationMs)<=10000?800:\n        Number(settings.orderDurationMs)<=30000?1450:\n        Number(settings.orderDurationMs)<=60000?1950:2500;";
 assert.equal(raw.split(newerFresh).length,2,'173 uses one unified quote window');
 const restored172=raw.replace(newerFresh,olderFresh);
 assert.equal(blob(Buffer.from(restored172)),'414ec2283a5b874e90e5555a87d74a16a811e6ac','173 preserves the rest of the 172 runtime');
 const restored=Buffer.from(restored172.replace(stamp,'observedAt:eligible.observedAt,strength:eligible.strength,'));
 assert.equal(blob(restored),'56ed4ab3cb4c147eb68997f9a2154038c53ad2cc');
});
for(const durationMs of [30000,60000])for(const direction of [1,-1])test(`${durationMs} ${direction}: keep rapid reversals and new turns; decline only the contradicted older continuation`,()=>{
 const at=1800000000000,span=durationMs===30000?12:20;
 const rows=Array.from({length:span*10+1},(_,i)=>{
  const t=i/10,first=span*.65,end=span-2,
   p=t<=first?-.3*t/first:t<=end?-.3+.1*(t-first)/(end-first):-.2-.03*(t-end)/2;
  return {ts:at-span*1000+i*100,price:100+direction*p};
 });
 const side=direction===1?'CALL':'PUT',args={quoteHistory:rows,quoteAt:at,now:at,price:rows.at(-1).price,durationMs};
 const state=assessDirectionalPersistence(args);assert.equal(state.phase,'weakening');assert.ok(state.latestMove>0);
 const continuation={ready:true,side,reason:'closed-structure-and-live-impulse',observedNetMove:direction*.001};
 assert.equal(reviewDirectionalPersistence({...args,candidate:continuation}).ready,false);
 for(const reason of ['confirmed-level-structure-reversal','confirmed-fast-level-reversal','closed-range-extreme-reversal-confirmed','historical-level-breakout']){
  const own={...continuation,reason,regime:'observed-range-turn'};
  assert.equal(reviewDirectionalPersistence({...args,candidate:own}),own,reason+' must retain the baseline 168 decision');
 }
 const resumed=rows.map(q=>({...q}));
 for(let i=0;i<20;i++)resumed[resumed.length-20+i].price=100+direction*(-.25+.1*i/19);
 const next={...args,quoteHistory:resumed,price:resumed.at(-1).price};
 assert.equal(reviewDirectionalPersistence({...next,candidate:continuation}),continuation,'a current move toward the candidate is not held by the new check');
 const five={...continuation,observedAt:at,entryPrice:args.price};
 assert.equal(fiveMinuteReversalOnly({candidate:five,quoteAt:at,now:at,price:args.price,durationMs:300000}).ready,false,'five minutes keeps its original reversal-only rule');
});
test('a healthy feed adds no technical counter to market messages; a real delay remains labelled',()=>{
 const at=1800000000000;
 for(const durationMs of [30000,60000,300000]){
  for(const age of [0,200,1000])assert.equal(marketDataStatus({quoteAt:at,evaluatedAt:at,now:at+age,durationMs}),'');
  const delayed=marketDataStatus({quoteAt:at,evaluatedAt:at,now:at+6000,durationMs});
  assert.equal(delayed,'COTAÇÃO ATRASADA · ÚLTIMA LEITURA');assert.doesNotMatch(delayed,/\d/);
 }
});
