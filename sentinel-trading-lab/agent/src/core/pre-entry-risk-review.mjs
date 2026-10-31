// Read-only pre-entry risk review. No outcomes, broker calls, timers or direction overrides.
import {historicalPriceStructure} from './historical-price-structure.mjs';
import {levelRoleEvidence} from './level-role-evidence.mjs';
import {assessDirectionalPersistence} from './now-opportunity-engine.mjs';
import {currentQuoteStructureTurn} from './observed-level-sequence.mjs';
export const POLICY=Object.freeze({version:'202-pre-entry-reviewer-v1',scopeMs:[30000,60000],wallPivots:1,wallRejections:2,roomTolerance:1.25,roomRecentMove:.6,dominantEfficiency:.20,rangeEfficiency:.18,weak20Atr:.20,contraryClosedBodyAtr:.12});
export function evaluatePreEntryRisk({side,reason,price,quoteAt,now,durationMs,quoteHistory=[],candles=[],structure=null}){
 const allowed=()=>({blocked:false,reasons:[],details:{}}),d=side==='CALL'?1:side==='PUT'?-1:0;
 if(!d||!POLICY.scopeMs.includes(durationMs)||!(price>0&&quoteAt>0&&quoteAt<=now&&now-quoteAt<=(durationMs===30000?1450:1950)))return allowed();
 const qs=quoteHistory.filter(q=>q.ts<=quoteAt&&(q.receivedAt??q.ts)<=now&&q.price>0);
 if(qs.at(-1)?.ts!==quoteAt||qs.at(-1)?.price!==price)return allowed();
 const epoch=value=>Number(value)>0?(Number(value)<1e12?Number(value)*1000:Number(value)):0;
 const cs=candles.filter(c=>epoch(c.to)<=quoteAt&&(c.receivedAt??0)<=now);
 // The runtime already has the same closed-candle structure. Reuse it when
 // its last closed candle predates the quote; otherwise use the causal prefix.
 const st=structure?.asOf<=quoteAt?structure:historicalPriceStructure({candles:cs,now:quoteAt});
 const before=seconds=>{const target=quoteAt-seconds*1000;
  for(let i=qs.length-1;i>=0;i--)if(qs[i].ts<=target)return target-qs[i].ts<=2500?qs[i].price:null;
  return null;
 };
 const prior6=before(6),prior20=before(20),prior60=before(60);
 const tol=st.tolerance||0,atr=st.atr||0;
 const moves={six:prior6===null?null:d*(price-prior6),twenty:prior20===null?null:d*(price-prior20),sixty:prior60===null?null:d*(price-prior60)};
 const reasons=[],details={};
 // 1. An opposing zone remains an obstacle through its far edge. An accelerating
 // quote cannot exempt a candidate from an already measured lack of room.
 if(st.candleLevelMap?.asOf<=quoteAt&&tol>0){
  const needed=moves.six===null?null:Math.max(tol*POLICY.roomTolerance,moves.six*POLICY.roomRecentMove);
  const zone=st.candleLevelMap.levels.find(z=>{
   const role=levelRoleEvidence(z,d===1?'PUT':'CALL');if(role.pivots<POLICY.wallPivots||role.rejections<POLICY.wallRejections)return false;
   const inside=price>=z.low&&price<=z.high,gap=d===1?z.low-price:price-z.high;
   return inside||(needed!==null&&gap>=0&&gap<=needed);
  });
  if(zone){reasons.push('opposing-zone-or-insufficient-room');details.wall={low:zone.low,high:zone.high,level:zone.level,roomNeeded:needed};}
 }
 const state=assessDirectionalPersistence({quoteHistory:qs,quoteAt,now,price,durationMs});
 // 2. A fast two-quote bounce against a dominant observed leg needs an
 // independently observable local higher-low/lower-high structure change.
 if(reason==='confirmed-fast-level-reversal'&&state.side&&state.side!==side&&state.efficiency>=POLICY.dominantEfficiency){
  const turn=currentQuoteStructureTurn({quoteHistory:qs,quoteAt,now,price,side,durationMs});
  if(!turn){reasons.push('fast-reversal-against-dominant-leg-without-structure-change');details.counterLeg=state;}
 }
 // 3. A small historical-level breakout in a low-efficiency 20s path is not
 // enough when BOTH the completed candle and the past minute oppose its side.
 const last=cs.filter(c=>epoch(c.to)-epoch(c.from)===60000).sort((a,b)=>epoch(a.to)-epoch(b.to)).at(-1);
 if(reason==='historical-level-breakout'&&last&&atr>0&&moves.twenty!==null&&moves.sixty!==null&&
    state.efficiency<POLICY.rangeEfficiency&&d*(last.close-last.open)<=-atr*POLICY.contraryClosedBodyAtr&&
    moves.sixty<0&&moves.twenty<=atr*POLICY.weak20Atr){
  reasons.push('minor-breakout-without-closed-candle-and-minute-support');details.breakout={moves,lastClosedOpen:last.open,lastClosedClose:last.close,efficiency:state.efficiency};
 }
 return {blocked:reasons.length>0,reasons,details};
}

const labels={
 'opposing-zone-or-insufficient-room':'Zona contrária ainda não superada; entrada sem espaço.',
 'fast-reversal-against-dominant-leg-without-structure-change':'Reversão rápida contra fluxo dominante sem mudança estrutural.',
 'minor-breakout-without-closed-candle-and-minute-support':'Rompimento local sem sustentação da vela fechada e do último minuto.'
};
export function reviewPreEntryRisk({candidate,...input}={}){
 if(candidate?.ready!==true||![30000,60000].includes(Number(input.durationMs))||
   !['CALL','PUT'].includes(candidate.side)||Number(candidate.observedAt)!==Number(input.quoteAt)||
   Number(candidate.entryPrice)!==Number(input.price))return candidate;
 const review=evaluatePreEntryRisk({...input,side:candidate.side,reason:candidate.reason});
 if(!review.blocked)return candidate;
 return {...candidate,ready:false,side:null,provisionalSide:candidate.side,
  reason:labels[review.reasons[0]],entryRisk:{kind:'pre-entry-risk-review',...review}};
}
