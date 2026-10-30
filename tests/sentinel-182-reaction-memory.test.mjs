import test from 'node:test';import assert from 'node:assert/strict';
import {ReactionOpportunityMemory} from '../sentinel-trading-lab/agent/src/core/reaction-opportunity-memory.mjs';
const T=1800000000000;
for(const durationMs of [30000,60000,300000])for(const side of ['CALL','PUT']){
 const sign=side==='CALL'?1:-1,p=v=>100+sign*v;
 test(durationMs+' '+side+': a renamed fresh pivot cannot renew a missed, worse-priced reaction',()=>{
  const m=new ReactionOpportunityMemory();m.beginOperation('A|'+durationMs,'old-op');
  const q0={ts:T,price:p(.5),receivedAt:T};
  const input={candidate:{ready:true,side,reason:'confirmed-fast-level-reversal',level:100},quoteHistory:[q0],quoteAt:T,now:T,price:q0.price,tolerance:.1,held:true};
  assert.equal(m.observe(input),null,'holding never vetoes or modifies the existing trade');
  const q1={ts:T+1000,price:p(.8),receivedAt:T+1000};
  const risk=m.observe({...input,candidate:{...input.candidate,reason:'confirmed-level-structure-reversal'},quoteHistory:[q0,q1],quoteAt:q1.ts,now:q1.ts,price:q1.price,held:false});
  assert.equal(risk?.kind,'same-reaction-after-better-missed-price');assert.equal(risk.firstPrice,q0.price);
 });
 test(durationMs+' '+side+': real retest or improved price remains eligible immediately',()=>{
  const m=new ReactionOpportunityMemory();m.beginOperation('A|'+durationMs,'old-op');
  const candidate={ready:true,side,reason:'confirmed-level-structure-reversal',level:100};
  const q0={ts:T,price:p(.5)},q1={ts:T+1000,price:p(.3)},touch={ts:T+2000,price:p(.05)},q2={ts:T+3000,price:p(.8)};
  m.observe({candidate,quoteHistory:[q0],quoteAt:T,now:T,price:q0.price,tolerance:.1,held:true});
  assert.equal(m.observe({candidate,quoteHistory:[q0,q1],quoteAt:q1.ts,now:q1.ts,price:q1.price,tolerance:.1}),null,'later better price is preserved');
  assert.equal(m.observe({candidate,quoteHistory:[q0,q1,touch,q2],quoteAt:q2.ts,now:q2.ts,price:q2.price,tolerance:.1}),null,'fresh retest resets the prior reaction without any timed wait');
 });
}
test('future and unreceived prices cannot clear a missed reaction',()=>{
 const m=new ReactionOpportunityMemory();m.beginOperation('A','op');const candidate={ready:true,side:'CALL',reason:'confirmed-level-structure-reversal',level:100},q={ts:T,price:100.5};
 const input={candidate,quoteHistory:[q],quoteAt:T,now:T,price:q.price,tolerance:.1,held:true};m.observe(input);
 const next={ts:T+1000,price:100.8};
 assert.ok(m.observe({...input,held:false,quoteAt:next.ts,now:next.ts,price:next.price,quoteHistory:[q,{ts:T+500,price:100,receivedAt:T+2000},next,{ts:T+2000,price:100}]}));
});
test('an ordinary continuation, another level or another context is not vetoed by reversal memory',()=>{
 const m=new ReactionOpportunityMemory();m.beginOperation('A','op');const candidate={ready:true,side:'CALL',reason:'confirmed-level-structure-reversal',level:100},q={ts:T,price:100.5},q1={ts:T+1000,price:100.8};
 const input={candidate,quoteHistory:[q],quoteAt:T,now:T,price:q.price,tolerance:.1,held:true};m.observe(input);
 const next={...input,held:false,quoteAt:q1.ts,now:q1.ts,price:q1.price,quoteHistory:[q,q1]};
 assert.equal(m.observe({...next,candidate:{...candidate,reason:'closed-structure-and-live-impulse'}}),null);
 assert.equal(m.observe({...next,candidate:{...candidate,level:101}}),null);
 m.beginOperation('B','op');assert.equal(m.observe(next),null);
});
