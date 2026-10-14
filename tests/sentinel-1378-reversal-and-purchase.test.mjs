import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {observedBuyWindow,brokerAllowsEntry} from
 '../sentinel-trading-lab/agent/src/core/broker-buy-window-1378.mjs';
import {readBrokerTimingFromText} from
 '../sentinel-trading-lab/agent/worker/broker-timing-readonly.mjs';
import {coherentInterval} from
 '../sentinel-trading-lab/agent/src/core/forward-direction-quality.mjs';
import {causalForwardPath} from
 '../sentinel-trading-lab/agent/src/core/causal-interval-forecast-1371.mjs';
const T=Date.parse('2026-10-14T14:36:28-03:00');
const read=path=>readFileSync(new URL('../sentinel-trading-lab/'+path,import.meta.url),'utf8');
const settings={asset:'EUR/USD',engine:'automatic',clockMode:'broker',orderDurationMs:60000,forecastMode:'continuous'};
const observation={...readBrokerTimingFromText(
 'HORA ATUAL: 14 OUTUBRO, 14:36:28\nTEMPO PARA COMPRA\n00:27\nEXPIRAÇÃO\n14:37',
 {nowMs:T,instrumentKind:'digital'}),symbol:'EUR/USD'};
test('broker buy cutoff only exists when user selects synced clock and REAL observed time',()=>{
 const snap={brokerTiming:observation};
 const synced=observedBuyWindow({settings,snap,now:T});
 assert.equal(synced.checked,true,JSON.stringify(synced));
 assert.equal(synced.closesAt,T+27000);
 assert.equal(brokerAllowsEntry({buyWindow:synced,entryAt:T+12000}),true);
 assert.equal(brokerAllowsEntry({buyWindow:synced,entryAt:T+27000}),false);
 assert.equal(brokerAllowsEntry({buyWindow:synced,entryAt:T+29000}),false);
 assert.equal(observedBuyWindow({settings:{...settings,clockMode:'current'},snap,now:T}).checked,false);
 assert.equal(brokerAllowsEntry({buyWindow:observedBuyWindow({
  settings:{...settings,clockMode:'current'},snap,now:T
 }),entryAt:T+29000}),true,'free clock is never constrained by synced broker cutoff');
 assert.equal(observedBuyWindow({settings,snap,now:T+6500}).checked,false,
 'stale UI clock must not be pretended fresh');
 assert.equal(observedBuyWindow({settings,snap:{brokerTiming:{...observation,
  symbol:'EUR/USD OTC'}},now:T}).checked,false);
});
test('no guessed 30s wait or purchase lock when broker only shows expiry',()=>{
 const snap={brokerTiming:{...observation,purchaseWindow:{
  raw:null,remainingMs:null,closesAt:null}}};
 const w=observedBuyWindow({settings,snap,now:T});
 assert.equal(w.checked,false);
 assert.equal(brokerAllowsEntry({buyWindow:w,entryAt:T+500}),true);
 const source=read('agent/src/core/future-entry-schedule.mjs');
 assert.match(source,/brokerAllowsEntry\(\{buyWindow,entryAt:now\+seconds\*1000\}\)/);
 assert.match(source,/brokerAllowsEntry\(\{buyWindow,entryAt:now\}\)/);
 assert.doesNotMatch(source,/brokerAllowsEntry\(\{buyWindow,entryAt:now\+30000\}\)/);
});
test('screenshot-sized marginal PUT is not a qualified interval inside ordinary quote noise',()=>{
 const entry=1.11372,exit=1.11370;
 const move=Math.abs(Math.log(exit/entry));
 const normalNoise=move/.24;
 assert.equal(coherentInterval({entryPrice:entry,exitPrice:exit,noise:normalNoise,
   noiseFraction:.35}).qualified,false);
 const strong=coherentInterval({entryPrice:entry,exitPrice:entry-.00016,
  noise:normalNoise,noiseFraction:.35});
 assert.equal(strong.qualified,true,'do not reject sufficiently large qualified movement');
 const source=read('agent/src/core/future-entry-schedule.mjs');
 assert.match(source,/noiseFraction:\.35/g);
});
function quotes(kind='up'){
 const out=[],start=T-600000;
 for(let i=0;i<=600;i++){
  const price=1.1133+i*.000001+
   Math.sin(i/10)*.000002 +
   (kind==='one-pullback'&&i===600?-.000017:0);
  out.push({ts:start+i*1000,receivedAt:start+i*1000,price});
 }
 return out;
}
test('predictor keeps a persistent multi-quote upward leg, not an opposite tiny move',()=>{
 const up=causalForwardPath({quoteHistory:quotes(),asOf:T,holdingSeconds:60,maxSeconds:120});
 assert.equal(up.status,'causal-forward-path');
 const p30=up.priceAt(30),p90=up.priceAt(90);
 assert.ok(p90>p30,JSON.stringify({p30,p90}));
 const pullback=causalForwardPath({quoteHistory:quotes('one-pullback'),
   asOf:T,holdingSeconds:60,maxSeconds:120});
 assert.equal(pullback.status,'causal-forward-path');
 assert.ok(Number.isFinite(pullback.priceAt(90)));
});
test('broker synchronization is saved in Agent without resetting visual choice',()=>{
 const source=read('agent/worker/local-playwright-driver.mjs');
 const worker=read('agent/worker/index.mjs');
 assert.match(source,/window\.__sentinelClockDisplayMode=next/);
 assert.match(source,/void sendAction\(\{action:'setting',key:'clockMode',value:next\}\)/);
 assert.match(source,/window\.__sentinelLastClockModeSync!==selectedClock/);
 assert.match(worker,/runtime\.patchSettings\(\{clockMode:String\(value\)\},'overlay'\)/);
 const runtime=read('agent/src/core/runtime.mjs');
 assert.match(runtime,/clockMode:'current'/);
});
