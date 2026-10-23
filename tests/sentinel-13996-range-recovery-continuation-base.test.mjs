import test from 'node:test';
import assert from 'node:assert/strict';
import {assessRangeRecoveryContinuation,completedRangeStructure} from
 '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';

const T=1700000000000;
function scenario({direction=1,position=.5,holdingMs=30000,recovery=false}={}){
 const lower=Math.log(.999),upper=Math.log(1.001),span=upper-lower;
 const spot=Math.exp(lower+span*position);
 const quotes=Array.from({length:22},(_,i)=>{
  const age=21-i;
  let offset=-direction*.000029*age;
  if(recovery&&age>9)offset=-direction*.000029*9+direction*.00004*(age-9);
  return {ts:T-age*1000,receivedAt:T-age*1000,price:spot+offset};
 });
 const closes=quotes.filter((x,i)=>i%5===1).slice(-4).map(q=>({
  at:q.ts,log:Math.log(q.price)
 }));
 return {quotes,closes,pivots:[
  {type:direction>0?'HIGH':'LOW',at:T-65000},
  {type:direction>0?'LOW':'HIGH',at:T-14000}
 ],now:T,spot,noise:.00015,lower,upper,half:50,holdingMs,regular:true};
}
const decide=opts=>assessRangeRecoveryContinuation(scenario(opts));

test('shared base recognizes range continuation on both sides',()=>{
 const call=decide({direction:1,position:.51});
 assert.equal(call?.side,'CALL');
 assert.equal(call?.phase,'continuation');
 const put=decide({direction:-1,position:.49});
 assert.equal(put?.side,'PUT');
 assert.equal(put?.phase,'continuation');
});
test('shared base distinguishes recovery from an established lateral leg',()=>{
 const call=decide({direction:1,position:.36,recovery:true});
 assert.equal(call?.side,'CALL');
 assert.equal(call?.phase,'recovery');
});
test('does not chase the top with CALL or bottom with PUT',()=>{
 assert.equal(decide({direction:1,position:.81}),null);
 assert.equal(decide({direction:-1,position:.19}),null);
});
test('expiration must fit the observed remaining half-swing',()=>{
 assert.equal(decide({direction:1,holdingMs:60000}),null);
 assert.equal(decide({direction:-1,holdingMs:120000}),null);
 assert.equal(decide({direction:1,holdingMs:300000}),null);
});
test('never creates a lateral signal from unconfirmed range',()=>{
 assert.equal(assessRangeRecoveryContinuation({...scenario(),regular:false}),null);
});
test('opposing recent flow is not accepted as continuation',()=>{
 const input=scenario({direction:1,position:.51});
 const opposing=scenario({direction:-1,position:.51});
 assert.equal(assessRangeRecoveryContinuation({...input,quotes:opposing.quotes}),null);
});
test('future or late-arriving ticks are excluded from all decisions',()=>{
 const original=scenario({direction:1});
 const expected=assessRangeRecoveryContinuation(original);
 const injected=[...original.quotes,
  {ts:T+1000,receivedAt:T+1000,price:.50},
  {ts:T-1000,receivedAt:T+1000,price:2.0}
 ];
 assert.deepEqual(assessRangeRecoveryContinuation({...original,quotes:injected}),expected);
});
test('no special strategy, additional timer or broker operation in range classifier',()=>{
 const src=assessRangeRecoveryContinuation.toString();
 assert.doesNotMatch(src,/page\.click|playwright|fetch\(|setTimeout\(|setInterval\(|await\b/);
 assert.doesNotMatch(src,/engineId|automatic|strategy===/);
 assert.equal(typeof completedRangeStructure,'function');
});
