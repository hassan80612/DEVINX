import test from 'node:test';
import assert from 'node:assert/strict';
import {DirectionDisagreementEvidence} from '../sentinel-trading-lab/agent/src/core/direction-disagreement-evidence.mjs';
const T=1800000000000,C='iq_option|EUR/USD OTC|30000';
const structural={ready:true,side:'CALL',reason:'structure',entryPrice:1.1};
const projected={ready:true,side:'PUT',reason:'30-second-harmonic',entryPrice:1.1};
const ask=(m,{t=T,spot=1.1,context=C,history=[],s=structural,p=projected,receipt=t}={})=>
 m.observe({context,quoteHistory:[...history,{ts:t,price:spot,receivedAt:t}],quoteAt:t,
  price:spot,now:receipt,structural:s,projected:p,projectionTargetAt:t+30000});
test('stage4 cannot use the future; retains published outcome until enough prior paired results',()=>{
 const m=new DirectionDisagreementEvidence();
 assert.equal(ask(m),projected);
 assert.equal(m.pending.length,1);assert.equal(m.scored.length,0);
 ask(m,{t:T+2000,spot:1.1001});assert.equal(m.pending.length,1,'no 5s pseudo-independent samples');
 assert.equal(m.scored.length,0);
});
test('after 6 genuine non-overlapping 30s historical wins stage4 can override WRONG projection',()=>{
 const m=new DirectionDisagreementEvidence();
 for(let i=0;i<6;i++){
  const t=T+i*31000;
  assert.equal(ask(m,{t}),projected);
  ask(m,{t:t+30000,spot:1.101,history:[{ts:t,price:1.1}],s:{ready:false},p:{ready:false}});
 }
 assert.equal(m.scored.length,6);
 const winner=ask(m,{t:T+6*31000});
 assert.equal(winner.side,'CALL');assert.equal(winner.reason,'validated-structure-over-cycle');
});
test('historically successful projection is not accidentally flipped',()=>{
 const m=new DirectionDisagreementEvidence();
 for(let i=0;i<6;i++){
  const t=T+i*31000;ask(m,{t});
  ask(m,{t:t+30000,spot:1.099,history:[{ts:t,price:1.1}],s:{ready:false},p:{ready:false}});
 }
 const result=ask(m,{t:T+6*31000});
 assert.equal(result.side,'PUT');assert.equal(result,projected);
});
test('mixed, unresolved and tied expiries do not confer statistical authority',()=>{
 const m=new DirectionDisagreementEvidence();
 for(let i=0;i<6;i++){
  const t=T+i*31000;ask(m,{t});
  ask(m,{t:t+30000,spot:i%2?1.099:1.101,history:[{ts:t,price:1.1}],s:{ready:false},p:{ready:false}});
 }
 assert.equal(ask(m,{t:T+6*31000}),projected);
 const n=new DirectionDisagreementEvidence();ask(n);
 ask(n,{t:T+30000,spot:1.1,s:{ready:false},p:{ready:false}});
 assert.equal(n.scored.length,0);
});
test('a different broker, asset or expiry has a separate model with no borrowed evidence',()=>{
 const m=new DirectionDisagreementEvidence();
 for(let i=0;i<6;i++){
  const t=T+i*31000;ask(m,{t});
  ask(m,{t:t+30000,spot:1.101,history:[{ts:t,price:1.1}],s:{ready:false},p:{ready:false}});
 }
 assert.equal(ask(m,{t:T+6*31000}).side,'CALL');
 assert.equal(ask(m,{t:T+7*31000,context:'exnova|EUR/USD OTC|30000'}),projected);
 assert.equal(m.scored.length,0);
});
test('a reversal is never forced when current structure is not ready or both forecasts agree',()=>{
 const m=new DirectionDisagreementEvidence();
 const agreement={...projected,side:'CALL'};
 assert.equal(ask(m,{p:agreement}),agreement);
 assert.equal(ask(m,{t:T+1000,s:{ready:false}}),projected);
});
