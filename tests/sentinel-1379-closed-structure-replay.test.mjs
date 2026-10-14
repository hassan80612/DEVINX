import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {causalForwardPath as oldModel} from './fixtures/sentinel-1378-causal-baseline.mjs';
import {causalForwardPath as newModel} from '../sentinel-trading-lab/agent/src/core/causal-closed-structure-1379.mjs';
import {singleEngineForecast} from '../sentinel-trading-lab/agent/src/core/vnext-single-engine.mjs';
import {confirmWindowEntry} from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';

const T=1800000000000;
const sgn=x=>x>0?'CALL':x<0?'PUT':null;
function quoteSeries(kind='up',end=780){
 const rows=[];let p=1.114;
 for(let i=0;i<end;i++){
  let rate=['down','down-last-spike'].includes(kind)?-.000007:.000007;
  if(kind==='bear-to-bull')rate=i<595?-.000007:.000026;
  if(kind==='bull-to-bear')rate=i<595?.000007:-.000026;
  if(kind==='range')rate=.000002*Math.cos(i/23);
  p+=rate+Math.sin(i/5)*.0000003;
  if(i===625&&kind==='up-last-spike')p-=.00045;
  if(i===625&&kind==='down-last-spike')p+=.00045;
  rows.push({ts:T+i*1000,receivedAt:T+i*1000,price:p});
 }
 return rows;
}
const horizon=60,issue=T+629000;
const logWindow=m=>Math.log(m.priceAt(120)/m.priceAt(60));
test('13.7.9: last UNFINISHED candle cannot flip structural direction or historical analogue selection',()=>{
 for(const kind of ['up','down','bear-to-bull','bull-to-bear']){
  const rows=quoteSeries(kind,630),flat=newModel({quoteHistory:rows,asOf:issue,holdingSeconds:60,maxSeconds:120});
  assert.equal(flat.status,'causal-forward-path',kind+': '+flat.status);
  const mutated=rows.map(x=>({...x}));
  // Significant last-8s counter-move that is NOT a closed market block.
  for(let j=622;j<630;j++)mutated[j].price-=kind==='down'||kind==='bull-to-bear'?-.00012:.00012;
  const tick=newModel({quoteHistory:mutated,asOf:issue,holdingSeconds:60,maxSeconds:120});
  assert.equal(tick.status,'causal-forward-path',kind);
  assert.equal(flat.regime,tick.regime,kind);
  assert.ok(Math.abs(logWindow(flat)-logWindow(tick))<1e-9,
   'forming candle altered underlying forecast '+kind);
  const prior=oldModel({quoteHistory:rows,asOf:issue,holdingSeconds:60,maxSeconds:120});
  const changed=oldModel({quoteHistory:mutated,asOf:issue,holdingSeconds:60,maxSeconds:120});
  assert.equal(prior.status,'causal-forward-path');
  assert.equal(changed.status,'causal-forward-path');
 }
});
test('13.7.9: completed structures distinguish persistent trend from confirmed reversal',()=>{
 const expected={up:'CALL',down:'PUT','bear-to-bull':'CALL','bull-to-bear':'PUT'};
 for(const [kind,side] of Object.entries(expected)){
  const forecast=newModel({quoteHistory:quoteSeries(kind,630),asOf:issue,
    holdingSeconds:60,maxSeconds:120});
  const direction=sgn(logWindow(forecast));
  assert.equal(direction,side,JSON.stringify({kind,status:forecast.status,p60:forecast.priceAt(60),p120:forecast.priceAt(120),regime:forecast.regime,direction,expected:side}));
 }
});
test('13.7.9: same SELECTED model computes display, future entry and due-time confirmation',()=>{
 const q=quoteSeries('bear-to-bull',630),snap={provider:'exnova',
  quoteHistory:q,quoteTs:issue,price:q.at(-1).price};
 const settings={asset:'EUR/USD',engine:'automatic',forecastMode:'continuous',
  orderDurationMs:60000,clockMode:'current'};
 const m=singleEngineForecast({settings,snap,now:issue,
  forecastModel:'causal-closed-structure-1379',adaptiveHistory:q});
 assert.equal(m.modelVersion,'causal-closed-structure-1379');
 const confirmation=confirmWindowEntry({settings,snap,now:issue,adaptiveHistory:q,
  forecastModel:'causal-closed-structure-1379',entryAt:issue});
 const expected=newModel({quoteHistory:q,asOf:issue,holdingSeconds:60,maxSeconds:120});
 assert.equal(confirmation.projectedEntryPrice,expected.priceAt(0));
 assert.equal(confirmation.projectedExitPrice,expected.priceAt(60));
});
test('13.7.9: structurally tested causality ignores future/backfilled market prints',()=>{
 const qs=quoteSeries('up',630);
 const orig=newModel({quoteHistory:qs,asOf:issue,holdingSeconds:60,maxSeconds:120});
 const spoiled=[...qs,{ts:issue+1000,price:.5,receivedAt:issue+1000},
   {ts:issue-22000,price:.5,receivedAt:issue+20000}];
 const after=newModel({quoteHistory:spoiled,asOf:issue,holdingSeconds:60,maxSeconds:120});
 assert.equal(orig.priceAt(60),after.priceAt(60));
 assert.equal(orig.priceAt(120),after.priceAt(120));
});
test('13.7.9 matched-data synthetic holdout: compare directions and missed/out-of-sample outcomes',()=>{
 const rows=[];
 const expectedReal=['up','down','bear-to-bull','bull-to-bear','range','up-last-spike','down-last-spike'];
 for(const kind of expectedReal){
  const all=quoteSeries(kind,790),history=all.filter(q=>q.ts<=issue);
  const future=all.find(q=>q.ts===issue+60000);
  const current=history.at(-1).price;
  for(const [name,fit] of [['13.7.8',oldModel],['13.7.9',newModel]]){
   const model=fit({quoteHistory:history,asOf:issue,holdingSeconds:60,maxSeconds:120});
   const entry=model.priceAt(0),pred=model.priceAt(60);
   const predicted=entry&&pred?sgn(pred-entry):null;
   const actual=sgn(future.price-current);
   rows.push({kind,model:name,predicted,actual,
    correct:predicted===actual,absoluteForecastError:Math.abs((pred||current)-future.price),
    regime:model.regime||null});
  }
 }
 console.log('[matched-synthetic-replay] '+JSON.stringify(rows));
 const prior=rows.filter(x=>x.model==='13.7.8'),next=rows.filter(x=>x.model==='13.7.9');
 assert.equal(prior.length,next.length);
 const oldCorrect=prior.filter(x=>x.correct).length,newCorrect=next.filter(x=>x.correct).length;
 assert.ok(newCorrect>=oldCorrect,JSON.stringify({oldCorrect,newCorrect,rows}));
 assert.ok(next.filter(x=>x.predicted!==null).length>=5,
   'completed-structure model should not become inert on strong trends');
 // Synthetic exercise is an architecture/regression benchmark, NOT evidence
 // of live broker accuracy or a claimed win rate.
 const src=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/causal-closed-structure-1379.mjs',import.meta.url),'utf8');
 assert.match(src,/last quoted instant of the FORMING bar/i);
});
