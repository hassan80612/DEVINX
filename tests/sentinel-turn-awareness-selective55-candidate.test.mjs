import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {oppositeTurnPressure} from '../sentinel-trading-lab/agent/src/core/turn-pressure.mjs';
import {validateSelectiveHistory} from '../sentinel-trading-lab/agent/src/core/selective-autonomous.mjs';
import {evolveOpportunity} from '../sentinel-trading-lab/agent/src/core/single-opportunity-window.mjs';
const now=1900000000000,settings={asset:'TEST',engine:'automatic',forecastMode:'selective',orderDurationMs:30000};
const sample=fn=>Array.from({length:31},(_,i)=>({ts:now-(30-i)*1000,price:Math.exp(fn(i))}));
for(const side of ['CALL','PUT']){
 const dir=side==='CALL'?1:-1;
 test(side+': sustained trend does not get blocked',()=>{
   const r=oppositeTurnPressure({quoteHistory:sample(i=>dir*i*.001),now,quoteTs:now,side});
   assert.equal(r.blocked,false);
 });
 test(side+': opposite turn is recognized on actual received quotes',()=>{
   const r=oppositeTurnPressure({quoteHistory:sample(i=>dir*(i<=24?i*.001:24*.001-(i-24)*.003)),now,quoteTs:now,side});
   assert.equal(r.blocked,true);
   assert.equal(r.phase,'counterpressure-confirmed');
 });
 test(side+': shallow pullback is not treated as reversal',()=>{
   const r=oppositeTurnPressure({quoteHistory:sample(i=>dir*(i<=24?i*.001:24*.001-(i-24)*.0002)),now,quoteTs:now,side});
   assert.equal(r.blocked,false);
 });
 test(side+': future-arriving ticks cannot prove a turn',()=>{
   const rows=sample(i=>dir*(i<=24?i*.001:24*.001-(i-24)*.003))
     .map((q,i)=>({...q,receivedAt:i>27?now+3000:q.ts}));
   const r=oppositeTurnPressure({quoteHistory:rows,now,quoteTs:now,side});
   assert.equal(r.blocked,false);
 });
}
const candidate=(start,side='CALL')=>({side,issuedAt:start,entryAt:start+5000,
  exitAt:start+35000,projectedEntryPrice:1.1,
  projectedExitPrice:side==='CALL'?1.11:1.09,delaySeconds:30,holdingSeconds:30});
test('a missed confirmation does not flip or restart the original opportunity window',()=>{
 const start=now-8000;let w=evolveOpportunity({settings,now:start,quoteAt:start,candidate:candidate(start)});
 assert.equal(w.phase,'open');
 const end=w.windowEndsAt;
 w=evolveOpportunity({settings,previous:w,now:start+7000,quoteAt:start+7000,confirmation:null});
 assert.equal(w.phase,'open');assert.equal(w.entryReadyNow,false);
 assert.equal(w.side,'CALL');assert.equal(w.windowEndsAt,end);
 const later=evolveOpportunity({settings,previous:w,now:start+8000,quoteAt:start+8000,
   candidate:candidate(start+8000,'PUT'),confirmation:null});
 assert.equal(later.phase,'open');assert.equal(later.windowEndsAt,end);
 assert.equal(later.side,'CALL');
});
test('on-time confirmation still triggers exactly once',()=>{
 const start=now-8000;let w=evolveOpportunity({settings,now:start,quoteAt:start,candidate:candidate(start)});
 w=evolveOpportunity({settings,previous:w,now:start+5350,quoteAt:start+5300,
   confirmation:{side:'CALL',projectedEntryPrice:1.1,projectedExitPrice:1.11}});
 assert.equal(w.phase,'fired');assert.equal(w.entryTriggeredAt,start+5350);
 const duplicate=evolveOpportunity({settings,previous:w,now:start+5800,quoteAt:start+5800,
   confirmation:{side:'CALL',projectedEntryPrice:1.1,projectedExitPrice:1.11}});
 assert.equal(duplicate.phase,'fired');assert.equal(duplicate.entryReadyNow,false);
});
test('the two modes use the same counterturn check and Seletiva validates at 55 percent',()=>{
 const f=fs.readFileSync('sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs','utf8');
 const s=fs.readFileSync('sentinel-trading-lab/agent/src/core/selective-autonomous.mjs','utf8');
 assert.match(f,/oppositeTurnPressure/);
 assert.match(f,/if\(inSelective\)/);
 assert.match(f,/function continuousWindow/);
 assert.match(f,/if\(settings.forecastMode==='selective'\)/);
 assert.match(s,/validateSelectiveHistory\(\{tested,hits\}\)/);
});

test('55 percent means >=4 genuine validations, never a zero-sample pass',()=>{
 for(const [tested,hits,valid] of [
   [0,0,false],[1,1,false],[3,3,false],[4,2,false],
   [4,3,true],[5,3,true],[5,2,false],[6,3,false],
   [7,4,true],[10,5,false],[10,6,true]]){
   assert.equal(validateSelectiveHistory({tested,hits}),valid,`n=${tested}, hits=${hits}`);
 }
});
