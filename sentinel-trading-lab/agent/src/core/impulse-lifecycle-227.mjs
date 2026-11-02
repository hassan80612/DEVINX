// Sentinel 227 — causal impulse lifecycle, not a forecast of a future candle.
// Gives an independently verified first reversal an alternative to a late
// continuation. No wait, expiry setter, risk bypass or broker interaction.
import {entryFamilyOf} from './entry-family.mjs';
import {levelRoleEvidence} from './level-role-evidence.mjs';
const d=side=>side==='CALL'?1:side==='PUT'?-1:0;
const positive=x=>Number.isFinite(Number(x))&&Number(x)>0;
const median=xs=>{const s=[...xs].sort((a,b)=>a-b);return s[Math.floor(s.length/2)]||0};
function tape(source,at,clock,spot){
 const out=[];let last=-Infinity;
 for(const q of Array.isArray(source)?source:[]){
  const ts=Number(q?.ts),received=Number(q?.receivedAt??ts),p=Number(q?.price);
  if(ts<at-14000||ts>at||received>clock||!positive(p))continue;
  if(ts<=last)return null;
  last=ts;out.push({ts,price:p});
 }
 if(out.length<10||out.at(-1).ts!==at||out.at(-1).price!==spot||
  out.some((q,i)=>i>0&&q.ts-out[i-1].ts>2400))return null;
 return out;
}
// Read the sequence of velocity -> exhaustion -> observed opposing reaction.
// It does not vote CALL/PUT merely because an impulse was fast. A single
// opposing tick has no authority. The magnitude is measured in actual feed
// ticks, not a fabricated universal price threshold.
export function observedImpulsePhase({quoteHistory=[],quoteAt,now=quoteAt,price,
 durationMs=60000}={}){
 const at=Number(quoteAt),clock=Number(now),spot=Number(price);
 const empty={ready:false,phase:'unknown',impulseSide:null,turnSide:null};
 if(![30000,60000,300000].includes(Number(durationMs))||!(at>0&&clock>=at&&clock-at<=2500&&positive(spot)))return empty;
 const rows=tape(quoteHistory,at,clock,spot);
 if(!rows)return empty;
 const steps=rows.slice(1).map((p,i)=>p.price-rows[i].price),abs=steps.map(Math.abs).filter(x=>x>0);
 if(abs.length<7)return empty;
 const typical=Math.max(median(abs),spot*1e-8);
 const start=rows[0],highest=rows.reduce((a,b)=>b.price>a.price?b:a),lowest=rows.reduce((a,b)=>b.price<a.price?b:a);
 const net=spot-start.price;
 const impulseSide=net>typical*3?'CALL':net< -typical*3?'PUT':null;
 if(!impulseSide)return {...empty,ready:true,phase:'range'};
 const sign=d(impulseSide),peak=sign>0?highest:lowest;
 const travelled=steps.reduce((a,s)=>a+Math.abs(s),0);
 const efficiency=Math.abs(net)/Math.max(travelled,1e-12);
 const giveback=sign*(peak.price-spot);
 const turnSteps=steps.slice(-3),against=turnSteps.filter(x=>sign*x<0).length;
 const follow=sign*(spot-rows.at(-4).price);
 const recentVelocity=sign*(spot-rows.at(-3).price)/Math.max(1,(at-rows.at(-3).ts)/1000);
 const previousVelocity=sign*(rows.at(-3).price-rows.at(-6).price)/
  Math.max(1,(rows.at(-3).ts-rows.at(-6).ts)/1000);
 let phase='developing';
 if(giveback>=typical*2.5&&against>=2&&follow< -typical*1.3)
  phase='reversal-observed';
 else if(giveback>typical*1.5||recentVelocity<previousVelocity*.32)
  phase='exhausting';
 else if(recentVelocity>previousVelocity*1.2&&efficiency>.35)
  phase='accelerating';
 return {ready:true,phase,impulseSide,
  turnSide:phase==='reversal-observed'?(impulseSide==='CALL'?'PUT':'CALL'):null,
  typicalStep:typical,giveback,efficiency,
  recentVelocity,previousVelocity,extremeAt:peak.ts};
}
// A "violent candle" reversing is an OPPORTUNITY, not an automatic trade:
// first a historical level with independently tested directional role, then
// two real current-quote confirmations near its extreme. This allows a NEW
// reversal to outrank an already qualified OLD continuation without assuming
// that all fast candles reverse or waiting for several closed bars.
export function reviewFirstImpulseReversal({candidate,map,quoteHistory=[],quoteAt,
 now=quoteAt,price,durationMs}={}){
 const at=Number(quoteAt),clock=Number(now),spot=Number(price),ms=Number(durationMs);
 if(!candidate||![30000,60000].includes(ms)||!(at>0&&clock>=at&&
  clock-at<=(ms===30000?1450:1950)&&positive(spot))||
  !(map?.observedCandles>=20&&map.asOf<=at&&at-map.asOf<=180000&&
  positive(map.tolerance)&&Array.isArray(map.levels)))return candidate;
 if(candidate.ready===true&&entryFamilyOf(candidate)!=='continuation')return candidate;
 const rows=tape(quoteHistory,at,clock,spot);
 if(!rows)return candidate;
 const tol=Number(map.tolerance),steps=rows.slice(1).map((q,i)=>q.price-rows[i].price);
 const changes=steps.map(Math.abs).filter(x=>x>0);
 if(changes.length<7)return candidate;
 const typical=Math.max(median(changes),spot*1e-8);
 const options=[];
 for(const side of ['CALL','PUT']){
  const sign=d(side);
  // Prior price must approach the old level AGAINST the new direction.
  const extreme=rows.reduce((best,q,i)=>sign*q.price<sign*rows[best].price?i:best,0);
  const peak=rows[extreme],age=at-peak.ts;
  if(!(age>=1800&&age<=8000&&extreme>=3&&extreme<=rows.length-3))continue;
  if(!(sign*(peak.price-rows[0].price)<=-Math.max(tol*.43,typical*2)))continue;
  const last3=rows.slice(-3);
  if(!(last3.every((q,i)=>i===0||sign*(q.price-last3[i-1].price)>0)))continue;
  const departure=sign*(spot-peak.price);
  // First impulse turn, not chase two candles after the swing.
  if(!(departure>=Math.max(tol*.55,typical*3)&&departure<=tol*1.65))continue;
  const alreadyAway=rows.slice(extreme+1,-2);
  if(alreadyAway.length>=2&&alreadyAway.some(q=>sign*(q.price-peak.price)>tol*1.7))continue;
  // A late weak tick after huge continuation cannot manufacture a pivot.
  const quick=sign*(spot-rows.at(-3).price);
  if(!(quick>=Math.max(typical*1.3,tol*.16)))continue;
  for(const level of map.levels){
   const role=levelRoleEvidence(level,side);
   if(!(role.known&&role.pivots>=1&&(role.pivots>=2||role.rejections>=1)&&
    Number(level.independentTests)>=2&&level.tests?.some(t=>Number(t.age)>=10)))continue;
   const priceLevel=Number(level.level),lo=Number(level.low),hi=Number(level.high);
   if(!(positive(priceLevel)&&Number.isFinite(lo)&&Number.isFinite(hi)&&
     peak.price>=lo-tol*.55&&peak.price<=hi+tol*.55))continue;
   // Do not label an ACTUAL breakout of old support/resistance a reversal.
   if(side==='CALL'&&rows.slice(extreme).some(q=>q.price<lo-tol*.48))continue;
   if(side==='PUT'&&rows.slice(extreme).some(q=>q.price>hi+tol*.48))continue;
   if(!(sign*(spot-priceLevel)>=-tol*.35&&sign*(spot-priceLevel)<=tol*1.65))continue;
   options.push({side,level:priceLevel,extreme:peak.price,firstBreak:rows[extreme+1].price,
    retest:rows.at(-2).price,observedAt:at,velocity:quick,departure});
  }
 }
 if(options.length!==1)return candidate;
 const proof=options[0];
 if(candidate.ready===true&&candidate.side===proof.side)return candidate;
 return {...candidate,ready:true,side:proof.side,observedAt:at,entryPrice:spot,
  predictedPrice:null,expectedLogMove:null,reason:'confirmed-level-structure-reversal',
  priceStructure:{...(candidate.priceStructure||{}),confirmedReversal:{
   kind:'confirmed-level-structure-reversal',side:proof.side,confirmedAt:at,
   level:{level:proof.level},microTurn:{extreme:proof.extreme,
    firstBreak:proof.firstBreak,retest:proof.retest,observedAt:at}}},
  earlyTurnEvidence:{kind:'level-microstructure-first-turn',
   withoutThreeClosedBars:true,impulsePhase:'observed-first-turn'}};
}
