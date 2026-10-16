import test from 'node:test';
import assert from 'node:assert/strict';
import {CompletedOutcomeSelector} from '../research/completed-outcome-selector.mjs';
import {wideBandCycleForecast} from '../research/wide-band-expiry-direction.mjs';
const T=Date.UTC(2026,9,16,22),base={ready:true,side:'CALL',observedAt:T,entryPrice:1};
const rows=Array.from({length:181},(_,i)=>({ts:T-180000+i*1000,price:Math.exp(.0007*Math.sin(i*Math.PI*2/140))}));
test('shadow outcomes cannot affect a decision before 30s, and a late outcome is discarded',()=>{
 const m=new CompletedOutcomeSelector(),step=(now,price=1)=>m.observe({rows,now,price,base});
 step(T);step(T+29999);assert.equal(m.completed,0);
 step(T+30000,1.1);assert.equal(m.completed,1);
 const late=new CompletedOutcomeSelector();late.observe({rows,now:T,price:1,base});
 late.observe({rows,now:T+31001,price:2,base});assert.equal(late.completed,0);
});
test('a changed market clears shadow labels and never releases a new entry admission',()=>{
 const m=new CompletedOutcomeSelector();m.observe({context:'A',rows,now:T,price:1,base});
 const wait={ready:false,side:null,reason:'not-confirmed'};
 assert.equal(m.observe({context:'B',rows,now:T+30000,price:2,base:wait}),wait);
 assert.equal(m.completed,0);assert.equal(m.pending.length,0);
});
test('wider cycle study ignores future prices and prices received after the decision',()=>{
 const args={quoteHistory:rows,quoteAt:T,now:T,price:rows.at(-1).price,durationMs:30000};
 const expected=wideBandCycleForecast(args);assert.equal(expected.ready,true);
 assert.deepEqual(wideBandCycleForecast({...args,quoteHistory:[...rows,
  {ts:T+100,price:99},{ts:T-500,receivedAt:T+100,price:10}]}),expected);
});
