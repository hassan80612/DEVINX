import test from 'node:test';
import assert from 'node:assert/strict';
import {independentExpiryRuntime} from '../experiments/independent-expiry-samples-20261018.mjs';
const candidate=await independentExpiryRuntime(),T=1800000000000;
const input=(t,context='market',extra={})=>{
 const quoteHistory=Array.from({length:201},(_,i)=>({ts:T+i*1000,receivedAt:T+i*1000,price:1.1+Math.sin(i/13)*.0001+i*.0000001}));
 return{context,quoteHistory,quoteAt:T+t*1000,now:T+t*1000,price:quoteHistory[t].price,baseline:{ready:true,side:'CALL',observedPoints:Math.min(t+1,181),horizonMs:30000,fitSelectionCriterion:0},...extra};
};
test('trial outcomes do not overlap, and current entries need no training wait',()=>{
 const selector=new candidate.CompletedExpiryDirection();
 for(let t=70;t<=160;t+=5)assert.equal(selector.observe(input(t)).ready,true);
 assert.deepEqual(selector.researchTrials.map(p=>(p.at-T)/1000),[70,100,130,160]);
 for(let i=1;i<selector.researchTrials.length;i++)assert.ok(selector.researchTrials[i].at>=selector.researchTrials[i-1].dueAt);
});
test('the explicit expiry, including the analyst lead, defines trial spacing',()=>{
 const selector=new candidate.CompletedExpiryDirection();
 for(let t=70;t<=105;t+=5)selector.observe(input(t,'market',{projectionTargetAt:T+(t<105?103:133)*1000}));
 assert.deepEqual(selector.researchTrials.map(p=>(p.at-T)/1000),[70,105]);
});
test('future prices cannot affect current choices or matured scoring',()=>{
 const a=new candidate.CompletedExpiryDirection(),b=new candidate.CompletedExpiryDirection();
 for(let t=70;t<=140;t+=5){const x=input(t),y=structuredClone(x);for(const q of y.quoteHistory)if(q.ts>y.now)q.price*=100;assert.deepEqual(a.observe(x),b.observe(y));assert.deepEqual(a.loss,b.loss);}
});
test('a different broker or asset clears the trial learning context',()=>{
 const selector=new candidate.CompletedExpiryDirection();selector.observe(input(70,'iq|EURUSD'));selector.observe(input(100,'iq|EURUSD'));selector.observe(input(105,'exnova|EURUSD'));
 assert.equal(selector.completed,0);assert.equal(selector.researchTrials.length,1);assert.equal(selector.researchTrials[0].at,T+105000);
});
test.after(()=>candidate.cleanup());
