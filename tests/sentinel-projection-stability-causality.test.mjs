import test from 'node:test';
import assert from 'node:assert/strict';
import {ProjectionWindowStability} from '../experiments/projection-window-stability-20261017.mjs';
import {stabilityResearchRuntime} from '../experiments/stability-research-runtime-20261017.mjs';
import {DemoTradingRuntime as Released} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const T=1792250040000;
const quotes=Array.from({length:421},(_,i)=>({ts:T+i*1000,receivedAt:T+i*1000,
 price:1.1+.00032*Math.sin(i/(17+4*Math.sin(i/130)))+.000025*Math.sin(i/3)}));
function gate(runtime,history,i){const q=quotes[i],settings={...runtime.settings,engine:'automatic',asset:'EUR/USD',orderDurationMs:30000};
 return runtime._signalValidationGate({analysis:{asset:settings.asset},settings,now:q.ts,
  snap:{provider:'iq_option',quoteHistory:history,price:q.price,quoteTs:q.ts}}).analysis.vnext;
}
test('isolated integration is identical to released runtime when no experimental selector is installed',async()=>{
 const {DemoTradingRuntime,cleanup}=await stabilityResearchRuntime();
 try{
  const before=new Released({enableVNext:true,forecastModel:'now-structural-v1'}),after=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
  for(let i=180;i<=260;i++)assert.deepEqual(gate(after,quotes.slice(0,i+1),i),gate(before,quotes.slice(0,i+1),i));
 }finally{cleanup();}
});
for(const mode of ['median','gate'])test(`${mode}: future quotes cannot alter observations, emitted entries or outcome evidence`,async()=>{
 const {DemoTradingRuntime,cleanup}=await stabilityResearchRuntime();
 try{
  const make=()=>{const r=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});r.expiryDirectionSelector=new ProjectionWindowStability({mode});return r;};
  const a=make(),b=make();
  for(let i=180;i<=300;i++){
   const past=quotes.slice(0,i+1),future=quotes.slice(i+1).map(q=>({...q,price:q.price*1.3}));
   assert.deepEqual(gate(b,[...past,...future],i),gate(a,past,i),`quote ${i}`);
  }
 }finally{cleanup();}
});
