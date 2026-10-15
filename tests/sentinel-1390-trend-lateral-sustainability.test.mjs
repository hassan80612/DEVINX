import test from 'node:test';
import assert from 'node:assert/strict';
import {completedStreakStage} from '../sentinel-trading-lab/agent/src/core/completed-streak-stage.mjs';
import {causalForwardPath} from '../sentinel-trading-lab/agent/src/core/causal-closed-structure-1379.mjs';
import {planEntryWindow} from '../sentinel-trading-lab/agent/src/core/entry-window-planner.mjs';
import {evolveOpportunity} from '../sentinel-trading-lab/agent/src/core/single-opportunity-window.mjs';
import {readFileSync} from 'node:fs';

const T=1800000000000;
const candle=(start,open,close,wick=0)=>({from:start/1000,to:(start+30000)/1000,
 open,close,high:Math.max(open,close)+wick,low:Math.min(open,close)-wick});
const cleanFour=(sign=1)=>Array.from({length:4},(_,i)=>{
 const open=sign>0?1.100+i*.001:1.100-i*.001,close=open+sign*.001;
 return candle(T+i*30000,open,close);
});

test('four uninterrupted up/down candles are NOT a trend veto',()=>{
 for(const sign of [1,-1]){
  const bars=cleanFour(sign);
  const x=completedStreakStage({candles:bars,quotePrice:bars.at(-1).close,
   asOf:T+120000,sigma:.00001});
  assert.equal(x.side,sign>0?'CALL':'PUT');
  assert.equal(x.extended,true);
  assert.ok(x.lateRisk<=.15,JSON.stringify(x));
 }
});

test('exhaustion near fourth candle top/bottom has greater timing risk',()=>{
 for(const sign of [1,-1]){
  const bars=cleanFour(sign);
  const mature=bars.map(x=>({...x}));
  mature[3]={...mature[3],
   close:mature[3].open+sign*.00012,
   high:sign>0?mature[3].open+.0014:mature[3].open,
   low:sign<0?mature[3].open-.0014:mature[3].open};
  const p=mature[3].close-sign*.00055;
  const x=completedStreakStage({candles:mature,quotePrice:p,
   asOf:T+120000,sigma:.00001});
  assert.equal(x.side,sign>0?'CALL':'PUT');
  assert.ok(x.lateRisk>.28,JSON.stringify(x));
 }
});

test('no fabricated completed streak from two bars or from another chart horizon',()=>{
 assert.equal(completedStreakStage({candles:cleanFour().slice(-2),quotePrice:1.1,
  asOf:T+120000,sigma:.00001}).side,null);
 const broken=cleanFour();broken[2]={...broken[2],from:broken[2].from+10};
 assert.equal(completedStreakStage({candles:broken,quotePrice:1.104,
  asOf:T+120000,sigma:.00001}).side,null);
});

test('persistent completed structure forecasts still make CALL/PUT progress',()=>{
 for(const sign of [1,-1]){
  const quotes=[];let price=1.125;
  for(let i=0;i<630;i++){price+=sign*.000007+Math.sin(i/3)*.0000004;
   quotes.push({ts:T+i*1000,receivedAt:T+i*1000,price});}
  const model=causalForwardPath({quoteHistory:quotes,asOf:T+629000,
   holdingSeconds:60,maxSeconds:120});
  assert.equal(model.status,'causal-forward-path');
  assert.equal(model.trendContinuation,true,JSON.stringify(model));
  assert.ok(sign*(model.priceAt(120)-model.priceAt(60))>0);
 }
});

test('late-entry preference is not a filter against genuine strong trends',()=>{
 const candidate=(h,strength=1)=>({
  side:'CALL',projectedEntryPrice:1.1,projectedExitPrice:1.11,
  selectionStrength:strength});
 const choices=seconds=>candidate(seconds,1);
 const early=planEntryWindow({windowSeconds:30,lateEntryRisk:1,evaluateLead:choices});
 assert.equal(early.side,'CALL');
 assert.equal(early.entryOffsetSeconds,1);
 const strongLate=planEntryWindow({windowSeconds:30,lateEntryRisk:1,
  evaluateLead:seconds=>candidate(seconds,seconds>=22?2:1)});
 assert.ok(strongLate.entryOffsetSeconds>=22);
});

test('next 30s cycle accepts the first fresh qualified new forecast',()=>{
 const settings={engine:'automatic',asset:'TEST',forecastMode:'continuous',orderDurationMs:30000};
 const candidate=(now)=>({engineId:'automatic',asset:'TEST',side:'CALL',
  issuedAt:now,entryAt:now+1000,exitAt:now+31000,
  projectedEntryPrice:1.1,projectedExitPrice:1.11});
 const initial=evolveOpportunity({settings,now:T,quoteAt:T,candidate:candidate(T)});
 assert.equal(initial.phase,'open');
 const next=evolveOpportunity({settings,previous:initial,now:T+30000,
  quoteAt:T+30000,candidate:candidate(T+30000)});
 assert.equal(next.phase,'open');
 assert.equal(next.windowStartedAt,T+30000);
});

test('historical-fit cost is bounded, without touching the broker clock or mobile relay',()=>{
 const model=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/causal-closed-structure-1379.mjs',import.meta.url),'utf8');
 const driver=readFileSync(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
 assert.match(model,/earliest=t-105000/);
 assert.match(driver,/if\(status\?\.healthy&&status\.ready&&status\.authenticated\)return existing/);
 assert.match(driver,/payload\.brokerTiming=this\.liveStatus\(provider\)\.brokerTiming/);
});
