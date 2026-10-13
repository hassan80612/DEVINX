import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateSelectiveHistory,autonomousSelectiveEntry} from '../sentinel-trading-lab/agent/src/core/selective-autonomous.mjs';
import {futureEntrySchedule,confirmWindowEntry} from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';
const source=fs.readFileSync('sentinel-trading-lab/agent/src/core/selective-autonomous.mjs','utf8');
const schedule=fs.readFileSync('sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs','utf8');
test('50 percent accepts exactly half, needs 4 outcomes and does not invent data',()=>{
 for(const [n,hits,expected] of [[0,0,false],[1,1,false],[3,3,false],[4,0,false],[4,1,false],[4,2,true],[4,3,true],[5,2,false],[5,3,true],[6,3,true],[10,5,true],[10,4,false]])
   assert.equal(validateSelectiveHistory({tested:n,hits}),expected,n+'/'+hits);
});
test('selective chronological validation starts with 28 complete historical patterns',()=>{
 assert.match(source,/if\(historic\.length>=28\)\{/);
 assert.doesNotMatch(source,/historic\.length>=35/);
 assert.match(source,/if\(past\.length<12\)continue/);
 assert.match(source,/const accepted=support&&robust&&specific&&validated/);
 assert.match(source,/minExamples=4,minRate=\.50/);
 assert.match(schedule,/const reliability=p\.validationExamples>=4\?/);
});
test('a quote received in the future never changes a forecast; stale quotes never trigger',()=>{
 const now=1800000003500;
 const quotes=Array.from({length:1601},(_,i)=>({
  ts:now-(1600-i)*1000,price:1.1+.0015*Math.sin((i+4)*2*Math.PI/104)+
   .00025*Math.sin((i+4)*2*Math.PI/(104*.43))
 }));
 const common={quoteHistory:quotes,now,quoteTs:now,delaySeconds:30,holdingSeconds:30,asset:'TEST'};
 const expected=autonomousSelectiveEntry(common);
 const future=autonomousSelectiveEntry({...common,quoteHistory:[...quotes,
  {ts:now+500,price:1000,receivedAt:now+500}]});
 assert.deepEqual(future,expected);
 const stale=autonomousSelectiveEntry({...common,now:now+3000});
 assert.equal(stale.side,null);
 assert.equal(stale.status,'waiting-fresh-quote');
});
test('selective preview retains fixed window and one-side confirmation without changing continuous mode',()=>{
 assert.match(schedule,/if\(inSelective\)/);
 assert.match(schedule,/function continuousWindow/);
 assert.match(schedule,/oppositeTurnPressure/);
 assert.match(schedule,/forecastMode==='selective'/);
});
