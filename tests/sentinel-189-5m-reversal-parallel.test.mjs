import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fiveMinuteReversalOnly} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {applyHistoricalPriceStructure} from '../sentinel-trading-lab/agent/src/core/historical-price-structure.mjs';
const T=1800000000000;
test('5m requires independently confirmed long-horizon level-reversal proof',()=>{
 const src=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/historical-price-structure.mjs',import.meta.url),'utf8');
 assert.match(src,/fiveMinuteVerifiedTurn=Number\(durationMs\)===300000/);
 assert.match(src,/evidence\.reactionProof\?\.confirmed===true/);
 assert.match(src,/!fiveMinuteVerifiedTurn/);
 assert.equal(typeof applyHistoricalPriceStructure,'function');
});
test('5m confirmed structural reversal is allowed under strict five-minute gate',()=>{
 const candidate={ready:true,side:'PUT',observedAt:T,entryPrice:100,
  reason:'confirmed-level-structure-reversal',priceStructure:{confirmedReversal:{
   kind:'confirmed-level-structure-reversal',side:'PUT',confirmedAt:T-700}}};
 const result=fiveMinuteReversalOnly({candidate,durationMs:300000,quoteAt:T,
  now:T,price:100,entryFamily:'automatic',quoteHistory:[]});
 assert.equal(result.ready,true);
 assert.equal(result.fiveMinuteReversalConfirmed,true);
});
test('5m unconfirmed touch is WAIT, not fabricated entry',()=>{
 const candidate={ready:true,side:'PUT',observedAt:T,entryPrice:100,
  reason:'historical-level-rejection',priceStructure:{
   reaction:{kind:'rejection',side:'PUT'},
   reactionProof:{confirmed:false,kind:'provisional-reaction',durationMs:300000}}};
 const result=fiveMinuteReversalOnly({candidate,durationMs:300000,quoteAt:T,
  now:T,price:100,entryFamily:'automatic',quoteHistory:[]});
 assert.equal(result.ready,false);
});
