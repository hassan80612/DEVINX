import test from 'node:test';
import assert from 'node:assert/strict';
import {closedCandleDmi} from '../experiments/closed-candle-dmi-20261018.mjs';
import {centralMarketResearchRuntime} from '../experiments/central-market-research-runtime-20261018.mjs';
import {advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const candidate=await centralMarketResearchRuntime();test.after(()=>candidate.cleanup());
const T=Date.UTC(2026,9,18,16);
const candles=Array.from({length:100},(_,i)=>({from:(T-(100-i)*60000)/1000,to:(T-(99-i)*60000)/1000,
 receivedAt:T-(99-i)*60000,open:100+i*.1,close:100+i*.1+.05,high:100+i*.1+.1,low:100+i*.1-.05}));
test('Wilder trend strength and direction remain separate on a monotonic price path',()=>{
 const up=closedCandleDmi({candles,now:T});assert.equal(up.ready,true);assert.equal(up.regime,'trend');
 assert.equal(up.side,'CALL');assert.ok(Math.abs(up.adx-100)<1e-10);assert.equal(up.minusDi,0);
 const mirrored=candles.map(c=>({...c,open:220-c.open,close:220-c.close,high:220-c.low,low:220-c.high}));
 const down=closedCandleDmi({candles:mirrored,now:T});assert.equal(down.side,'PUT');assert.equal(down.adx,up.adx);
 assert.equal(down.plusDi,0);
});
test('flat candles do not manufacture a trend or probability',()=>{
 const rows=candles.map(c=>({...c,open:100,close:100,high:101,low:99}));
 const result=closedCandleDmi({candles:rows,now:T});assert.equal(result.regime,'range');assert.equal(result.side,null);assert.equal(result.adx,0);
});
test('ADX initialization agrees with a hand-calculated four-bar Wilder reference',()=>{
 const values=[[10,8,9],[11,9,10],[10,8,9],[12,9,11]];
 const rows=values.map(([high,low,close],i)=>({from:(T-(4-i)*60000)/1000,to:(T-(3-i)*60000)/1000,open:close,close,high,low}));
 const result=closedCandleDmi({candles:rows,now:T,period:2});
 // After one seeded delta, the two DX values are 100/3 and 700/11.
 assert.ok(Math.abs(result.adx-(100/3+700/11)/2)<1e-10);
 assert.ok(Math.abs(result.plusDi-50)<1e-10);
 assert.ok(Math.abs(result.minusDi-100/9)<1e-10);
});
test('forming, future, unreceived and differently sized candles cannot alter the current regime',()=>{
 const expected=closedCandleDmi({candles,now:T});
 const extras=[{...candles.at(-1),from:T/1000,to:T/1000+60,high:900,close:500},
  {...candles.at(-1),receivedAt:T+1,high:900,close:500},
  {...candles.at(-1),from:T/1000-300,to:T/1000,high:900,close:500}];
 assert.deepEqual(closedCandleDmi({candles:[...candles,...extras],now:T}),expected);
});
test('a candle gap prevents an old trend from masquerading as current continuous evidence',()=>{
 const rows=candles.filter((_,i)=>i!==90);
 assert.equal(closedCandleDmi({candles:rows,now:T}).ready,false);
 assert.equal(closedCandleDmi({candles:rows,now:T}).candles,9);
});
const regime={ready:true,regime:'trend',side:'CALL',adx:40,previousAdx:39};
const historical={ready:true,side:'PUT',reason:'historical-level-rejection',observedAt:T,entryPrice:100,
 priceStructure:{reaction:{kind:'rejection',side:'PUT'}}};
const args={decision:historical,historical,structure:{candleLevelMap:{observedCandles:100,asOf:T-60000,tolerance:.1,levels:[],windows:[]}},
 quoteHistory:[{ts:T,price:100}],price:100,quoteAt:T,now:T,durationMs:30000,regimeOverride:regime};
test('a brief countertrend rejection cannot decide against a strong rising trend alone',()=>{
 const result=candidate.resolveCentralMarketDecision(args);
 assert.equal(result.ready,false);assert.equal(result.side,null);
 assert.equal(result.reason,'countertrend-rejection-without-structure-change');
});
test('weakening, unknown and same-direction contexts retain existing admitted reactions immediately',()=>{
 for(const r of [{...regime,previousAdx:41},{...regime,ready:false,regime:'unknown'},
  {...regime,regime:'range',adx:15},{...regime,side:'PUT'}]){
  const result=candidate.resolveCentralMarketDecision({...args,regimeOverride:r});
  assert.equal(result.ready,true);assert.equal(result.side,'PUT');
 }
});
test('other analysis horizons retain the untouched historical/base result',()=>{
 for(const durationMs of [5000,10000,15000,60000])
  assert.equal(candidate.resolveCentralMarketDecision({...args,durationMs}),historical);
});
function walk(vertices){
 const prices=[vertices[0]];
 for(const end of vertices.slice(1)){const start=prices.at(-1),steps=Math.round(Math.abs(end-start)*10);
  for(let i=1;i<=steps;i++)prices.push(start+(end-start)*i/steps);}
 return prices.map((price,i)=>({ts:T-(prices.length-1-i)*1000,price}));
}
test('an actually reclaimed level and broken local swing outrank a lagging opposing trend',()=>{
 const q=walk([102,100.6,101.3,99.4,100.2,99.9,101.8]);
 const levels=[90,100,110].map(level=>({level,high:level,low:level,windows:[3,10,20,50,100],confirmedPivots:2,independentTests:3,
  tests:[{age:5},{age:10}],supportWick:.6,resistanceWick:.6}));
 const result=candidate.resolveCentralMarketDecision({...args,quoteHistory:q,price:q.at(-1).price,
  regimeOverride:{...regime,side:'PUT'},structure:{candleLevelMap:{observedCandles:100,asOf:T-60000,tolerance:.15,levels,windows:[]}}});
 assert.equal(result.ready,true);assert.equal(result.side,'CALL');assert.equal(result.reason,'failed-breakout-structure-change');
 const issued=advanceNowOpportunity({candidate:result,now:T,quoteAt:T,asset:'EUR',durationMs:30000});
 const held=advanceNowOpportunity({previous:issued,candidate:{...historical,observedAt:T+1000},now:T+1000,quoteAt:T+1000,asset:'EUR',durationMs:30000});
 assert.equal(held.side,'CALL');assert.equal(held.exitAt,T+30000);assert.equal(held.entryReadyNow,false);
});
