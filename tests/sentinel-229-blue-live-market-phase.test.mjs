import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {liveVisualPhase229} from '../sentinel-trading-lab/agent/src/core/live-visual-phase-229.mjs';
import {marketReading} from '../sentinel-trading-lab/agent/src/core/market-reading.mjs';
import {lightweightOverlayView} from '../sentinel-trading-lab/agent/worker/lightweight-overlay-view.mjs';
const at=1800000000000;
const quotes=prices=>prices.map((price,i)=>({ts:at-(prices.length-i-1)*2000,
 receivedAt:at-(prices.length-i-1)*2000,price}));
const render=(p,prices)=>{
 const t=quotes(prices),last=t.at(-1),phase=liveVisualPhase229({
  quoteHistory:t,quoteAt:at,now:at,price:last.price,durationMs:60000});
 return {phase,line:marketReading({phase:phase.phase,
  label:{'continuing':'CONTINUIDADE','weakening':'CONTINUIDADE PERDENDO FORÇA',
   'reversal-testing':'REVERSÃO EM TESTE','range':'LATERAL',
   'mixed':'INCONCLUSIVO'}[phase.phase]||'OBSERVANDO',
  trendSide:phase.legSide,candidate:phase.turnSide?
   {ready:false,reason:'awaiting-confirmation',provisionalSide:phase.turnSide}:
   {ready:false,reason:'awaiting-confirmation'}})};
};
test('229: trend upward while strict broker entry not yet allowed still says CONTINUIDADE CALL',()=>{
 const r=render(null,[1.1000,1.1001,1.1002,1.1003,1.1004,1.1005,
  1.1006,1.1007,1.1008,1.1009,1.1010,1.1012,1.1014]);
 assert.equal(r.phase.phase,'continuing',JSON.stringify(r.phase));
 assert.equal(r.line,'CONTINUIDADE · CALL');
});
test('229: real downward continuation labels PUT',()=>{
 const r=render(null,[1.105,1.1049,1.1048,1.1047,1.1046,1.1045,
  1.1044,1.1043,1.1042,1.1041,1.104,1.1039,1.1038]);
 assert.equal(r.line,'CONTINUIDADE · PUT');
});
test('229: observed actual downward return near an upward leg is REVERSÃO EM TESTE PUT',()=>{
 const r=render(null,[1.1,1.1001,1.1002,1.1003,1.1004,1.1005,
  1.1006,1.1007,1.1008,1.1009,1.1008,1.1006,1.1004]);
 assert.equal(r.phase.phase,'reversal-testing',JSON.stringify(r.phase));
 assert.equal(r.line,'REVERSÃO EM TESTE · PUT');
});
test('229: observed actual upward return near a downward leg is REVERSÃO EM TESTE CALL',()=>{
 const r=render(null,[1.1010,1.1009,1.1008,1.1007,1.1006,1.1005,
  1.1004,1.1003,1.1002,1.1001,1.1002,1.1004,1.1006]);
 assert.equal(r.phase.phase,'reversal-testing',JSON.stringify(r.phase));
 assert.equal(r.line,'REVERSÃO EM TESTE · CALL');
});
test('229: insufficient quotes cannot invent a CALL/PUT; cannot use future quote',()=>{
 const short=quotes([1.1,1.1005,1.101]);
 assert.equal(liveVisualPhase229({quoteHistory:short,quoteAt:at,now:at,price:1.101}).ready,false);
 const input=quotes([1.1,1.1001,1.1002,1.1003,1.1004,1.1005,1.1006,
  1.1007,1.1008,1.1009,1.101,1.1011,1.1012]);
 const normal=liveVisualPhase229({quoteHistory:input,quoteAt:at,now:at,price:1.1012});
 const altered=liveVisualPhase229({quoteHistory:[...input,
  {ts:at+200,receivedAt:at+200,price:2}],
  quoteAt:at,now:at,price:1.1012});
 assert.deepEqual(altered,normal);
 assert.equal(liveVisualPhase229({quoteHistory:input,quoteAt:at,now:at+3500,price:1.1012}).ready,false);
});
test('229: blue market-phase line stays visible even when entry is not active',()=>{
 const driver=readFileSync(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
 assert.match(driver,/nowMode&&runtime==='running'&&observation\?\.marketReading/);
 assert.match(driver,/phaseValue\.textContent=observerRunning&&observation\?\.marketReading/);
 assert.doesNotMatch(driver,/phaseValue\.textContent=active\?/);
 assert.doesNotMatch(driver,/nowMode&&entryPlanActive\?esc\(tr\(observation\?\.marketReading/);
 const runtime=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/runtime.mjs',import.meta.url),'utf8');
 const overlay=readFileSync(new URL('../sentinel-trading-lab/agent/worker/lightweight-overlay-view.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(runtime,/liveVisualPhase229|presentLiveMarketReadout229/,'trading runtime must stay byte-identical');
 assert.match(overlay,/presentLiveMarketReadout229/,'overlay alone may interpret short history');
});

test('229: before 14s trading history is ready, valid real ticks appear in BLUE as provisional CALL while runtime stays WAIT',()=>{
 const end=Date.now();
 const prices=[1.1000,1.1001,1.1002,1.1004,1.1006,1.1008];
 const ticks=prices.map((price,i)=>({ts:end-(prices.length-i-1)*1000,
  receivedAt:end-(prices.length-i-1)*1000,price}));
 const original={
  asset:'EUR/USD OTC',action:'WAIT',analysis:{asset:'EUR/USD OTC',side:'WAIT',
   confidence:0,reasons:['Aguardando candles atuais do mesmo ativo da tela.']}
 };
 const runtime={stateName:'running',settings:{mode:'real',engine:'automatic',orderDurationMs:60000},
  lastResult:original,lastEvalMs:0,nextEvalMs:0,
  externalMarket:{provider:'exnova',symbol:'EUR/USD OTC',validatedSymbol:'EUR/USD OTC',
   assetValidated:true,quoteFeedValidated:true,lastQuoteAt:end,quote:prices.at(-1),quoteHistory:ticks}};
 const snapshot=lightweightOverlayView(runtime);
 assert.equal(snapshot.lastResult.analysis.vnext.nowObservation.marketReading,'CONTINUIDADE · CALL');
 assert.equal(snapshot.lastResult.analysis.vnext.nowObservation.visualOnly,true);
 assert.equal(snapshot.lastResult.analysis.vnext.nowObservation.ready,undefined);
 assert.strictEqual(runtime.lastResult,original,'motor WAIT stays untouched');
 assert.equal(original.analysis.vnext,undefined,'no new real broker signal is synthesized');
});
test('229: if live asset is not validated, visual supplement cannot fabricate direction',()=>{
 const end=Date.now(),tick=Array.from({length:7},(_,i)=>({ts:end-(6-i)*1000,
  receivedAt:end-(6-i)*1000,price:1.1+i*.0001}));
 const original={asset:'EUR/USD OTC',analysis:{asset:'EUR/USD OTC',side:'WAIT'}};
 const runtime={stateName:'running',settings:{engine:'automatic',orderDurationMs:60000},
  lastResult:original,externalMarket:{provider:'exnova',quote:tick.at(-1).price,
   lastQuoteAt:end,quoteHistory:tick,quoteFeedValidated:true,assetValidated:false,
   validatedSymbol:'EUR/USD OTC'}};
 assert.strictEqual(lightweightOverlayView(runtime).lastResult,original);
 runtime.externalMarket.assetValidated=true;
 runtime.externalMarket.validatedSymbol='GBP/USD OTC';
 assert.strictEqual(lightweightOverlayView(runtime).lastResult,original);
});
test('233: native expiry and real analyzer runtime stay separate from mobile blue presentation',()=>{
 const files=['agent/src/core/runtime.mjs','agent/worker/broker-native-expiry-keeper.mjs'];
 const root=new URL('../sentinel-trading-lab/',import.meta.url);
 for(const file of files){
  const s=readFileSync(new URL(file,root),'utf8');
  assert.doesNotMatch(s,/import \{liveVisualPhase229\}|presentLiveMarketReadout229/,file);
 }
});
