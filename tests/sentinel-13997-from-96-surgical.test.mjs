import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {applyHistoricalPriceStructure} from '../sentinel-trading-lab/agent/src/core/historical-price-structure.mjs';
const src=p=>readFileSync(new URL('../sentinel-trading-lab/'+p,import.meta.url),'utf8');

test('the existing broker order execution and three-level martingale are preserved',()=>{
 assert.equal(JSON.parse(src('agent/release.json')).version,'13.9.97');
 assert.match(src('agent/worker/signal-executor.mjs'),/MAX_MARTINGALE_LEVELS=3/);
 assert.match(src('agent/worker/broker-ui-executor.mjs'),/async execute\(provider,order\)/);
});
test('auxiliary 30-second candle does not override native 60-second candle selection',()=>{
 const d=new LocalPlaywrightDriver({dataDir:'period-test'}),st=d.state('exnova');
 st.activeId=76;st.symbol='EUR/USD OTC';st.uiSymbol=st.symbol;
 st.candleSize=60;st.subscribedSize=60;
 const now=Math.floor(Date.now()/1000)*1000;
 d.ingest('exnova',{name:'candle-generated',msg:{
  active_id:76,size:30,from:now-30000,to:now,
  open:1.1,high:1.101,low:1.099,close:1.1
 }},'page-in');
 assert.equal(st.candleSize,60);assert.equal(st.candles.length,0);
 d.ingest('exnova',{name:'get-candles',msg:{body:{active_id:76,size:30}},
  request_id:'native-chart-change'},'page-out');
 assert.equal(st.candleSize,30,'explicit native change still works');
});
test('16-bar tested resistance is considered without EMA warmup',()=>{
 const at=1800000000000,price=1.13048;
 const q=Array.from({length:13},(_,i)=>({ts:at-12000+i*1000,
  receivedAt:at-12000+i*1000,price:1.13012+i*.00003}));
 q.at(-1).price=price;
 const structure={candles:16,averages:[],atr:.00025,tolerance:.0001,
  zones:[{low:1.13047,high:1.13055,level:1.13051,touches:3,
  pivots:2,confirmedPivots:2,independentRejections:2,ages:[3,16]}]};
 const candidate={ready:true,side:'CALL',reason:'closed-structure-and-live-impulse',
  observedAt:at,entryPrice:price};
 const out=applyHistoricalPriceStructure({candidate,structure,quoteHistory:q,
  quoteAt:at,now:at,price});
 assert.equal(out.ready,false);assert.equal(out.side,null);
 assert.equal(out.reason,'historical-level-pressure-unconfirmed');
 assert.equal(out.priceStructure.nearestResistance.level,1.13051);
});
test('a weak harmonic forecast cannot automatically overrule the structural reading',()=>{
 const engine=src('agent/src/core/now-opportunity-engine.mjs');
 assert.match(engine,/forecastUsable&&original.ready/);
 assert.match(engine,/forecast\.fitResidual\*1\.15/);
 assert.match(engine,/forecastUsable&&decision.ready\?decision:null/);
});
test('mobile keeps strict entry gate and offers the existing 2m/5m worker durations',()=>{
 const card=src('src/components/LiveScenarioCard.tsx');
 assert.match(card,/vnext\?\[5,10,15,30,60,120,300\]/);
 assert.match(card,/className="vnextStrategyGuidance"/);
 assert.match(card,/const entryDataFresh=m\.fresh/);
 assert.match(card,/m\.quoteAge<=30/);
});
