import test from 'node:test';
import assert from 'node:assert/strict';
import {closedCandleContext,retainClosedCandleHistory} from '../sentinel-trading-lab/agent/src/core/closed-candle-context.mjs';
import {closedCandleTrajectory} from '../sentinel-trading-lab/agent/src/core/closed-candle-trajectory.mjs';
import {contextualCandleTrajectory} from '../sentinel-trading-lab/agent/src/core/contextual-candle-trajectory.mjs';
const T=1800000000000;
const bar=(i,p=60)=>({from:T+i*p*1000,to:T+(i+1)*p*1000,
 receivedAt:T+(i+1)*p*1000,open:100+i,high:102+i,low:99+i,close:101+i});
test('uses the exact three closed bars; an enormous forming candle has no feature weight',()=>{
 const candles=[0,1,2,3].map(i=>bar(i));const opts={candles,asOf:T+200000,candleSeconds:60};
 const a=closedCandleContext(opts);
 const b=closedCandleContext({...opts,candles:[...candles.slice(0,3),{...candles[3],high:1e8,close:1e7}]});
 assert.deepEqual(a,b);assert.deepEqual(a.bars.map(c=>c.to-T),[60000,120000,180000]);
 assert.equal(a.x.length,25);
});
test('bodies, rejection wicks and high/low progression change the closed structure',()=>{
 const candles=[0,1,2].map(i=>bar(i));const opts={candles,asOf:T+200000,candleSeconds:60};
 const a=closedCandleContext(opts);
 const b=closedCandleContext({...opts,candles:[...candles.slice(0,2),{...candles[2],close:101,high:110,low:98}]});
 assert.notDeepEqual(a.x,b.x);
});
test('a bar becomes usable at its explicit end, with no trade-expiry assumption',()=>{
 for(const candleSeconds of [5,10,30,60,300]){
  const candles=[0,1,2].map(i=>bar(i,candleSeconds));
  assert.equal(closedCandleContext({candles,candleSeconds,asOf:candles[2].to-1}),null);
  assert.ok(closedCandleContext({candles,candleSeconds,asOf:candles[2].to,holdingSeconds:5}));
  assert.ok(closedCandleContext({candles,candleSeconds,asOf:candles[2].to,holdingSeconds:300}));
 }
});
test('gaps, incomplete trios, missing arrivals and delayed latest bars never masquerade as three current closed bars',()=>{
 const opts={asOf:T+200000,candleSeconds:60};
 for(const candles of [[bar(0),bar(2)],[bar(0),bar(1),bar(3)],
  [bar(0),bar(1),{...bar(2),receivedAt:T+220000}],
  [bar(0),bar(1),{...bar(2),receivedAt:undefined}],
  [bar(0),bar(1),{...bar(2),low:1000}]])assert.equal(closedCandleContext({...opts,candles}),null);
});
test('first closed observation is immutable; future backfills cannot rewrite the earlier context',()=>{
 const candles=[0,1,2].map(i=>bar(i));
 const first=retainClosedCandleHistory({candles,now:T+200000,asset:'EUR/USD',provider:'test',candleSeconds:60});
 const later=retainClosedCandleHistory({previous:first,candles:[{...bar(2),high:200}],now:T+201000,asset:'EUR/USD',provider:'test',candleSeconds:60});
 assert.deepEqual(first.candles,later.candles);
 assert.equal(closedCandleContext({candles:first.candles,asOf:T+190000,candleSeconds:60}),null);
 for(const change of [{asset:'GBP/USD'},{provider:'other'},{candleSeconds:30}]){
  const changed=retainClosedCandleHistory({previous:first,candles:[],now:T+201000,asset:'EUR/USD',provider:'test',candleSeconds:60,...change});
  assert.equal(changed.candles.length,0);
 }
});
function fixture(){
 const rows=Array.from({length:3601},(_,i)=>({ts:T+i*1000,price:Math.exp(4.6+.004*Math.sin(i/113)+.000001*i)}));
 const candles=[];
 for(let i=0;i<3600;i+=60){const prices=rows.slice(i,i+60).map(q=>q.price);
  candles.push({from:T+i*1000,to:T+(i+60)*1000,receivedAt:T+(i+60)*1000,
   open:prices[0],close:prices.at(-1),high:Math.max(...prices),low:Math.min(...prices)});}
 return {rows,candles};
}
test('forming price can anchor projection but cannot change learned direction, scale or relative trajectory',()=>{
 const {rows,candles}=fixture(),now=T+3520000;
 const options={candles,candleSeconds:60,asOf:now,entryDelaySeconds:30,holdingSeconds:60};
 const a=closedCandleTrajectory({...options,quoteHistory:rows});
 const b=closedCandleTrajectory({...options,quoteHistory:rows.map(q=>q.ts>T+3480000?{...q,price:q.price*50}:q)});
 assert.equal(a.status,'closed-candle-trajectory');assert.equal(b.status,a.status);
 assert.equal(a.side,b.side);assert.deepEqual(a.candleContext,b.candleContext);
 assert.equal(a.expectedPairedLogReturn,b.expectedPairedLogReturn);
 assert.ok(Math.abs(b.projectedExitPrice/a.projectedExitPrice-50)<1e-8);
 assert.ok(a.latestTrainingOutcomeAt<=a.candleContext.latestClosedAt);
 assert.equal(a.side,a.projectedExitPrice>a.projectedEntryPrice?'CALL':'PUT');
});
test('future ticks and bars cannot contaminate prediction at an earlier issue time',()=>{
 const {rows,candles}=fixture(),now=T+3500000;
 const options={candleSeconds:60,asOf:now,entryDelaySeconds:5,holdingSeconds:30};
 const a=closedCandleTrajectory({...options,quoteHistory:rows,candles});
 const b=closedCandleTrajectory({...options,quoteHistory:rows.filter(q=>q.ts<=now),candles:candles.filter(c=>c.to<=now)});
 assert.deepEqual(a,b);assert.equal(a.modelConfidence,null);assert.equal(a.actionable,false);
});
test('contextual strategy requires three closed bars and reads their wicks even with identical current quotes',()=>{
 const {rows,candles}=fixture(),now=T+3500000;
 const options={quoteHistory:rows,candles,candleSeconds:60,asOf:now,entryDelaySeconds:30,holdingSeconds:60};
 const a=contextualCandleTrajectory(options);
 assert.equal(a.status,'contextual-candle-trajectory');
 assert.equal(contextualCandleTrajectory({...options,candles:[]}).side,null);
 const latest=candles.filter(c=>c.to<=now).at(-1);
 const b=contextualCandleTrajectory({...options,candles:candles.map(c=>c.from===latest.from?{...c,high:c.high*1.05}:c)});
 assert.notDeepEqual(a.candleContext.x,b.candleContext.x);
 assert.notEqual(a.expectedPairedLogReturn,b.expectedPairedLogReturn);
 assert.equal(a.side,a.projectedExitPrice>a.projectedEntryPrice?'CALL':'PUT');
 const c=contextualCandleTrajectory({...options,quoteHistory:rows.filter(q=>q.ts<=now),candles:candles.filter(c=>c.to<=now)});
 assert.deepEqual(a,c);
 const d=contextualCandleTrajectory({...options,candles:candles.map(c=>c.to>now?{...c,high:1e12}:c)});
 assert.deepEqual(a,d);
});
