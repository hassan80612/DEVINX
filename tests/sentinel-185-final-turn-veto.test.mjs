import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewDirectionalPersistence,assessDirectionalPersistence} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const T=1800000000000;
function sample(mirror=false,durationMs=30000){
 const convert=p=>mirror?200-p:p;
 const knots=[[-25000,100],[-20000,100.05],[-12000,100.45],[-7000,100.82],[-4000,100.98],[-2800,101.04],[-2000,100.98],[-1500,100.88],[-1000,100.75],[-500,100.63],[0,100.53]];
 const price=at=>{let i=1;while(i<knots.length-1&&knots[i][0]<at)i++;
 const [x1,y1]=knots[i-1],[x2,y2]=knots[i];
 return convert(y1+(y2-y1)*(at-x1)/(x2-x1));};
 const quoteHistory=Array.from({length:101},(_,i)=>({ts:T-25000+i*250,price:price(-25000+i*250)}));
 return {quoteHistory,quoteAt:T,now:T,price:quoteHistory.at(-1).price,durationMs};
}
test('an observed turn vetoes a stale continuation even if mislabeled as a reversal',()=>{
 for(const mirror of [false,true])for(const durationMs of [30000,60000]){
  const m=sample(mirror,durationMs),state=assessDirectionalPersistence(m);
  assert.equal(state.side,mirror?'PUT':'CALL',JSON.stringify(state));
  assert.ok(['weakening','reversal-testing'].includes(state.phase),JSON.stringify(state));
  for(const reason of ['closed-structure-and-live-impulse','causal-expiry-analogue','locally-verified-opposite-direction','confirmed-level-structure-reversal']){
   const candidate={ready:true,side:state.side,reason,observedAt:m.quoteAt,entryPrice:m.price};
   const out=reviewDirectionalPersistence({...m,candidate});
   assert.equal(out.ready,false,JSON.stringify({reason,state,out}));
   assert.equal(out.side,null);
   assert.equal(out.reason,'live-turn-opposes-stale-direction');
  }
 }
});
test('new reversal direction remains eligible, without automatically inventing a signal',()=>{
 for(const mirror of [false,true])for(const durationMs of [30000,60000]){
  const m=sample(mirror,durationMs),old=assessDirectionalPersistence(m).side;
  const side=old==='CALL'?'PUT':'CALL';
  const candidate={ready:true,side,reason:'confirmed-level-structure-reversal',observedAt:m.quoteAt,entryPrice:m.price};
  const out=reviewDirectionalPersistence({...m,candidate});
  assert.equal(out.ready,true,JSON.stringify(out));assert.equal(out.side,side);
 }
});
test('unverified/empty tape and 5m do not change old admission policy',()=>{
 const candidate={ready:true,side:'CALL',reason:'closed-structure-and-live-impulse'};
 const m=sample(false);
 assert.equal(reviewDirectionalPersistence({...m,quoteHistory:[],candidate}).ready,true);
 assert.equal(reviewDirectionalPersistence({...m,durationMs:300000,candidate}),candidate);
});
