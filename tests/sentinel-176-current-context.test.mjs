import test from 'node:test';
import assert from 'node:assert/strict';
import {currentEntryContextRisk} from '../sentinel-trading-lab/agent/src/core/current-entry-context.mjs';
import {marketReading} from '../sentinel-trading-lab/agent/src/core/market-reading.mjs';
const T=1800000000000;
for(const durationMs of [30000,60000,300000])for(const mirror of [false,true]){
 const d=mirror?-1:1,side=mirror?'PUT':'CALL',span=Math.min(60,durationMs/3000);
 const quoteHistory=Array.from({length:span+1},(_,i)=>({ts:T-(span-i)*1000,
  price:100+d*(i===span?(span-1)*.01-.005:i*.01)}));
 const price=quoteHistory.at(-1).price;
 const a={quoteHistory,quoteAt:T,now:T,price,durationMs,structure:{candleLevelMap:{asOf:T,observedCandles:100,tolerance:.02,
  levels:[{level:price,low:price-.01,high:price+.01,supportPivots:mirror?0:1,resistancePivots:mirror?1:0,
   supportRejections:0,resistanceRejections:0}]}}};
 test(durationMs+' mirrored='+mirror+': an incidental retreat inside a directional leg does not prove a range reversal',()=>{
  const candidate={ready:true,side:mirror?'CALL':'PUT',reason:'closed-range-extreme-reversal-confirmed',observedAt:T,entryPrice:price};
  assert.equal(currentEntryContextRisk({...a,candidate})?.kind,'range-turn-inside-persistent-directional-leg');
  const original=JSON.stringify(candidate);
  for(const reason of ['confirmed-fast-level-reversal','confirmed-level-structure-reversal','historical-level-rejection'])
   assert.equal(currentEntryContextRisk({...a,candidate:{...candidate,reason}}),null,reason);
  assert.equal(JSON.stringify(candidate),original);
  const extra=[...quoteHistory,{ts:T+1000,receivedAt:T+1000,price:90}];
  assert.deepEqual(currentEntryContextRisk({...a,candidate,quoteHistory:extra}),currentEntryContextRisk({...a,candidate}));
 });
 test(durationMs+' mirrored='+mirror+': a repeated stalled wall test differs from a breakout and from mere proximity',()=>{
  const q=Array.from({length:21},(_,i)=>{const p=i<=5?100+i*.1:i<=10?100.5-(i-5)*.06:i<19?100.2+(i-10)*.033:100.5;
   return {ts:T-20000+i*1000,price:mirror?200-p:p};});
  const candidate={ready:true,side,reason:'closed-structure-and-live-impulse',observedAt:T,entryPrice:q.at(-1).price};
  const z={low:mirror?99.45:100.45,high:mirror?99.55:100.55,level:mirror?99.5:100.5,
   supportPivots:mirror?1:0,resistancePivots:mirror?0:1,supportRejections:mirror?1:0,resistanceRejections:mirror?0:1};
  const input={...a,quoteHistory:q,price:candidate.entryPrice,candidate,
   structure:{candleLevelMap:{asOf:T,observedCandles:100,tolerance:.1,levels:[z]}}};
  // 5m needs a full observed 60s context; do not fabricate missing history.
  if(durationMs===300000){assert.equal(currentEntryContextRisk(input),null);return;}
  assert.equal(currentEntryContextRisk(input)?.kind,'continuation-retesting-uncleared-opposing-wall');
  const breaking=q.map(x=>({...x}));breaking.at(-1).price+=d*.2;
  assert.equal(currentEntryContextRisk({...input,quoteHistory:breaking,price:breaking.at(-1).price,
   candidate:{...candidate,entryPrice:breaking.at(-1).price}}),null);
  assert.equal(currentEntryContextRisk({...input,structure:{candleLevelMap:{...input.structure.candleLevelMap,
   levels:[{...z,supportPivots:0,resistancePivots:0}]}}}),null);
 });
}
test('the market reading explains the actual context without claiming an entry',()=>{
 assert.equal(marketReading({candidate:{ready:false,provisionalSide:'PUT',entryRisk:{kind:'range-turn-inside-persistent-directional-leg'}}}),
  'REVERSÃO AINDA SEM QUEBRA · PUT');
 assert.equal(marketReading({candidate:{ready:false,provisionalSide:'CALL',entryRisk:{kind:'continuation-retesting-uncleared-opposing-wall'}}}),
  'CONTINUIDADE TESTANDO RESISTÊNCIA · CALL');
});
