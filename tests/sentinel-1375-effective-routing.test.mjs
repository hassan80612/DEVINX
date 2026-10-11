import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveForecastOwner} from '../sentinel-trading-lab/agent/src/core/effective-forecast-owner.mjs';
import {singleEngineForecast} from '../sentinel-trading-lab/agent/src/core/vnext-single-engine.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const TYPES=['trend','range','cycle','reversal','false-break','breakout','volatility','random'];
const EPOCH=1800000000000;
function make(seed,type,n=3300){
 let state=seed>>>0,p=Math.log(1.1),d=0,origin=p;
 const rand=()=>((state=(1664525*state+1013904223)>>>0)+1)/4294967297;
 const quotes=[];
 for(let t=0;t<n;t++){
  const u=rand(),v=rand(),w=rand(),z=Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
  let m=z*.000012;
  if(type==='trend')m+=(t%1430<850?.0000036:-.0000045)+.28*d;
  if(type==='range')m+=-.085*(p-origin)-.4*d;
  if(type==='cycle'){
   const per=68+seed%40, f=i=>.00054*Math.sin(i*2*Math.PI/per+.3*seed)+.00014*Math.sin(i*2*Math.PI/(per*.52));
   m+=f(t)-f(t-1);
  }
  if(type==='reversal')m+=(Math.floor(t/164)%2?-.000006:.000006)+.16*d;
  if(type==='false-break')m+=((t%210)<21?.000013:(t%210)<53?-.000012:0)-.035*(p-origin);
  if(type==='breakout')m+=((t%390)<70?.00000015:(t%390)<150?.000007:0)+.12*d;
  if(type==='volatility'){const phase=t%700;
   m+=z*(phase>250&&phase<510?.000023:.000002)+(w<.022?(v<.5?-1:1)*.00010:0)-.29*d-.025*(p-origin);
  }
  d=m;p+=m;quotes.push({ts:EPOCH+t*1000,price:Math.exp(p)});
 }
 return quotes;
}

test('manual owner stays manually selected; disabled automatic keeps original',()=>{
 const q=make(2173,'trend'),i=2500,now=q[i].ts,snap={quoteHistory:q.slice(0,i+1),quoteTs:now,provider:'iq_option'};
 for(const engine of ['price_action','mean_reversion','trend','breakout']){
  const got=resolveForecastOwner({settings:{engine,orderDurationMs:180000},snap,now});
  assert.equal(got.effectiveEngine,engine);assert.equal(got.switched,false);
 }
 const off=resolveForecastOwner({settings:{engine:'automatic',autoRoutingEnabled:false,orderDurationMs:180000},snap,now});
 assert.equal(off.effectiveEngine,'automatic');assert.equal(off.switched,false);
});
test('actual main receipt reflects effective owner, holding and expiry (without changing broker commands)',()=>{
 const q=make(2173,'trend'),i=2500,now=q[i].ts,snap={quoteHistory:q.slice(0,i+1),quoteTs:now,provider:'iq_option'};
 const rt=new DemoTradingRuntime({enableVNext:true});
 rt.patchSettings({engine:'automatic',autoRoutingEnabled:true,orderDurationMs:180000});
 const result=rt._signalValidationGate({settings:rt.settings,analysis:{side:'WAIT'},snap,now});
 const owner=result.analysis.vnext.forecastOwner;
 assert.ok(owner);assert.equal(result.allowed,false);assert.equal(rt.settings.engine,'automatic');
 assert.equal(result.analysis.vnext.engineId,owner.effectiveEngine);
 if(result.analysis.vnext.receipt)assert.equal(result.analysis.vnext.receipt.engineId,owner.effectiveEngine);
 assert.equal(result.analysis.vnext.expirySeconds,180);assert.equal(rt.settings.demoAutopilot,false);
});
test('new unseen synthetic paths, same times/horizons: report actual effects against original automatic',()=>{
 const horizons=[30,180,300],seeds=[2173,3371,4919,6121,7331];
 const byH={};const byPhase={};let originalWins=0,routedWins=0,total=0,switched=0;
 for(const h of horizons)byH[h]={base:0,route:0,n:0,switched:0};
 for(const regime of TYPES)for(const seed of seeds){
  const quotes=make(seed,regime,3400);
  for(const i of [1600,2450])for(const h of horizons){
   const now=quotes[i].ts,snap={quoteHistory:quotes.slice(Math.max(0,i-2400),i+1),quoteTs:now,provider:'iq_option'};
   const settings={asset:'EUR/USD OTC',engine:'automatic',autoRoutingEnabled:true,orderDurationMs:h*1000};
   const owner=resolveForecastOwner({settings,snap,now});
   const base=singleEngineForecast({settings,snap,now}).receipt?.side||null;
   const eff=singleEngineForecast({settings:{...settings,engine:owner.effectiveEngine},snap,now}).receipt?.side||null;
   const truth=quotes[i+h].price>quotes[i].price?'CALL':'PUT';
   assert.ok(base==='CALL'||base==='PUT');assert.ok(eff==='CALL'||eff==='PUT');
   const x=byH[h];x.n++;total++;x.base+=Number(base===truth);x.route+=Number(eff===truth);originalWins+=Number(base===truth);routedWins+=Number(eff===truth);
   if(owner.switched){switched++;x.switched++}
   const k=regime+'_'+h;const p=byPhase[k]||{n:0,b:0,r:0,switched:0};p.n++;p.b+=Number(base===truth);p.r+=Number(eff===truth);p.switched+=Number(owner.switched);byPhase[k]=p;
  }
 }
 const pct=(wins,n)=>Number((100*wins/n).toFixed(2));
 console.log('SENTINEL_1375_ROUTING_HOLDOUT='+JSON.stringify({total,switched,baselinePct:pct(originalWins,total),routedPct:pct(routedWins,total),byH:Object.fromEntries(Object.entries(byH).map(([k,v])=>[k,{...v,baselinePct:pct(v.base,v.n),routedPct:pct(v.route,v.n)}])),byPhase}));
 assert.equal(total,horizons.length*TYPES.length*seeds.length*2);
});
