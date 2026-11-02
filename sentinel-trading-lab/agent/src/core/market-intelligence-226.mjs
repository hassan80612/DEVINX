// Sentinel 226 — causal and advisory market evidence for 30s, 1m and 5m.
// Pure computations on already observed bars. No timers, broker calls, expiry
// setters, order dispatch or mandatory admission rules.
import {rsi} from './indicators.mjs';
const finite=v=>Number.isFinite(Number(v));
const rounded=v=>Math.round(v*100)/100;
const validBar=c=>c&&[c.high,c.low,c.close].every(finite)&&
  Number(c.high)>=Number(c.low)&&Number(c.high)>0&&Number(c.low)>0;
export function adxDmi(bars=[],period=14){
 const p=Math.max(5,Math.min(30,Math.floor(Number(period)||14)));
 const rows=(Array.isArray(bars)?bars:[]).slice(-(p*7+1)).filter(validBar);
 const notReady={ready:false,adx:null,plusDi:null,minusDi:null,direction:'NEUTRO',strength:'unknown'};
 if(rows.length<2*p+1)return notReady;
 const tr=[],plus=[],minus=[];
 for(let i=1;i<rows.length;i++){
  const a=rows[i-1],b=rows[i];
  const up=Number(b.high)-Number(a.high),down=Number(a.low)-Number(b.low);
  plus.push(up>down&&up>0?up:0);
  minus.push(down>up&&down>0?down:0);
  tr.push(Math.max(Number(b.high)-Number(b.low),
   Math.abs(Number(b.high)-Number(a.close)),Math.abs(Number(b.low)-Number(a.close))));
 }
 let smoothTR=0,smoothPlus=0,smoothMinus=0,adx=null,dxSeen=0;
 for(let i=0;i<tr.length;i++){
  if(i<p){smoothTR+=tr[i];smoothPlus+=plus[i];smoothMinus+=minus[i]}
  else {
   smoothTR=smoothTR-smoothTR/p+tr[i];
   smoothPlus=smoothPlus-smoothPlus/p+plus[i];
   smoothMinus=smoothMinus-smoothMinus/p+minus[i];
  }
  if(i<p-1)continue;
  const pd=smoothTR>0?100*smoothPlus/smoothTR:0;
  const md=smoothTR>0?100*smoothMinus/smoothTR:0;
  const dx=pd+md>0?100*Math.abs(pd-md)/(pd+md):0;
  if(dxSeen<p)adx=(adx||0)+dx/p;
  else adx=((adx||0)*(p-1)+dx)/p;
  dxSeen++;
 }
 if(dxSeen<p||adx===null)return notReady;
 const plusDi=smoothTR>0?100*smoothPlus/smoothTR:0;
 const minusDi=smoothTR>0?100*smoothMinus/smoothTR:0;
 const diff=plusDi-minusDi;
 const direction=Math.abs(diff)>=2?(diff>0?'CALL':'PUT'):'NEUTRO';
 return {ready:true,adx:rounded(adx),plusDi:rounded(plusDi),
   minusDi:rounded(minusDi),direction,
   strength:adx>=25?'strong':adx>=18?'developing':'weak'};
}
// Confirmed pivots only: at least two bars to the RIGHT of the pivot.
// Divergence is advisory, never an unconditional CALL/PUT order.
export function confirmedRsiDivergence(bars=[],period=7){
 const rows=(Array.isArray(bars)?bars:[]).filter(validBar).slice(-140);
 const p=Math.max(5,Math.min(21,Math.floor(Number(period)||7)));
 if(rows.length<2*p+6)return {ready:false,side:null,kind:null};
 const closes=rows.map(c=>Number(c.close)),tops=[],bottoms=[];
 const indicatorAt=i=>rsi(closes.slice(0,i+1),p);
 for(let i=p+1;i<rows.length-2;i++){
  const window=rows.slice(i-2,i+3),hi=Number(rows[i].high),lo=Number(rows[i].low);
  const top=window.every((v,j)=>j===2||Number(v.high)<hi);
  const bottom=window.every((v,j)=>j===2||Number(v.low)>lo);
  const value=indicatorAt(i);
  if(value==null||!Number.isFinite(value))continue;
  if(top)tops.push({i,price:hi,rsi:value});
  if(bottom)bottoms.push({i,price:lo,rsi:value});
 }
 const compare=(pts,side)=>{
  if(pts.length<2)return null;
  const [a,b]=pts.slice(-2);
  if(rows.length-1-b.i>10||b.i-a.i<3)return null;
  const priceGap=Math.abs(b.price-a.price)/Math.max(b.price,1e-12);
  if(priceGap<.00003)return null;
  if(side==='PUT'&&b.price>a.price&&b.rsi<a.rsi-4)return {side,kind:'bearish',atIndex:b.i,priorRsi:rounded(a.rsi),latestRsi:rounded(b.rsi)};
  if(side==='CALL'&&b.price<a.price&&b.rsi>a.rsi+4)return {side,kind:'bullish',atIndex:b.i,priorRsi:rounded(a.rsi),latestRsi:rounded(b.rsi)};
  return null;
 };
 const bearish=compare(tops,'PUT'),bullish=compare(bottoms,'CALL');
 if(bearish&&bullish)return {ready:false,side:null,kind:'conflicting'};
 return {ready:true,...(bearish||bullish||{side:null,kind:null})};
}
// Current bar is a live quote bucket; previous buckets are already finished.
// Recognize a small pullback and a live resumption without waiting for a
// new closed candle. The caller still owns price, wall and exhaustion guards.
export function pullbackResumption(bars=[],{tolerance=0,fast=null,slow=null}={}){
 const rows=(Array.isArray(bars)?bars:[]).filter(validBar).slice(-6);
 if(rows.length<5)return {call:false,put:false};
 const closes=rows.map(c=>Number(c.close));
 const at=closes.length-1,one=closes[at-1],two=closes[at-2],four=closes[at-4],spot=closes[at];
 const tol=Math.max(Math.abs(Number(tolerance)||0)*.08,Math.abs(spot)*.000003);
 const call=Number(fast)>=Number(slow)&&two>four+tol&&one<two-tol&&spot>one+tol&&spot<=two+tol*2;
 const put=Number(fast)<=Number(slow)&&two<four-tol&&one>two+tol&&spot<one-tol&&spot>=two-tol*2;
 return {call:!!call,put:!!put};
}
