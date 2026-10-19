import test from 'node:test';
import assert from 'node:assert/strict';
import {thirtySecondCycleForecast} from '../sentinel-trading-lab/agent/src/core/thirty-second-expiry-direction.mjs';
import {observedNoise} from '../sentinel-trading-lab/agent/src/core/forward-direction-quality.mjs';
const T=1800000000000;
const quotes=(wave,spacing=1000)=>Array.from({length:181},(_,i)=>{
 const ts=T-180000+i*spacing;return{ts,receivedAt:ts,price:1.12*Math.exp(wave(i))};
});
const fx=(rows,more={})=>thirtySecondCycleForecast({
 quoteHistory:rows,quoteAt:rows.at(-1).ts,price:rows.at(-1).price,
 now:rows.at(-1).ts,durationMs:30000,...more});
test('all released 30-second harmonic directions are greater than the established market-noise fraction',()=>{
 const waves=[
  i=>.000012*i,
  i=>.0002*Math.sin(i*2*Math.PI/34),
  i=>.00007*Math.sin(i*2*Math.PI/13)+i*.0000008,
  i=>.00018*Math.sin(i*2*Math.PI/90)+.00006*Math.sin(i*2*Math.PI/9),
  i=>.00004*Math.sin(i*2*Math.PI/2)+.00002*Math.sin(i*2*Math.PI/30)
 ];
 for(const wave of waves){
  const history=quotes(wave);
  for(const periodSearch of ['baseline','wide']){
   const result=fx(history,{periodSearch});
   if(!result.ready){assert.match(result.reason,/noise|cycle|variation/);continue;}
   assert.ok(result.expectedSignalToNoise>=.15-1e-8);
   const noise=observedNoise({quotes:history,now:history.at(-1).ts,horizonSeconds:30});
   assert.ok(Math.abs(result.expectedLogMove)>=noise*.15-1e-16);
  }
 }
});
test('a coherent observed 180-second trend still produces forecast',()=>{
 const history=quotes(i=>i*.00001+.000006*Math.sin(i*.1));
 const r=fx(history);
 assert.equal(r.ready,true);assert.equal(r.side,'CALL');
 assert.ok(r.expectedSignalToNoise>.15);
});
test('no unseen/future quotes or expired entry timestamps can open a forecast',()=>{
 const history=quotes(i=>i*.00001);
 const r=fx(history,{now:history.at(-1).ts-1});
 assert.equal(r.ready,false);
});
