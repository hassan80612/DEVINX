// Research only. One terminal admission decision; never reverses a direction.
// Closed/past quotes classify a regime; no future outcome is an input.
const validSide=s=>s==='CALL'||s==='PUT';
export function observedRegime({quoteHistory=[],now,quoteAt=now}={}){
 const byTime=new Map();
 for(const q of quoteHistory){
  const ts=Number(q?.ts),received=Number(q?.receivedAt??ts),price=Number(q?.price);
  if(ts>0&&ts<=quoteAt&&ts>=quoteAt-90000&&received>0&&received<=now&&price>0&&Number.isFinite(price)){
   const old=byTime.get(ts);if(!old||received<old.receivedAt)byTime.set(ts,{ts,receivedAt:received,price});
  }
 }
 const qs=[...byTime.values()].sort((a,b)=>a.ts-b.ts);
 const unavailable=reason=>({kind:'unavailable',reason});
 if(!(now>=quoteAt&&now-quoteAt<=1450)||qs.length<45||quoteAt-(qs.at(-1)?.ts??0)>1450||
    qs.at(-1).ts-qs[0].ts<75000)return unavailable('insufficient-current-regime-observations');
 if(qs.some((q,i)=>i&&q.ts-qs[i-1].ts>4000))return unavailable('regime-source-gap');
 let mt=0,mp=0;for(const q of qs){mt+=(q.ts-quoteAt)/1000;mp+=Math.log(q.price);}
 mt/=qs.length;mp/=qs.length;let xx=0,yy=0,xy=0;
 for(const q of qs){const t=(q.ts-quoteAt)/1000-mt,p=Math.log(q.price)-mp;xx+=t*t;yy+=p*p;xy+=t*p;}
 const fit=xx>0&&yy>0?xy*xy/(xx*yy):0;
 const short=qs.filter(q=>q.ts<=quoteAt-6000).at(-1);
 if(!short||quoteAt-6000-short.ts>3000)return unavailable('missing-recent-leg-reference');
 const move=Math.log(qs.at(-1).price/short.price),trendSide=xy>0?'CALL':xy<0?'PUT':null;
 const recentSide=move>0?'CALL':move<0?'PUT':null;
 return {kind:fit>=.60&&trendSide?(recentSide&&recentSide!==trendSide?'pullback':'trend'):'oscillation',
  trendSide,recentSide,fit,observations:qs.length,observedThrough:qs.at(-1).ts};
}
export function finalRegimeArbiter({candidate,projection,quoteHistory,now,quoteAt,durationMs=30000}={}){
 if(durationMs!==30000)return candidate;
 const regime=observedRegime({quoteHistory,now,quoteAt});
 const wait=reason=>({...candidate,ready:false,side:null,provisionalSide:candidate?.side??null,
  reason,finalArbitration:{owner:'single-final-regime-arbiter-v1',regime,admitted:false}});
 if(!candidate?.ready||!validSide(candidate.side))return {...candidate,finalArbitration:{owner:'single-final-regime-arbiter-v1',regime,admitted:false}};
 if(projection?.ready&&validSide(projection.side)&&projection.side!==candidate.side)return wait('unresolved-30s-structure-conflict');
 if(regime.kind==='unavailable')return wait(regime.reason);
 if(regime.kind==='pullback')return wait('trend-retracement-in-progress');
 if(regime.kind==='trend'&&(candidate.side!==regime.trendSide||candidate.side!==regime.recentSide))return wait('direction-not-confirmed-in-current-trend');
 const confirmedTurn=['failed-breakout-structure-change','multiscale-candle-rejection',
  'rejection-followthrough-clear-room','closed-range-extreme-reversal-confirmed'].includes(candidate.reason);
 if(regime.kind==='oscillation'&&(!confirmedTurn||candidate.side!==regime.recentSide))return wait('oscillation-without-aligned-observed-turn');
 return {...candidate,finalArbitration:{owner:'single-final-regime-arbiter-v1',regime,admitted:true}};
}
