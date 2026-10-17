import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {coherentInterval} from
 '../sentinel-trading-lab/agent/src/core/forward-direction-quality.mjs';
import {causalForwardPath} from
 '../sentinel-trading-lab/agent/src/core/causal-interval-forecast-1371.mjs';
const T=Date.parse('2026-10-14T14:36:28-03:00');
const read=path=>readFileSync(new URL('../sentinel-trading-lab/'+path,import.meta.url),'utf8');
const settings={asset:'EUR/USD',engine:'automatic',clockMode:'broker',orderDurationMs:60000,forecastMode:'continuous'};
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
