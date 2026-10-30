import test from 'node:test';
import assert from 'node:assert/strict';
import {liveEntryQuoteReview} from '../sentinel-trading-lab/agent/worker/live-quote-entry-review.mjs';
const T=1800000000000;
const history=[1,1.00004,1.00005,1.00010,1.00011,1.00012].map((price,i)=>({ts:T-5000+i*1000,price,receivedAt:T-5000+i*1000}));
const signal={at:T,sourceQuoteAt:T,entryPrice:1.00012,side:'CALL',durationMs:60000};
const c={quoteAt:T,quote:1.00012,quoteHistory:history};
test('same current broker quote is eligible without a fixed wait',()=>assert.equal(liveEntryQuoteReview({signal,context:c,now:T+450}).ok,true));
test('missing, stale and backward market snapshots never authorize an old signal',()=>{
 assert.equal(liveEntryQuoteReview({signal,context:{},now:T+100}).ok,false);
 assert.equal(liveEntryQuoteReview({signal,context:c,now:T+1800}).reason,'quote-aged-before-click');
 assert.equal(liveEntryQuoteReview({signal,context:{...c,quoteAt:T-1000},now:T+20}).reason,'broker-quote-behind-decision');
});
test('a changed quote must have a matching locally observed tape',()=>{
 assert.equal(liveEntryQuoteReview({signal,context:{...c,quote:1.00019},now:T+100}).ok,false);
});
test('a strong opposite retracement is declined instead of chased',()=>{
 const h=[...history,{ts:T+1000,receivedAt:T+1000,price:0.99992}];
 assert.equal(liveEntryQuoteReview({signal,context:{quoteAt:T+1000,quote:0.99992,quoteHistory:h},now:T+1100}).reason,'current-price-opposes-entry');
});
test('manual fixed CALL/PUT cadence is independent of analyst price check',()=>assert.equal(liveEntryQuoteReview({signal:{...signal,independent:true},context:{},now:T+9000}).ok,true));
