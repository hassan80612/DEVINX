import test from 'node:test';
import assert from 'node:assert/strict';
import {assessCandleLevelRoute,applyCandleLevelRoute} from '../sentinel-trading-lab/agent/src/core/candle-level-map.mjs';
import {setup,T} from './fixtures/executor-13946.mjs';
import {executorPanel} from '../sentinel-trading-lab/agent/worker/executor-panel.mjs';
import {MAX_MARTINGALE_LEVELS,maxSignalAgeMs} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';

const quoteHistory=[1.00030,1.00030,1.00030,1.00030,1.00030,1.00030,
 1.00030,1.00052,1.00058,1.00059,1.00059,1.00056,1.00055].map((price,i)=>({
 ts:T-12000+i*1000,receivedAt:T-12000+i*1000,price
}));
const zone=(level,backed)=>({low:level,high:level,level,
 confirmedPivots:backed?1:0,independentRejections:2,independentTests:2,
 supportWick:0,resistanceWick:.65,tests:[{age:0},{age:6}],windows:[10,20]});
const mapOf=levels=>({observedCandles:70,asOf:T-60000,tolerance:.00003,
 windows:[{size:10,observed:10,available:true,levels:[]}],levels});

test('stage5: a confirmed recent PUT rejection is NOT shadowed by closer UNCONFIRMED resistance',()=>{
 const map=mapOf([zone(1.00055,false),zone(1.00058,true)]);
 const args={map,quoteHistory,quoteAt:T,now:T,price:1.00055,side:'CALL'};
 const found=assessCandleLevelRoute(args);
 assert.equal(found.event.side,'PUT');
 assert.equal(found.event.candleBacked,true);
 assert.equal(found.event.zone.level,1.00058);
 const candidate={ready:true,side:'CALL',entryPrice:1.00055,observedAt:T,
  reason:'observed-trend-and-30s-cycle-projection',
  pendingForecast:{ready:true,side:'CALL',predictedPrice:1.00068}};
 const actual=applyCandleLevelRoute({...args,durationMs:30000,candidate});
 assert.equal(actual.side,'PUT');
 assert.equal(actual.ready,true);
 assert.equal(actual.reason,'multiscale-candle-rejection');
 assert.equal(actual.priceStructure.candleRoute.discardedProjection.side,'CALL');
});
test('stage5: an unconfirmed historical touch alone cannot reverse a live qualified CALL',()=>{
 const map=mapOf([zone(1.00055,false)]);
 const candidate={ready:true,side:'CALL',entryPrice:1.00055,observedAt:T,
  reason:'qualified',pendingForecast:{ready:true,side:'CALL'}};
 const actual=applyCandleLevelRoute({map,quoteHistory,quoteAt:T,now:T,
  price:1.00055,durationMs:30000,candidate});
 assert.equal(actual.side,'CALL');
 assert.equal(actual.reason,'qualified');
});
test('stage5: keep 60-second behavior unchanged',()=>{
 const map=mapOf([zone(1.00058,true)]);
 const candidate={ready:true,side:'CALL'};
 assert.equal(applyCandleLevelRoute({map,quoteHistory,quoteAt:T,
  now:T,price:1.00055,durationMs:60000,candidate}),candidate);
});
function settleAll(x,pnl){
 const batch=x.bot.pending;
 assert.ok(batch);
 x.advance(60000);
 for(const order of [...batch.orders])assert.ok(x.bot.settle({
  provider:x.c.provider,orderId:order.orderId,netPnl:pnl,source:'broker'}));
}
for(const provider of ['iq_option','exnova']){
 test(provider+': hard cap is exactly THREE Martingale increments, complete loss cycle 1→2→4→8→1 without stopping',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;
  assert.equal(MAX_MARTINGALE_LEVELS,3);
  assert.throws(()=>x.bot.configure({martingaleLevels:4}));
  assert.throws(()=>x.bot.configure({martingaleLevels:10}));
  x.bot.configure({martingaleEnabled:true,martingaleLevels:3});
  await x.bot.start();
  for(const n of [1,2,4,8]){
   const previous=x.calls.length;
   await x.fire('PUT');assert.equal(x.calls.length-previous,n);
   assert.equal(x.bot.pending.clickCount,n);
   settleAll(x,-1);
   assert.equal(x.bot.enabled,true,'limit reached alone must NEVER stop bot');
  }
  assert.equal(x.bot.martingaleLevel,0);
  assert.equal(x.bot.nextClicks(),1);
  const previous=x.calls.length;
  await x.fire('CALL');assert.equal(x.calls.length-previous,1);
  assert.equal(x.bot.enabled,true);
 });
}
test('dashboard enforces max3 and progression up to 8 in every supported language',()=>{
 for(const language of ['pt','en','es','fr','ar']){
  const html=executorPanel({config:{amount:1,martingaleEnabled:true,martingaleLevels:3},nextClicks:8},language);
  assert.match(html,/data-sentinel-executor-setting="martingaleLevels"[^>]*max="3"/);
  assert.match(html,/1 .* → 2 .* → 4 .* → 8 /);
  assert.doesNotMatch(html,/→ 16 /);
 }
});
test('short, thirty and minute expiry each has a distinct stale-click budget',()=>{
 assert.equal(maxSignalAgeMs(10000),500);
 assert.equal(maxSignalAgeMs(30000),900);
 assert.equal(maxSignalAgeMs(60000),1500);
});
