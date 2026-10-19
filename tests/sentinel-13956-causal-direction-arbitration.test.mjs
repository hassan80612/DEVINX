import test from 'node:test';
import assert from 'node:assert/strict';
import {CausalDirectionArbitration} from '../sentinel-trading-lab/agent/src/core/causal-direction-arbitration.mjs';
import {analyzeNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const T=1800000000000,ctx='iq_option|EUR/USD|30000';
const st={ready:true,side:'CALL',entryPrice:1.1,observedAt:T,reason:'structural'};
const cy={ready:true,side:'PUT',entryPrice:1.1,observedAt:T,reason:'cycle'};
const ask=(a,{t=T,price=1.1,context=ctx,structural=st,selected=cy,history=[],now=t}={})=>
 a.decide({context,quoteHistory:[...history,{ts:t,price,receivedAt:t}],quoteAt:t,
  price,now,structural,selected,projectionTargetAt:t+30000});

test('warm-up: opposite uncalibrated projections cannot override structure just from in-sample fit',()=>{
 const a=new CausalDirectionArbitration();
 const x=ask(a);
 assert.equal(x.ready,false);assert.equal(x.side,null);
 assert.equal(x.reason,'unverified-direction-conflict');
 assert.equal(a.pending.length,1);
});
test('agreement is unchanged, no extra veto, and existing entry timestamp survives',()=>{
 const a=new CausalDirectionArbitration(),same={...cy,side:'CALL'};
 assert.equal(ask(a,{selected:same}),same);
});
function teach(a,{winner='projection',n=6,context=ctx}={}){
 let last;
 for(let i=0;i<n;i++){
  const t=T+i*31000,price=1.1;
  const p=ask(a,{t,price,context});
  const settlePrice=winner==='projection'?1.099:1.101;
  const at=t+30000;
  ask(a,{t:at,price:settlePrice,context,
   history:[{ts:t,price,receivedAt:t}],
   structural:{ready:false,side:null},selected:{ready:false,side:null}});
  last=p;
 }
 return last;
}
test('6 causally COMPLETED independent conflict trials can authorize projection, no future labels',()=>{
 const a=new CausalDirectionArbitration();
 for(let i=0;i<5;i++){
  const t=T+i*31000;
  const before=ask(a,{t});
  assert.equal(before.ready,false,'cannot use sixth outcome before it expires');
  ask(a,{t:t+30000,price:1.099,structural:{ready:false},selected:{ready:false},history:[{ts:t,price:1.1}]});
 }
 const x=ask(a,{t:T+5*31000});
 assert.equal(x.ready,false,'only 5 completed outcomes cannot calibrate');
 ask(a,{t:T+5*31000+30000,price:1.099,structural:{ready:false},selected:{ready:false},
  history:[{ts:T+5*31000,price:1.1}]});
 const learned=ask(a,{t:T+6*31000});
 assert.equal(a.completedCount,6);
 assert.equal(learned.side,'PUT');
 assert.equal(learned.reason,'measured-expiry-cycle-advantage');
});
test('consistently correct structure wins when empirical completed conflicts favor it',()=>{
 const a=new CausalDirectionArbitration();
 teach(a,{winner:'structure'});
 const x=ask(a,{t:T+6*31000});
 assert.equal(x.side,'CALL');assert.equal(x.reason,'measured-structural-advantage');
});
test('mixed/noisy results abstain; stale label, tie and missing expiry cannot train the model',()=>{
 const a=new CausalDirectionArbitration();
 for(let i=0;i<6;i++){
  const t=T+i*31000;
  ask(a,{t});
  ask(a,{t:t+30000,price:i%2?1.099:1.101,structural:{ready:false},selected:{ready:false},
   history:[{ts:t,price:1.1}]});
 }
 assert.equal(ask(a,{t:T+6*31000}).ready,false);
 const b=new CausalDirectionArbitration();
 ask(b);ask(b,{t:T+30000,price:1.1,structural:{ready:false},selected:{ready:false}});
 assert.equal(b.completedCount,0);
});
test('asset/broker context change resets outcome comparisons and blocks learned cross-account model',()=>{
 const a=new CausalDirectionArbitration();
 teach(a,{winner:'projection'});
 assert.equal(ask(a,{t:T+6*31000}).side,'PUT');
 const result=ask(a,{t:T+7*31000,context:'exnova|EUR/USD|30000'});
 assert.equal(result.ready,false);assert.equal(a.completedCount,0);
});
test('only one independent 30s trial is admitted per 30s even on every 1s market tick',()=>{
 const a=new CausalDirectionArbitration();
 for(let i=0;i<30;i++)ask(a,{t:T+i*1000,price:1.1+i*.000001});
 assert.equal(a.pending.length,1);
});
test('stage4 is a no-op when the externally controlled selector is absent (legacy read-only integration)',()=>{
 const quotes=Array.from({length:181},(_,i)=>({ts:T-180000+i*1000,price:1.1*Math.exp(i*.000002),receivedAt:T-180000+i*1000}));
 const input={quoteHistory:quotes,now:T,quoteAt:T,price:quotes.at(-1).price,durationMs:30000,
  engineId:'automatic',qualityPolicy:'adaptive-market-v17'};
 const before=analyzeNowOpportunity(input);
 const after=analyzeNowOpportunity({...input,directionArbitration:null});
 assert.deepEqual(after,before);
});
