// EXPERIMENT ONLY: competing path evidence at an actual quote; NEVER dispatches trades.
// This module is intentionally not imported by the production runtime.
// A direction becomes a candidate only after several independent observed horizons
// agree. A one/two-second wick cannot overrule a 60-second expiry by itself.
const sideOf=n=>n>0?'CALL':n<0?'PUT':null;
const signOf=side=>side==='CALL'?1:side==='PUT'?-1:0;
const positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const median=a=>{const b=[...a].sort((x,y)=>x-y);return b.length?b[Math.floor(b.length/2)]:null;};

export function compareMarketPaths({
 quoteHistory=[],quoteAt,now=quoteAt,price,durationMs=60000,
 reaction=null,support=null,resistance=null
}={}){
 const stamp=Number(quoteAt),clock=Number(now),spot=Number(price),expiry=Number(durationMs);
 const neutral=(reason,extra={})=>({source:'causal-competing-path-v1',ready:false,
  hypothesisSide:null,scenario:'UNRESOLVED',reason,...extra});
 if(!(positive(spot)&&stamp>0&&clock>=stamp&&clock-stamp<=1500&&
    expiry>=30000&&expiry<=300000))return neutral('stale-or-invalid-market');
 const byTime=new Map();
 for(const row of Array.isArray(quoteHistory)?quoteHistory:[]){
  const ts=Number(row?.ts),received=Number(row?.receivedAt??ts),p=Number(row?.price);
  if(!(ts>=stamp-90000&&ts<=stamp&&received<=clock&&positive(p)))continue;
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
 const at=Object.fromEntries([5,15,30,60].map(s=>[s,earlier(s)]));
 const windows=Object.fromEntries(Object.entries(at).map(([key,start])=>{
  if(!positive(start))return [key,{available:false,side:null,move:null}];
  const move=spot-start;
  return [key,{available:true,side:sideOf(move),move}];
 }));
 if(![5,15,30,60].every(s=>windows[s].available))
  return neutral('incomplete-causal-horizons',{windows});
 const window=q.filter(row=>row.ts>=stamp-60000);
 if(window.some((p,i)=>i>0&&p.ts-window[i-1].ts>2500))
  return neutral('gapped-feed',{windows});
 const moves=window.slice(1).map((p,i)=>Math.abs(p.price-window[i].price))
  .filter(p=>p>0);
 const typical=Math.max(median(moves)||0,spot*1e-8);
 if(!(typical>0))return neutral('flat-feed',{windows});
 const d5=windows[5],d15=windows[15],d30=windows[30],d60=windows[60];
 const shortAgree=d5.side&&d5.side===d15.side&&
  Math.abs(d5.move)>=typical*1.5&&Math.abs(d15.move)>=typical*3;
 const longAgree=d30.side&&d30.side===d60.side&&
  Math.abs(d30.move)>=typical*5&&Math.abs(d60.move)>=typical*8;
 const ahead=side=>{
  const level=side==='CALL'?Number(resistance?.level):Number(support?.level);
  if(!positive(level))return null;
  return signOf(side)*(level-spot);
 };
 const clearRoom=side=>{
  const room=ahead(side);
  // No claimed confirmation without a measured next historical wall.
  return room!==null&&room>Math.abs(d15.move)*1.15+typical*4;
 };
 const observation={windows,typicalStep:typical,
  measuredRoomCall:ahead('CALL'),measuredRoomPut:ahead('PUT')};
 if(shortAgree&&longAgree&&d5.side===d60.side&&clearRoom(d5.side))
  return {source:'causal-competing-path-v1',ready:true,
    hypothesisSide:d5.side,scenario:'CONFIRMED_CONTINUATION',
    reason:'aligned-5-15-30-60s-with-measured-room',...observation};
 const supportedTurn=reaction?.kind==='rejection'&&
  ['CALL','PUT'].includes(reaction?.side)&&
  positive(Number(reaction.zone?.level))&&
  Number(reaction.zone?.touches)>=2&&
  positive(Number(reaction.zoneTolerance))&&
  Math.abs(spot-Number(reaction.zone.level))<=Number(reaction.zoneTolerance)*2;
 if(shortAgree&&longAgree&&d5.side!==d60.side&&supportedTurn&&
    reaction.side===d5.side&&clearRoom(d5.side))
  return {source:'causal-competing-path-v1',ready:true,
    hypothesisSide:d5.side,scenario:'CONFIRMED_LEVEL_REVERSAL',
    reason:'5-15s-turn-near-confirmed-level-opposes-30-60s-with-room',...observation};
 return neutral('competing-paths-not-confirmed',observation);
}
