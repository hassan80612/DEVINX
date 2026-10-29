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
test('the only engine difference from 168 is the specific old closed-bar continuation contradiction',()=>{
 const raw=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs',import.meta.url),'utf8');
 const patch=` // Four older closed bars cannot turn a finished rebound into continuation.
 // Keep this limited to that setup when the latest move already opposes it.
 if(candidate.reason==='closed-structure-and-live-impulse'&&candidate.side!==state.side&&
   state.phase==='weakening'&&Number(state.latestMove)>0&&
   Number(candidate.observedNetMove)*Number(state.netMove)<0)
  return{...candidate,...diagnostic,ready:false,side:null,provisionalSide:candidate.side,
   reason:'older-continuation-against-current-price'};
`;
 assert.equal(raw.split(patch).length,2);
 assert.equal(blob(Buffer.from(raw.replace(patch,''))),'7692396fc263b6872cc0a0cc284d23a793ccaffc');
});
test('runtime matches published 168 except for its read-only observation quote timestamp',()=>{
 const raw=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/runtime.mjs',import.meta.url),'utf8');
 const stamp='observedAt:eligible.observedAt,quoteAt:snap.quoteTs,strength:eligible.strength,';
 assert.equal(raw.split(stamp).length,2);
 const restored=Buffer.from(raw.replace(stamp,'observedAt:eligible.observedAt,strength:eligible.strength,'));
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
