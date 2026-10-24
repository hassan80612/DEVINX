// EXPERIMENT ONLY: competing path evidence at an actual quote; NEVER dispatches trades.
// This module is intentionally not imported by the production runtime.
// A direction becomes a candidate only after several independent observed horizons
// agree. A one/two-second wick cannot overrule a 60-second expiry by itself.
const sideOf=n=>n>0?'CALL':n<0?'PUT':null;
const signOf=side=>side==='CALL'?1:side==='PUT'?-1:0;
const positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
// Duration-specific clocks. A 5-second trade must not depend on 60 seconds of
// history; a five-minute trade must not be judged solely by a five-second wick.
export const EXPIRY_PATH_WINDOWS=Object.freeze({
 5000:[1,2,3,5],15000:[2,5,10,15],30000:[3,8,15,30],
 60000:[5,15,30,60],120000:[10,30,60,120],300000:[20,60,120,300]
});
const median=a=>{const b=[...a].sort((x,y)=>x-y);return b.length?b[Math.floor(b.length/2)]:null;};

export function compareMarketPaths({
 quoteHistory=[],quoteAt,now=quoteAt,price,durationMs=60000,
 reaction=null,support=null,resistance=null
}={}){
 const stamp=Number(quoteAt),clock=Number(now),spot=Number(price),expiry=Number(durationMs);
 const horizons=EXPIRY_PATH_WINDOWS[expiry]||null;
 const quoteFreshLimit=expiry<=5000?800:expiry<=15000?1000:1500;
 const neutral=(reason,extra={})=>({source:'causal-competing-path-v1',ready:false,
  hypothesisSide:null,scenario:'UNRESOLVED',reason,...extra});
 if(!(positive(spot)&&stamp>0&&clock>=stamp&&clock-stamp<=quoteFreshLimit&&
    horizons))return neutral('stale-or-invalid-market');
 const byTime=new Map();
 for(const row of Array.isArray(quoteHistory)?quoteHistory:[]){
  const ts=Number(row?.ts),received=Number(row?.receivedAt??ts),p=Number(row?.price);
  if(!(ts>=stamp-horizons.at(-1)*1000-4000&&ts<=stamp&&received<=clock&&positive(p)))continue;
  if(!byTime.has(ts))byTime.set(ts,{ts,price:p});
 }
 const q=[...byTime.values()].sort((a,b)=>a.ts-b.ts);
 if(q.at(-1)?.ts!==stamp||q.at(-1)?.price!==spot)return neutral('unverified-current-quote');
 const earlier=sec=>{
  const target=stamp-sec*1000;
  for(let i=q.length-1;i>=0;i--)
   if(q[i].ts<=target)return target-q[i].ts<=1500?q[i].price:null;
  return null;
 };
 // Only observed levels. Missing coverage is unknown, not zero movement.
 const at=Object.fromEntries(horizons.map(s=>[s,earlier(s)]));
 const windows=Object.fromEntries(Object.entries(at).map(([key,start])=>{
  if(!positive(start))return [key,{available:false,side:null,move:null}];
  const move=spot-start;
  return [key,{available:true,side:sideOf(move),move}];
 }));
 if(!horizons.every(s=>windows[s].available))
  return neutral('incomplete-causal-horizons',{windows});
 const window=q.filter(row=>row.ts>=stamp-horizons.at(-1)*1000);
 const allowedGap=expiry<=5000?1400:expiry<=15000?1800:expiry>=120000?3500:2500;
 if(window.some((p,i)=>i>0&&p.ts-window[i-1].ts>allowedGap))
  return neutral('gapped-feed',{windows});
 const moves=window.slice(1).map((p,i)=>Math.abs(p.price-window[i].price))
  .filter(p=>p>0);
 const typical=Math.max(median(moves)||0,spot*1e-8);
 if(!(typical>0))return neutral('flat-feed',{windows});
 const [a,b,c,d]=horizons.map(x=>windows[x]);
 // Scale the evidence to the actual number of observed seconds.
 // A 1-second path on a 5s expiry cannot contain 1.5 seconds of travel.
 const strength=[1.5,3,5,8].map((v,i)=>Math.min(v,horizons[i]));
 const shortAgree=a.side&&a.side===b.side&&
  Math.abs(a.move)>=typical*strength[0]-.000000000001&&
  Math.abs(b.move)>=typical*strength[1]-.000000000001;
 const longAgree=c.side&&c.side===d.side&&
  Math.abs(c.move)>=typical*strength[2]-.000000000001&&
  Math.abs(d.move)>=typical*strength[3]-.000000000001;
 const ahead=side=>{
  const level=side==='CALL'?Number(resistance?.level):Number(support?.level);
  if(!positive(level))return null;
  return signOf(side)*(level-spot);
 };
 const clearRoom=side=>{
  const room=ahead(side);
  // No claimed confirmation without a measured next historical wall.
  return room!==null&&room>Math.abs(b.move)*1.15+typical*4;
 };
 // Second independent diagnostic: the direction may still be up while the
 // immediate impulse has already faded. Report this measured divergence,
 // NEVER replace it with a fabricated win probability or broker settlement.
 const shortRate=Math.abs(a.move)/horizons[0];
 const longRate=Math.abs(c.move)/horizons[2];
 const velocityRatio=longRate>0?shortRate/longRate:null;
 let travelled=0;
 for(let i=1;i<window.length;i++)travelled+=Math.abs(window[i].price-window[i-1].price);
 const efficiency=travelled>0?Math.min(1,Math.abs(d.move)/travelled):null;
 const impulseState=a.side&&a.side===b.side&&a.side===c.side?
  velocityRatio!==null&&velocityRatio<=.4?'FADING':
  velocityRatio!==null&&velocityRatio>=1.35?'ACCELERATING':'STEADY':
  a.side&&c.side&&a.side!==c.side?'COUNTERTREND_REACTION':'MIXED';
 const observation={windows,horizons,expiryMs:expiry,typicalStep:typical,
  measuredRoomCall:ahead('CALL'),measuredRoomPut:ahead('PUT'),
  impulseState,velocityRatio,efficiency};
 const aligned=shortAgree&&longAgree&&a.side===d.side&&clearRoom(a.side);
 // Breakouts require an already-observed retest and strength on both
 // short and holding-time horizons; merely crossing a level is insufficient.
 const observedBreakout=reaction?.kind==='breakout'&&
  reaction?.side===a.side&&positive(Number(reaction?.zone?.level))&&
  Number(reaction?.zone?.touches)>=2&&positive(Number(reaction?.zoneTolerance))&&
  Math.abs(spot-Number(reaction.zone.level))<=
   Math.max(Number(reaction.zoneTolerance)*4,Math.abs(b.move)*2);
 if(aligned&&observedBreakout)
  return {source:'causal-competing-path-v1',ready:true,
    hypothesisSide:a.side,scenario:'CONFIRMED_BREAKOUT',
    reason:'level-breakout-confirmed-across-expiry-horizons',...observation};
 if(aligned)
  return {source:'causal-competing-path-v1',ready:true,
    hypothesisSide:a.side,scenario:'CONFIRMED_CONTINUATION',
    reason:'aligned-expiry-specific-horizons-with-measured-room',...observation};
 const supportedTurn=reaction?.kind==='rejection'&&
  ['CALL','PUT'].includes(reaction?.side)&&
  positive(Number(reaction.zone?.level))&&
  Number(reaction.zone?.touches)>=2&&
  positive(Number(reaction.zoneTolerance))&&
  Math.abs(spot-Number(reaction.zone.level))<=Number(reaction.zoneTolerance)*2;
 if(shortAgree&&longAgree&&a.side!==d.side&&supportedTurn&&
    reaction.side===a.side&&clearRoom(a.side))
  return {source:'causal-competing-path-v1',ready:true,
    hypothesisSide:a.side,scenario:'CONFIRMED_LEVEL_REVERSAL',
    reason:'short-path-turn-near-level-opposes-long-path-with-room',...observation};
 return neutral('competing-paths-not-confirmed',observation);
}
