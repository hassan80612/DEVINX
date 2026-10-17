import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CompletedExpiryDirection} from '../sentinel-trading-lab/agent/src/core/completed-expiry-direction.mjs';
import {thirtySecondCycleForecast} from '../sentinel-trading-lab/agent/src/core/thirty-second-expiry-direction.mjs';
import {analyzeNowOpportunity,advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const rows=JSON.parse(readFileSync(new URL('./fixtures/sentinel-user-video-broker-6dp-20261016.json',import.meta.url))).quoteHistory;
function recorded(seconds){
 const quoteAt=rows[0].ts+seconds*1000,quoteHistory=rows.filter(q=>q.ts<=quoteAt),q=quoteHistory.at(-1);
 assert.equal(q.ts,quoteAt);
 return {quoteHistory,quoteAt,now:quoteAt,price:q.price,durationMs:30000};
}
const args=recorded(83),baseline=thirtySecondCycleForecast(args);
const observe=(selector,base=baseline,overrides={})=>selector.observe({context:'recorded',...args,baseline:base,...overrides});
test('initial selection may use strongly better penalized fit on the same covered past data without waiting for outcomes',()=>{
 const selector=new CompletedExpiryDirection(),selected=observe(selector);
 assert.equal(baseline.side,'CALL');assert.equal(selected.side,'PUT');
 assert.equal(selected.reason,'bootstrap-expiry-penalized-fit');
 assert.ok(selected.fitSelectionCriterion+10<baseline.fitSelectionCriterion);
 assert.equal(selector.completed,0);
 assert.equal(selected.observedAt,args.quoteAt);assert.equal(selected.entryPrice,args.price);
 assert.equal(selector.pending[0].dueAt,args.quoteAt+30000);
 assert.equal(selector.pending[0].base,'CALL');assert.equal(selector.pending[0].wide,'PUT');
});
test('different samples, different horizons and absent fit evidence cannot authorize the bootstrap override',()=>{
 for(const base of [{...baseline,observedPoints:baseline.observedPoints+1},
  {...baseline,horizonMs:29000},{ready:true,side:'CALL',observedAt:args.quoteAt,entryPrice:args.price}]){
  assert.equal(observe(new CompletedExpiryDirection(),base),base);
 }
});
test('a fit at the maximum available cycle boundary does not replace an established direction before outcome evidence',()=>{
 const quoteAt=args.quoteAt,quoteHistory=Array.from({length:181},(_,i)=>({ts:quoteAt-(180-i)*1000,
  price:1.1+.0004*(2/Math.PI)*Math.asin(Math.sin((i-150)/43))}));
 const a={quoteHistory,quoteAt,now:quoteAt,price:quoteHistory.at(-1).price,durationMs:30000};
 const base=thirtySecondCycleForecast(a),wide=thirtySecondCycleForecast({...a,periodSearch:'wide'});
 assert.equal(base.side,'CALL');assert.equal(wide.side,'PUT');assert.equal(wide.fittedPeriodSeconds,180);
 assert.ok(wide.fitSelectionCriterion+10<base.fitSelectionCriterion);
 assert.equal(observe(new CompletedExpiryDirection(),base,a),base);
});
test('an unqualified admission and a mature contrary outcome record retain their original decision',()=>{
 const waiting={ready:false,side:null};assert.equal(observe(new CompletedExpiryDirection(),waiting),waiting);
 const mature=new CompletedExpiryDirection();mature.reset('recorded');mature.completed=5;mature.loss={base:0,wide:1};
 assert.equal(observe(mature),baseline);
});
test('unseen quotes and future receipt times cannot change initial selection',()=>{
 const selected=observe(new CompletedExpiryDirection());
 const future=[...args.quoteHistory,{ts:args.quoteAt+1000,price:3},
  {ts:args.quoteAt-500,receivedAt:args.now+1000,price:.1}];
 assert.deepEqual(observe(new CompletedExpiryDirection(),baseline,{quoteHistory:future}),selected);
});
test('initial fit selection is scale-invariant and mirrors direction under reciprocal prices',()=>{
 const original=observe(new CompletedExpiryDirection());
 for(const transform of [p=>p*1000,p=>1/p]){
  const quoteHistory=args.quoteHistory.map(q=>({...q,price:transform(q.price)}));
  const input={...args,quoteHistory,price:quoteHistory.at(-1).price};
  const base=thirtySecondCycleForecast(input),selected=observe(new CompletedExpiryDirection(),base,input);
  assert.equal(selected.reason,'bootstrap-expiry-penalized-fit');
  assert.equal(selected.side,transform(2)>transform(1)?original.side:original.side==='CALL'?'PUT':'CALL');
 }
});
test('bootstrap and observed turns still enter now for the full duration and cannot reverse a held call',()=>{
 const candidate=observe(new CompletedExpiryDirection());
 const first=advanceNowOpportunity({candidate,now:args.now,quoteAt:args.quoteAt,asset:'EUR',durationMs:30000});
 assert.equal(first.side,'PUT');assert.equal(first.entryAt,args.now);assert.equal(first.exitAt,args.now+30000);
 const next=advanceNowOpportunity({previous:first,candidate:{...candidate,side:'CALL',observedAt:args.now+500},
  now:args.now+500,quoteAt:args.quoteAt+500,asset:'EUR',durationMs:30000});
 assert.equal(next.side,'PUT');assert.equal(next.entryReadyNow,false);
});
