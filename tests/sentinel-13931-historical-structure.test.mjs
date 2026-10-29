import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {historicalPriceStructure,applyHistoricalPriceStructure,HistoricalPriceStructureCache} from '../sentinel-trading-lab/agent/src/core/historical-price-structure.mjs';
import {analyzeNowOpportunity,advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {analystSnapshot,fitAnalystFrame} from '../sentinel-trading-lab/agent/worker/live-bridge.mjs';
import {liveCardModel} from '../sentinel-trading-lab/src/lib/live-card-model.ts';
import {pcAuthoritativeWindow} from '../sentinel-trading-lab/src/lib/pc-authoritative-window.mjs';
import vm from 'node:vm';
const T=1792190000000;
const candles=(age=50)=>Array.from({length:100},(_,i)=>({from:T-(100-i)*60000,to:T-(99-i)*60000,
 open:1.1009,close:1.1009,high:1.1014,low:i===99-age?1.1:1.1006}));
const quotes=prices=>prices.map((price,i)=>({ts:T-(prices.length-1-i)*1000,receivedAt:T-(prices.length-1-i)*1000,price}));
const reject=quotes([1.10030,1.10023,1.10014,1.10003,1.10000,1.10002,1.10008]);
const breaking=quotes([1.10025,1.10014,1.10002,1.09990,1.09985,1.09979,1.09973]);
const mirror=rows=>rows.map(x=>({...x,price:2.2-x.price}));
const mirrorBars=rows=>rows.map(c=>({...c,open:2.2-c.open,close:2.2-c.close,high:2.2-c.low,low:2.2-c.high}));
function assess(rows,bars=candles(),candidate={ready:true,side:'PUT'}){
 return applyHistoricalPriceStructure({candidate,structure:historicalPriceStructure({candles:bars,now:T}),quoteHistory:rows,quoteAt:T,price:rows.at(-1).price,now:T});
}
test('maps all 100 closed candles, retaining levels 10, 50 and 99 bars ago',()=>{
 for(const age of [10,50,99]){
  const p=historicalPriceStructure({candles:candles(age),now:T});
  assert.equal(p.candles,100);assert.deepEqual(p.averages.map(x=>x.period),[20,50,100]);
  assert.ok(p.zones.some(x=>x.level===1.1&&x.ages.includes(age)));
 }
});
test('a historical support rejection is CALL and resistance rejection is PUT',()=>{
 for(const age of [10,50]){
  const a=assess(reject,candles(age));assert.equal(a.side,'CALL');assert.equal(a.reason,'historical-level-rejection');
  assert.equal(a.priceStructure.reaction.zone.oldestBarsAgo,age);
  const b=assess(mirror(reject),mirrorBars(candles(age)),{ready:true,side:'CALL'});
  assert.equal(b.side,'PUT');assert.equal(b.reason,'historical-level-rejection');
 }
});
test('a sustained break through support stays PUT and through resistance stays CALL',()=>{
 const a=assess(breaking);assert.equal(a.side,'PUT');assert.equal(a.reason,'historical-level-breakout');
 const b=assess(mirror(breaking),mirrorBars(candles()),{ready:true,side:'PUT'});
 assert.equal(b.side,'CALL');assert.equal(b.reason,'historical-level-breakout');
});
test('a level touch without an observed reaction never fabricates a reversal',()=>{
 const rows=quotes([1.10030,1.10025,1.10020,1.10015,1.10010,1.10005,1.1]);
 const a=assess(rows);assert.notEqual(a.reason,'historical-level-rejection');assert.notEqual(a.side,'CALL');
});
test('sparse historical context and a contradictory expiry forecast cannot blindly flip the signal',()=>{
 const thin=assess(reject,candles().slice(47,52));
 assert.equal(thin.side,'PUT');assert.equal(thin.ready,true);
 const conflict=assess(reject,candles(),{ready:true,side:'PUT',pendingForecast:{ready:true,side:'PUT'}});
 assert.equal(conflict.ready,false);assert.equal(conflict.reason,'historical-level-versus-expiry-conflict');
});
test('unseen or forming candles and stale quotes cannot authorize an entry',()=>{
 const p=historicalPriceStructure({candles:candles(),now:T});
 const fake={from:T-60000,to:T+60000,open:1.1,close:1.1,high:5,low:.1};
 assert.deepEqual(historicalPriceStructure({candles:[...candles(),fake],now:T}),p);
 const candidate={side:null,ready:false,reason:'stale-live-quote'};
 assert.equal(applyHistoricalPriceStructure({candidate,structure:p,quoteHistory:reject,quoteAt:T,price:reject.at(-1).price,now:T+3000}),candidate);
});
test('candle correction and asset changes invalidate cached levels',()=>{
 const cache=new HistoricalPriceStructureCache(),a=cache.get({candles:candles(),now:T,context:'exnova|EUR'});
 assert.equal(cache.get({candles:candles(),now:T+100,context:'exnova|EUR'}),a);
 const changed=candles();changed[49].low=1.099;
 const b=cache.get({candles:changed,now:T,context:'exnova|EUR'});assert.notEqual(b,a);
 assert.notEqual(cache.get({candles:changed,now:T,context:'exnova|GBP'}),b);
});
test('historical rejection releases on the current quote without four newly closed blocks',()=>{
 const args={quoteHistory:reject,candles:candles(),price:reject.at(-1).price,quoteAt:T,now:T,durationMs:30000,engineId:'automatic',qualityPolicy:'adaptive-market-v17'};
 const a=analyzeNowOpportunity(args);assert.equal(a.ready,true);assert.equal(a.side,'CALL');assert.equal(a.observedAt,T);
 const support=analyzeNowOpportunity({...args,engineId:'support_resistance'});
 assert.equal(support.side,'CALL','the selected S/R specialist uses the observed rejection');
 assert.equal(support.signalOwner,'shared-market-base');
 for(const engineId of ['trend','fibonacci_retest','smart_confluence']){
  const other=analyzeNowOpportunity({...args,engineId});
  assert.equal(other.ready,true,'shared base keeps its independently confirmed S/R entry');
  assert.equal(other.side,'CALL');
  assert.equal(other.observedAt,T,'the base never waits for extra bars');
  assert.equal(other.signalOwner,'shared-market-base');
 }
 const fired=advanceNowOpportunity({candidate:a,now:T,quoteAt:T,asset:'EUR',engineId:'automatic',durationMs:30000});
 assert.equal(fired.entryTriggeredAt,T);assert.equal(fired.exitAt,T+30000);
 const held=advanceNowOpportunity({previous:fired,candidate:{...a,side:'PUT',observedAt:T+1000},now:T+1000,quoteAt:T+1000,asset:'EUR',engineId:'automatic',durationMs:30000});
 assert.equal(held.side,'CALL');assert.equal(held.exitAt,fired.exitAt);assert.equal(held.entryReadyNow,false);
});
test('saved broker synchronization is retired and no longer affects admission or deadlines',()=>{
 const r=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
 r.restore({settings:{clockMode:'broker',engine:'automatic',orderDurationMs:30000}});
 assert.equal(r.settings.clockMode,undefined);r.patchSettings({clockMode:'broker'});assert.equal(r.settings.clockMode,undefined);
 const v=r._signalValidationGate({analysis:{},snap:{provider:'exnova',candles:candles(),quoteHistory:reject,price:reject.at(-1).price,quoteTs:T},settings:r.settings,now:T}).analysis.vnext;
 assert.equal(v.futureEntryAnchor.side,'CALL');assert.equal(v.futureEntryAnchor.exitAt,T+30000);
 const frame=analystSnapshot({state:'running',settings:r.settings,lastEvalMs:T,lastResult:{asset:r.settings.asset,analysis:{vnext:v}}},{symbol:r.settings.asset,validatedSymbol:r.settings.asset,assetValidated:true,lastQuoteAt:T,quote:reject.at(-1).price});
 frame.lastResult.analysis.vnext.cards=[{id:'x'.repeat(5000)}];
 const fitted=fitAnalystFrame(frame),model=liveCardModel(fitted,T+100),entry=model.vnextFutureEntryAnchor;
 assert.equal(entry.exitAt,T+30000);
 const state={windowStartedAt:model.vnextOpportunityWindow.windowStartedAt,windowEndsAt:entry.exitAt,phase:entry.phase,side:entry.side,entryTriggeredAt:entry.entryTriggeredAt,quoteAt:T};
 assert.equal(pcAuthoritativeWindow({...state,now:T+100}).enterNow,true);
 assert.equal(pcAuthoritativeWindow({...state,now:T+2000}).enterNow,false);
 assert.equal(pcAuthoritativeWindow({...state,now:T+30000}).active,false);
});
test('retired clock sources, selectors and obsolete zero expiry price are removed',()=>{
 for(const path of ['agent/worker/broker-clock-view.mjs','agent/worker/broker-timing-readonly.mjs','agent/src/core/broker-entry-boundary.mjs','agent/src/core/broker-buy-window-1378.mjs','agent/src/core/broker-fixed-expiry-1376.mjs'])assert.equal(existsSync(new URL('../sentinel-trading-lab/'+path,import.meta.url)),false);
 const read=path=>readFileSync(new URL('../sentinel-trading-lab/'+path,import.meta.url),'utf8');
 assert.doesNotMatch(read('src/components/LiveScenarioCard.tsx'),/brokerClockView|clock-mode-selector|changeClock|brokerTiming/);
 assert.doesNotMatch(read('agent/worker/local-playwright-driver.mjs'),/brokerClockView|data-sentinel-clock-mode|readBrokerTiming|PREÇO AO VENCER/);
});
test('actual runtime can issue a historical reaction with 14 seconds of fresh quotes and received history',async()=>{
 const r=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
 r.stateName='running';r.settings.asset='EUR/USD';r.settings.engine='automatic';
 const q=quotes([...Array(8).fill(reject[0].price),...reject.map(x=>x.price)]);
 r.setExternalMarket({provider:'exnova',symbol:'EUR/USD',validatedSymbol:'EUR/USD',quote:q.at(-1).price,
  quoteTs:T,lastQuoteAt:T,quoteHistory:q,candles:candles(),quoteFeedValidated:true,analysisFeedValidated:true,assetValidated:true});
 await r.tick(T,{skipStatus:true});
 const signal=r.lastResult.analysis.vnext.futureEntryAnchor;
 assert.equal(signal.side,'CALL');assert.equal(signal.entryTriggeredAt,T);assert.equal(signal.exitAt,T+30000);
 assert.equal(r.lastResult.order,undefined);
});
test('the actual PC timer cannot keep ENTRY NOW after its short indication or restart an expired signal',()=>{
 const source=readFileSync(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
 const begin=source.indexOf('const tickTargetClock=()=>{'),end=source.indexOf('el.__sentinelTargetClockTick=',begin);
 assert.ok(begin>0&&end>begin);
 let now=T+100;const value={textContent:'',style:{}},decision={textContent:''},status={textContent:''},phaseText={textContent:'',style:{}};
 const attrs={'data-deadline':T+30000,'data-issued':T,'data-triggered-at':T,'data-entry-ready':'1',
  'data-live-quote':'1','data-mode':'now','data-side':'CALL','data-window-phase':'fired'};
 const action={querySelector:q=>q==='[data-sentinel-decision-label]'?decision:null},pane={getAttribute:k=>String(attrs[k]??''),
  closest:()=>({querySelector:q=>q==='[data-sentinel-market-phase]'?phaseText:action}),querySelector:q=>q==='[data-sentinel-vnext-clock-value]'?value:status};
 const context={el:{querySelector:()=>pane},tr:s=>s,Date:{now:()=>now},window:{__sentinelLastOverlayData:{vnext:{mode:'now'}}}};
 vm.createContext(context);vm.runInContext(source.slice(begin,end)+'globalThis.tick=tickTargetClock;',context);
 context.tick();assert.match(decision.textContent,/ENTRADA AGORA/);assert.equal(value.textContent,'00:30');
 now=T+2000;context.tick();assert.match(decision.textContent,/OPERAÇÃO EM ANDAMENTO/);assert.equal(value.textContent,'00:28');
 now=T+30000;context.tick();assert.doesNotMatch(decision.textContent,/ENTRADA AGORA/);assert.equal(value.textContent,'—:—');
});
