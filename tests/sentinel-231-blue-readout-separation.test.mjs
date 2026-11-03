import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {presentLiveMarketReadout229} from '../sentinel-trading-lab/agent/worker/live-market-readout-229.mjs';
import {lightweightOverlayView} from '../sentinel-trading-lab/agent/worker/lightweight-overlay-view.mjs';
const at=1800000000000;
const ticks=(prices,delta=1000)=>prices.map((price,i)=>({ts:at-(prices.length-i-1)*delta,
 receivedAt:at-(prices.length-i-1)*delta,price}));
const broker=(prices,symbol='EUR/GBP (OTC)')=>({
 quoteFeedValidated:true,assetValidated:true,validatedSymbol:symbol,
 quote:prices.at(-1),lastQuoteAt:at,quoteHistory:ticks(prices)
});
const present=(previous,prices,extra={})=>presentLiveMarketReadout229({
 view:{state:'running',settings:{engine:'automatic',orderDurationMs:60000},
  liveBroker:{...broker(prices),...extra}},
 analysis:{vnext:{mode:'now',nowObservation:{ready:false,marketReading:previous,
  observedAt:at-3000,quoteAt:at-3000,evaluatedAt:at-3000}}},
 now:at,asset:'EURGBP-OTC'
});
test('231: previous OBSERVANDO never freezes blue CONTINUIDADE CALL from latest real tick',()=>{
 const p=[1.1000,1.1001,1.1002,1.1003,1.1004,1.1005,1.1006,1.1007,
  1.1008,1.1009,1.1010,1.1011,1.1012];
 const r=present('OBSERVANDO O PREÇO ATUAL',p);
 assert.equal(r.nowObservation.marketReading,'CONTINUIDADE · CALL');
 assert.equal(r.nowObservation.visualOnly,true);
});
test('231: last provisional CONTINUIDADE CALL does not freeze observed REVERSÃO EM TESTE PUT',()=>{
 const p=[1.1,1.1001,1.1002,1.1003,1.1004,1.1005,1.1006,1.1007,
  1.1008,1.1009,1.1008,1.1006,1.1004];
 const r=present('CONTINUIDADE · CALL',p);
 assert.equal(r.nowObservation.marketReading,'REVERSÃO EM TESTE · PUT');
});
test('231: a genuine confirmed analyst CALL retains priority over a provisional blue PUT',()=>{
 const p=[1.1009,1.1008,1.1007,1.1006,1.1005,1.1004,1.1003];
 const old={mode:'now',nowObservation:{ready:true,side:'CALL',marketReading:'REVERSÃO CONFIRMADA · CALL'}};
 const res=presentLiveMarketReadout229({view:{state:'running',settings:{engine:'automatic',
  orderDurationMs:60000},liveBroker:broker(p)},analysis:{vnext:old},now:at,asset:'EURGBP-OTC'});
 assert.strictEqual(res,old);
});
test('231: an unvalidated quote or another pair never fabricates direction',()=>{
 const p=[1.1000,1.1001,1.1002,1.1003,1.1004,1.1005,1.1006];
 assert.equal(present('OBSERVANDO',p,{assetValidated:false}).nowObservation.marketReading,'OBSERVANDO');
 assert.equal(present('OBSERVANDO',p,{validatedSymbol:'EUR/USD OTC'}).nowObservation.marketReading,'OBSERVANDO');
 assert.equal(present('OBSERVANDO',p,{lastQuoteAt:at-5000}).nowObservation.marketReading,'OBSERVANDO');
});
test('231: main header no longer mirrors blue phase, with both rerender paths covered',()=>{
 const driver=readFileSync(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
 assert.equal((driver.match(/const scanningLabel=\(observation\?\.ready===true/g)||[]).length,2);
 assert.equal((driver.match(/'OBSERVANDO PREÇO ATUAL'\);/g)||[]).length,2);
 assert.doesNotMatch(driver,/const scanningLabel=observation\?\.marketReading\|\|/);
 assert.match(driver,/phaseValue\.textContent=observerRunning&&observation\?\.marketReading/);
});
test('231: overlay observation is read-only, leaves market runtime, order and selected expiry untouched',()=>{
 const p=[1.10,1.1001,1.1002,1.1003,1.1004,1.1005,1.1006];
 const original={asset:'EURGBP-OTC',analysis:{asset:'EURGBP-OTC',vnext:{
  nowObservation:{ready:false,marketReading:'OBSERVANDO PREÇO ATUAL'}}}};
 const runtime={stateName:'running',settings:{engine:'automatic',mode:'real',orderDurationMs:60000},
  lastResult:original,externalMarket:broker(p)};
 const view=lightweightOverlayView(runtime);
 assert.notStrictEqual(view.lastResult,original);
 assert.strictEqual(runtime.lastResult,original);
 assert.equal(runtime.settings.orderDurationMs,60000);
 assert.equal(view.lastResult.analysis.vnext.nowObservation.marketReading,'CONTINUIDADE · CALL');
});
