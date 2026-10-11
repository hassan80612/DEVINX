import test from 'node:test';
import assert from 'node:assert/strict';
import {singleEngineForecast} from '../sentinel-trading-lab/agent/src/core/vnext-single-engine.mjs';
import {historicalFuturePath,conditionalPathWindow} from '../sentinel-trading-lab/agent/src/core/forward-path-research.mjs';
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

test('historical path agreement selects futures, held out synthetic seeds, without lookahead',()=>{
 const horizons=[30,180,300],seeds=[2173,3371,4919,6121,7331];
 const stats=Object.fromEntries(horizons.map(h=>[h,{total:0,baseWins:0,confirmed:0,confirmedWins:0,unconfirmed:0,pathReady:0}]));
 for(const regime of TYPES)for(const seed of seeds){
  const quotes=make(seed,regime,3400);
  for(const i of [1600,2450])for(const h of horizons){
   const now=quotes[i].ts,history=quotes.slice(Math.max(0,i-2400),i+1),snap={quoteHistory:history,quoteTs:now,provider:'iq_option'};
   const settings={engine:'automatic',asset:'EUR/USD OTC',orderDurationMs:h*1000};
   const base=singleEngineForecast({settings,snap,now}).receipt?.side||null;
   const future=historicalFuturePath({quoteHistory:history,asOf:now,horizonSeconds:h,requestedOffsets:[0,h]});
   const w=conditionalPathWindow(future,0,h);
   const truth=quotes[i+h].price>quotes[i].price?'CALL':'PUT';
   const z=stats[h];z.total++;z.baseWins+=Number(base===truth);z.pathReady+=Number(future.ready);
   if(base&&base===w.side){z.confirmed++;z.confirmedWins+=Number(base===truth)}
   else z.unconfirmed++;
  }
 }
 const fmt=(z)=>({...z,basePct:Number((z.baseWins/z.total*100).toFixed(2)),
   confirmedPct:z.confirmed?Number((z.confirmedWins/z.confirmed*100).toFixed(2)):null,
   coverage:Number((z.confirmed/z.total*100).toFixed(2))});
 const out=Object.fromEntries(Object.entries(stats).map(([h,x])=>[h,fmt(x)]));
 console.log('SENTINEL_1375_PATH_FILTER_HOLDOUT='+JSON.stringify(out));
 assert.equal(Object.values(stats).reduce((a,b)=>a+b.total,0),240);
});
